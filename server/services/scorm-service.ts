/**
 * SCORM service — import/export of SCORM 1.2 / 2004 packages.
 *
 * Import flow:
 *   1) Receive a .zip buffer
 *   2) Parse imsmanifest.xml at the root to find the launch href +
 *      schema version
 *   3) Extract every file in the zip into the private object-storage
 *      bucket under `scorm/<packageId>/...`
 *   4) Persist a `scorm_packages` row with the entry point, version,
 *      and a manifest summary
 *
 * Export flow:
 *   - Generate a SCORM 1.2 zip from a CourseFull. Each lesson becomes a
 *     simple HTML page; quizzes become a basic auto-grading form. The
 *     bundle includes a SCORM 1.2 imsmanifest.xml + a tiny launch shim
 *     that calls `LMSInitialize` / `LMSFinish` so the exported package
 *     plays back inside any SCORM-conformant LMS.
 */
import JSZip from "jszip";
import crypto from "crypto";
import { XMLParser, XMLBuilder } from "fast-xml-parser";
import { db } from "../db";
import { eq } from "drizzle-orm";
import * as schema from "@shared/schema";
import { normalizeSlides, slideToHtml } from "@shared/slides";
import { objectStorageClient } from "../objectStorage";
import { setObjectAclPolicy } from "../objectAcl";

/**
 * Short-lived launch tokens for the SCORM player. Because the player
 * iframe is sandboxed (`allow-scripts allow-forms allow-popups` with no
 * `allow-same-origin`), the SCO runs in a unique opaque origin and any
 * relative XHR/fetch back to the host is cross-origin and therefore
 * cookieless. A signed token in the URL *path* solves both problems:
 *   - It identifies the package + user without relying on cookies
 *   - Because it lives in the path, every relative URL inside the
 *     package automatically resolves under the same token, so SCOs
 *     that fetch sibling assets (config JSON, images, JS modules,
 *     etc.) keep working.
 * Tokens are HMAC-signed with the session secret and short-lived.
 */
const SCORM_LAUNCH_TTL_MS = 4 * 60 * 60 * 1000; // 4h
function tokenSecret(): string {
  const s = process.env.SCORM_TOKEN_SECRET || process.env.SESSION_SECRET;
  if (!s || s.length < 16) {
    throw new Error(
      "SCORM token secret unavailable: set SESSION_SECRET (>=16 chars) or SCORM_TOKEN_SECRET",
    );
  }
  return s;
}
export interface ScormLaunchClaims { pid: string; uid: string; exp: number }
export function signLaunchToken(pid: string, uid: string): string {
  const exp = Date.now() + SCORM_LAUNCH_TTL_MS;
  const payload = Buffer.from(JSON.stringify({ pid, uid, exp })).toString("base64url");
  const sig = crypto.createHmac("sha256", tokenSecret()).update(payload).digest("base64url");
  return `${payload}.${sig}`;
}
export function verifyLaunchToken(token: string): ScormLaunchClaims | null {
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [payload, sig] = parts;
  const expected = crypto.createHmac("sha256", tokenSecret()).update(payload).digest("base64url");
  // timing-safe compare on equal-length buffers
  if (sig.length !== expected.length) return null;
  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  try {
    const claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf-8")) as ScormLaunchClaims;
    if (!claims.pid || !claims.uid || !claims.exp) return null;
    if (claims.exp < Date.now()) return null;
    return claims;
  } catch {
    return null;
  }
}

export interface ParsedManifest {
  scormVersion: "1.2" | "2004";
  entryPoint: string;
  title: string | null;
  summary: Record<string, any>;
}

const SCORM_PREFIX = "scorm";

/** Strip leading slashes so we always join cleanly under the bucket dir. */
function joinKey(...parts: string[]): string {
  return parts
    .map((p) => p.replace(/^\/+|\/+$/g, ""))
    .filter(Boolean)
    .join("/");
}

function getPrivateDir(): string {
  const dir = process.env.PRIVATE_OBJECT_DIR || "";
  if (!dir) throw new Error("PRIVATE_OBJECT_DIR not set");
  return dir.replace(/\/+$/, "");
}

function parseObjectPath(fullPath: string): { bucketName: string; objectName: string } {
  const path = fullPath.startsWith("/") ? fullPath : `/${fullPath}`;
  const parts = path.split("/");
  if (parts.length < 3) throw new Error(`Invalid object path: ${fullPath}`);
  return { bucketName: parts[1], objectName: parts.slice(2).join("/") };
}

/**
 * Pull the SCORM launch href + version out of `imsmanifest.xml`.
 *
 * SCORM 1.2 / 2004 share the same manifest shape: `<resources>` lists
 * `<resource>` entries; the default organization names a resource via
 * `<item identifierref=...>`. We resolve that identifierref to a
 * resource and use its `href` as the launch entry. If the manifest
 * doesn't follow that shape (missing org / item), we fall back to the
 * first `<resource>`'s href so we still produce a runnable package.
 */
export function parseManifest(xml: string): ParsedManifest {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
    allowBooleanAttributes: true,
    parseAttributeValue: false,
  });
  const doc = parser.parse(xml);
  const manifest = doc.manifest ?? doc["imscp:manifest"];
  if (!manifest) throw new Error("imsmanifest.xml missing <manifest> root");

  // Detect version
  let scormVersion: "1.2" | "2004" = "1.2";
  const metadata = manifest.metadata ?? {};
  const schemaversion =
    metadata.schemaversion ??
    metadata["imsmd:schemaversion"] ??
    metadata?.lom?.schema?.["imsmd:schemaversion"] ??
    "";
  const schemaVersionStr = String(schemaversion || "").toLowerCase();
  if (schemaVersionStr.includes("2004") || schemaVersionStr.includes("cam")) {
    scormVersion = "2004";
  } else if (manifest["@_xmlns:adlcp"]?.includes("adlcp_v1p3")) {
    scormVersion = "2004";
  }

  // Find resources (could be single or array)
  const resourcesNode = manifest.resources ?? manifest["imscp:resources"] ?? {};
  let resources: any[] = resourcesNode.resource ?? resourcesNode["imscp:resource"] ?? [];
  if (!Array.isArray(resources)) resources = [resources];

  const resourceById: Record<string, any> = {};
  for (const r of resources) {
    if (r?.["@_identifier"]) resourceById[r["@_identifier"]] = r;
  }

  // Default organization → first item with identifierref
  const orgsNode = manifest.organizations ?? manifest["imscp:organizations"] ?? {};
  const defaultOrgId = orgsNode["@_default"];
  let orgs: any[] = orgsNode.organization ?? orgsNode["imscp:organization"] ?? [];
  if (!Array.isArray(orgs)) orgs = [orgs];
  const defaultOrg =
    orgs.find((o: any) => o?.["@_identifier"] === defaultOrgId) ?? orgs[0];

  function findFirstItem(node: any): any | null {
    if (!node) return null;
    let items = node.item ?? node["imscp:item"];
    if (!items) return null;
    if (!Array.isArray(items)) items = [items];
    for (const it of items) {
      if (it?.["@_identifierref"]) return it;
      const nested = findFirstItem(it);
      if (nested) return nested;
    }
    return null;
  }
  const firstItem = findFirstItem(defaultOrg);

  let entryPoint = "";
  let title: string | null = null;
  if (firstItem) {
    title = firstItem.title ?? firstItem["imscp:title"] ?? null;
    const ref = firstItem["@_identifierref"];
    const matched = resourceById[ref];
    if (matched?.["@_href"]) entryPoint = matched["@_href"];
  }
  if (!entryPoint && resources.length > 0) {
    const firstWithHref = resources.find((r: any) => r?.["@_href"]);
    if (firstWithHref) entryPoint = firstWithHref["@_href"];
  }
  if (!entryPoint) throw new Error("Could not determine SCORM launch entry point from manifest");
  if (!title) {
    title = defaultOrg?.title ?? defaultOrg?.["imscp:title"] ?? null;
  }

  return {
    scormVersion,
    entryPoint: entryPoint.replace(/^\/+/, ""),
    title: typeof title === "string" ? title : null,
    summary: {
      organizations: orgs.length,
      resources: resources.length,
      defaultOrgId: defaultOrgId ?? null,
      schemaversion: schemaversion || null,
    },
  };
}

/**
 * Determine a content type for a file based on its extension. A small
 * allow-list is enough for typical SCORM payloads (HTML/JS/CSS plus
 * common media). Anything else falls back to application/octet-stream.
 */
function contentTypeFor(name: string): string {
  const ext = name.toLowerCase().split(".").pop() || "";
  switch (ext) {
    case "html": case "htm": return "text/html; charset=utf-8";
    case "css": return "text/css; charset=utf-8";
    case "js": case "mjs": return "application/javascript; charset=utf-8";
    case "json": return "application/json; charset=utf-8";
    case "xml": return "application/xml; charset=utf-8";
    case "svg": return "image/svg+xml";
    case "png": return "image/png";
    case "jpg": case "jpeg": return "image/jpeg";
    case "gif": return "image/gif";
    case "webp": return "image/webp";
    case "ico": return "image/x-icon";
    case "mp3": return "audio/mpeg";
    case "wav": return "audio/wav";
    case "mp4": return "video/mp4";
    case "webm": return "video/webm";
    case "ogg": return "audio/ogg";
    case "woff": return "font/woff";
    case "woff2": return "font/woff2";
    case "ttf": return "font/ttf";
    case "txt": return "text/plain; charset=utf-8";
    case "pdf": return "application/pdf";
    default: return "application/octet-stream";
  }
}

export interface ImportedPackage {
  packageId: string;
  scormVersion: "1.2" | "2004";
  entryPoint: string;
  title: string | null;
  manifestSummary: Record<string, any>;
}

/**
 * Import a SCORM zip: parse the manifest, upload every file to the
 * private bucket under `scorm/<packageId>/`, and persist a row in
 * `scorm_packages`.
 */
export async function importScormZip(opts: {
  zip: Buffer;
  uploadedBy: string;
  courseId?: string | null;
  fileName?: string;
}): Promise<ImportedPackage> {
  const archive = await JSZip.loadAsync(opts.zip);
  const manifestEntry = archive.file("imsmanifest.xml") ?? archive.file("IMSManifest.xml");
  if (!manifestEntry) {
    throw new Error("Zip is missing imsmanifest.xml at the root");
  }
  const manifestXml = await manifestEntry.async("string");
  const parsed = parseManifest(manifestXml);

  // Allocate a packageId up-front so we can write the row with the final
  // packageUrl that points at the uploaded files.
  const [pkgRow] = await db
    .insert(schema.scormPackages)
    .values({
      name: parsed.title || opts.fileName || "SCORM package",
      scormVersion: parsed.scormVersion,
      packageUrl: "",
      entryPoint: parsed.entryPoint,
      manifest: parsed.summary,
      uploadedBy: opts.uploadedBy,
      courseId: opts.courseId ?? null,
    } as any)
    .returning();

  const privateDir = getPrivateDir();
  const baseDir = `${privateDir}/${SCORM_PREFIX}/${pkgRow.id}`;
  const { bucketName } = parseObjectPath(baseDir);
  const bucket = objectStorageClient.bucket(bucketName);

  // Upload every file (skip directories). We sequence uploads modestly
  // so a 500-file package does not open 500 simultaneous sockets.
  const entries = Object.values(archive.files).filter((f: any) => !f.dir);
  const concurrency = 8;
  let i = 0;
  async function worker() {
    while (i < entries.length) {
      const idx = i++;
      const entry: any = entries[idx];
      const buf = await entry.async("nodebuffer");
      const fullPath = `${baseDir}/${entry.name}`;
      const { objectName } = parseObjectPath(fullPath);
      const file = bucket.file(objectName);
      await file.save(buf, {
        contentType: contentTypeFor(entry.name),
        resumable: false,
      });
      try {
        await setObjectAclPolicy(file, { owner: opts.uploadedBy, visibility: "private" });
      } catch {
        // ACL is best-effort; access is also gated by the route guard.
      }
    }
  }
  await Promise.all(new Array(Math.min(concurrency, entries.length)).fill(0).map(() => worker()));

  const packageUrl = `/scorm-assets/${pkgRow.id}/`;
  const [updated] = await db
    .update(schema.scormPackages)
    .set({ packageUrl } as any)
    .where(eq(schema.scormPackages.id, pkgRow.id))
    .returning();

  return {
    packageId: updated.id,
    scormVersion: parsed.scormVersion,
    entryPoint: parsed.entryPoint,
    title: parsed.title,
    manifestSummary: parsed.summary,
  };
}

export async function getScormPackage(id: string) {
  const [row] = await db.select().from(schema.scormPackages).where(eq(schema.scormPackages.id, id)).limit(1);
  return row ?? null;
}

/**
 * SCORM API shim injected into every HTML asset. It runs inside the
 * sandboxed iframe and forwards LMS state to the host via postMessage.
 *
 * Why inject this rather than expose `window.API` from the host app?
 * The player iframe is loaded with `sandbox="allow-scripts allow-forms"`
 * (no `allow-same-origin`), giving the SCO a unique opaque origin. The
 * SCO cannot access `window.parent.API` cross-origin, which is exactly
 * what we want — uploaded SCORM content must not run with host
 * privileges. Instead, the shim defines `window.API` / `window.API_1484_11`
 * on the SCO's own `window` (which `findAPI()` checks first), buffers
 * cmi.* writes, and posts the cmi snapshot to the host on commit/finish.
 */
const SCORM_API_SHIM = `<script>(function(){
  var cmi = {};
  // Rehydrate previously persisted cmi from the URL fragment so a
  // resumed launch reflects lesson_progress.data.cmi without an
  // additional cross-origin round trip.
  try{
    var h = (window.location.hash||"").replace(/^#/, "");
    var p = new URLSearchParams(h);
    var c = p.get("cmi");
    if(c){
      var parsed = JSON.parse(decodeURIComponent(escape(atob(c))));
      if(parsed && typeof parsed === "object"){ for(var k in parsed){ cmi[k] = String(parsed[k]); } }
    }
  }catch(e){}
  // Post to window.top so packages whose SCO is nested inside an internal
  // sub-iframe still reach the host player. The host listener tags
  // messages by the top-level player iframe, not by the SCO's own frame.
  function send(){
    try{ (window.top || window.parent).postMessage({type:"scorm-progress",cmi:cmi}, "*"); }catch(e){}
    try{ window.parent.postMessage({type:"scorm-progress",cmi:cmi}, "*"); }catch(e){}
  }
  var api12 = {
    LMSInitialize: function(){ return "true"; },
    LMSFinish: function(){ send(); return "true"; },
    LMSGetValue: function(k){ return cmi[k] != null ? String(cmi[k]) : ""; },
    LMSSetValue: function(k,v){ cmi[k] = String(v); return "true"; },
    LMSCommit: function(){ send(); return "true"; },
    LMSGetLastError: function(){ return "0"; },
    LMSGetErrorString: function(){ return ""; },
    LMSGetDiagnostic: function(){ return ""; }
  };
  var api2004 = {
    Initialize: function(){ return "true"; },
    Terminate: function(){ send(); return "true"; },
    GetValue: function(k){ return cmi[k] != null ? String(cmi[k]) : ""; },
    SetValue: function(k,v){ cmi[k] = String(v); return "true"; },
    Commit: function(){ send(); return "true"; },
    GetLastError: function(){ return "0"; },
    GetErrorString: function(){ return ""; },
    GetDiagnostic: function(){ return ""; }
  };
  window.API = api12; window.API_1484_11 = api2004;
  window.addEventListener("beforeunload", send);
})();</script>`;

function injectShim(html: string): string {
  // Insert immediately after <head ...> so it runs before any other
  // script. Falls back to prepending the document if there is no head.
  const headRe = /<head\b[^>]*>/i;
  if (headRe.test(html)) return html.replace(headRe, (m) => m + SCORM_API_SHIM);
  const htmlRe = /<html\b[^>]*>/i;
  if (htmlRe.test(html)) return html.replace(htmlRe, (m) => m + "<head>" + SCORM_API_SHIM + "</head>");
  return SCORM_API_SHIM + html;
}

/** Stream a file from the SCORM package out to an Express response. */
export async function streamScormAsset(packageId: string, relPath: string, res: any) {
  const privateDir = getPrivateDir();
  // Normalize: strip query, leading slashes, prevent traversal
  const cleaned = relPath.replace(/^\/+/, "").split("?")[0];
  if (cleaned.includes("..")) {
    return res.status(400).json({ error: "Invalid path" });
  }
  const fullPath = `${privateDir}/${SCORM_PREFIX}/${packageId}/${cleaned}`;
  const { bucketName, objectName } = parseObjectPath(fullPath);
  const file = objectStorageClient.bucket(bucketName).file(objectName);
  const [exists] = await file.exists();
  if (!exists) return res.status(404).json({ error: "Not found" });
  const [metadata] = await file.getMetadata();
  const contentType = metadata.contentType || contentTypeFor(cleaned);
  // Tighten the headers on whatever we serve. The iframe sandbox is the
  // primary defense; X-Content-Type-Options + X-Frame-Options ancestor
  // restriction prevent content sniffing and reframing elsewhere.
  // CORS: the player iframe is sandboxed without `allow-same-origin`,
  // so the SCO's document origin is "null" and any in-package fetch is
  // cross-origin. We allow the response to be read across origins so
  // SCOs can load their own JSON/JS/asset files. We do not allow
  // credentials — authorization is via the signed launch token in the
  // URL path, not session cookies.
  const baseHeaders: Record<string, string> = {
    "Content-Type": contentType,
    "Cache-Control": "private, max-age=300",
    "X-Content-Type-Options": "nosniff",
    "Access-Control-Allow-Origin": "*",
  };

  if (contentType.toLowerCase().startsWith("text/html")) {
    // Buffer HTML so we can inject the SCORM API shim before serving.
    const [buf] = await file.download();
    const injected = injectShim(buf.toString("utf-8"));
    const out = Buffer.from(injected, "utf-8");
    res.set({ ...baseHeaders, "Content-Length": String(out.length) });
    return res.end(out);
  }

  res.set({ ...baseHeaders, "Content-Length": metadata.size });
  const stream = file.createReadStream();
  stream.on("error", () => {
    if (!res.headersSent) res.status(500).json({ error: "stream failed" });
    else res.end();
  });
  stream.pipe(res);
}

// ============================================================
// Export — produce a SCORM 1.2 zip from a CourseFull
// ============================================================

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function lessonHtml(lesson: schema.Lesson): string {
  const c: any = lesson.content ?? {};
  const isQuiz = lesson.type === "quiz";
  let body = "";
  switch (lesson.type) {
    case "rich_text":
      body = c.html || "<p>(empty)</p>";
      break;
    case "slides": {
      const slides = normalizeSlides(c);
      body = slides
        .map((s) => {
          const narration = s.narration?.audioUrl
            ? `<audio controls src="${escapeHtml(s.narration.audioUrl)}"></audio>`
            : "";
          return `<section>${slideToHtml(s)}${narration}</section>`;
        })
        .join("<hr/>");
      break;
    }
    case "video":
      body = c.videoUrl
        ? `<video controls src="${escapeHtml(c.videoUrl)}" style="max-width:100%"></video>`
        : "<p>No video URL.</p>";
      break;
    case "audio":
      body = c.audioUrl
        ? `<audio controls src="${escapeHtml(c.audioUrl)}"></audio>`
        : "<p>No audio URL.</p>";
      break;
    case "attestation":
      body = `<p>${escapeHtml(c.statement || "I attest I have read and understood this material.")}</p><p><em>Sign-off must be performed in the host LMS.</em></p>`;
      break;
    case "quiz": {
      const questions = Array.isArray(c.questions) ? c.questions : [];
      const qHtml = questions
        .map((q: any, qi: number) => {
          const answers = (q.answers || [])
            .map(
              (a: any) =>
                `<label><input type="radio" name="q_${qi}" value="${escapeHtml(a.id)}"> ${escapeHtml(a.text)}</label><br/>`,
            )
            .join("");
          return `<div data-q="${qi}" data-correct="${escapeHtml(q.correctAnswerId || "")}"><p><strong>${qi + 1}. ${escapeHtml(q.text)}</strong></p>${answers}</div>`;
        })
        .join("");
      body = `<form id="quiz">${qHtml}<button type="button" onclick="submitQuiz()">Submit</button><div id="result"></div></form>`;
      break;
    }
    case "scorm":
      body = `<p>This lesson references an embedded SCORM package; export does not re-bundle nested packages.</p>`;
      break;
    default:
      body = "<p>Unsupported lesson type.</p>";
  }

  // Bootstrap is rendered in <head> so quiz buttons added via the body
  // already have access to the resolved `API` handle and the
  // `setStatus` helper. The unload handler only writes "completed" if
  // no terminal status (e.g. passed/failed) was set explicitly during
  // the SCO's lifetime — this preserves quiz pass/fail semantics.
  const passingScore = isQuiz ? Number(c.passingScore ?? 70) : 0;
  const bootstrap = `<script>
(function(){
  function findAPI(win){var n=0; while(win && !win.API && win.parent && win.parent!==win && n++<10){win=win.parent;} return win&&win.API||null;}
  var API=findAPI(window);
  var statusSet=false;
  if(API){ try{ API.LMSInitialize(''); }catch(e){} }
  window.__scormSetStatus = function(s){ if(!API) return; try{ API.LMSSetValue('cmi.core.lesson_status', s); statusSet = true; }catch(e){} };
  window.submitQuiz = function(){
    var qs=document.querySelectorAll('#quiz [data-q]'); var correct=0;
    qs.forEach(function(d){var v=(d.querySelector('input:checked')||{}).value; if(v===d.getAttribute('data-correct')) correct++;});
    var score=qs.length?Math.round(correct/qs.length*100):0;
    var passing = ${passingScore};
    if(API){ try{ API.LMSSetValue('cmi.core.score.raw', String(score)); window.__scormSetStatus(score>=passing?'passed':'failed'); API.LMSCommit(''); }catch(e){} }
    var r = document.getElementById('result'); if(r) r.textContent='Score: '+score+'/100 ('+(score>=passing?'passed':'failed')+')';
  };
  window.addEventListener('beforeunload', function(){
    if(!API) return;
    try{ if(!statusSet) API.LMSSetValue('cmi.core.lesson_status','completed'); API.LMSCommit(''); API.LMSFinish(''); }catch(e){}
  });
})();
</script>`;

  return `<!doctype html>
<html><head><meta charset="utf-8"><title>${escapeHtml(lesson.title)}</title>
<style>body{font-family:system-ui,sans-serif;max-width:780px;margin:1.5rem auto;padding:0 1rem;line-height:1.5}img,video{max-width:100%}</style>
${bootstrap}
</head><body>
<h1>${escapeHtml(lesson.title)}</h1>
${body}
</body></html>`;
}

/**
 * Build a SCORM 1.2 zip for the given course. Each lesson is an SCO
 * (one resource per lesson) so an LMS can track completion lesson by
 * lesson. Returns a Node Buffer.
 */
export async function buildScormExport(course: schema.Course & { modules: (schema.CourseModule & { lessons: schema.Lesson[] })[] }): Promise<Buffer> {
  const zip = new JSZip();
  const lessons = course.modules.flatMap((m) => m.lessons.map((l) => ({ module: m, lesson: l })));

  // Per-lesson HTML files
  const resources: string[] = [];
  const items: string[] = [];
  lessons.forEach(({ lesson }, idx) => {
    const fname = `lesson_${idx + 1}.html`;
    zip.file(fname, lessonHtml(lesson));
    const resId = `RES_${idx + 1}`;
    const itemId = `ITEM_${idx + 1}`;
    items.push(
      `<item identifier="${itemId}" identifierref="${resId}"><title>${escapeXml(lesson.title)}</title></item>`,
    );
    resources.push(
      `<resource identifier="${resId}" type="webcontent" adlcp:scormtype="sco" href="${fname}">
  <file href="${fname}"/>
</resource>`,
    );
  });

  const manifest = `<?xml version="1.0" encoding="UTF-8"?>
<manifest identifier="orion.${course.slug}" version="1.0"
  xmlns="http://www.imsproject.org/xsd/imscp_rootv1p1p2"
  xmlns:adlcp="http://www.adlnet.org/xsd/adlcp_rootv1p2"
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xsi:schemaLocation="http://www.imsproject.org/xsd/imscp_rootv1p1p2 imscp_rootv1p1p2.xsd
                      http://www.imsglobal.org/xsd/imsmd_rootv1p2p1 imsmd_rootv1p2p1.xsd
                      http://www.adlnet.org/xsd/adlcp_rootv1p2 adlcp_rootv1p2.xsd">
  <metadata>
    <schema>ADL SCORM</schema>
    <schemaversion>1.2</schemaversion>
  </metadata>
  <organizations default="ORG_1">
    <organization identifier="ORG_1">
      <title>${escapeXml(course.title)}</title>
      ${items.join("\n      ")}
    </organization>
  </organizations>
  <resources>
    ${resources.join("\n    ")}
  </resources>
</manifest>`;
  zip.file("imsmanifest.xml", manifest);

  return await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
}
