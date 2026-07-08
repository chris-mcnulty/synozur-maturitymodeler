/**
 * PowerPoint (.pptx) import → Orion slides.
 *
 * Strategy (high fidelity, per product decision):
 *   1) LibreOffice headless converts the .pptx to a PDF.
 *   2) Poppler's `pdftoppm` rasterizes each PDF page to a PNG (one per slide).
 *   3) Each PNG becomes an `image_slide` block — faithful to the original deck.
 *   4) Slide text and speaker notes are extracted from the OOXML (via JSZip +
 *      regex) to seed the image's alt text and the slide's narration script.
 *
 * Required system binaries (present in the deploy image):
 *   - soffice / libreoffice
 *   - pdftoppm (poppler-utils)
 *
 * Falls back to a clear error if a binary is missing or conversion fails.
 */
import { spawn } from "child_process";
import { promises as fs } from "fs";
import os from "os";
import path from "path";
import { randomUUID } from "crypto";
import JSZip from "jszip";
import { XMLParser, XMLBuilder } from "fast-xml-parser";
import { ObjectStorageService } from "../objectStorage";
import { genId, type Slide, type SlideBlock } from "@shared/slides";

const SOFFICE_BIN = process.env.SOFFICE_BIN || "soffice";
const PDFTOPPM_BIN = process.env.PDFTOPPM_BIN || "pdftoppm";

function run(cmd: string, args: string[], opts: { cwd?: string; env?: NodeJS.ProcessEnv; timeoutMs?: number }): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { cwd: opts.cwd, env: opts.env });
    let stderr = "";
    const timer = opts.timeoutMs
      ? setTimeout(() => { child.kill("SIGKILL"); reject(new Error(`${cmd} timed out`)); }, opts.timeoutMs)
      : null;
    child.stderr?.on("data", (d) => { stderr += d.toString(); });
    child.on("error", (err) => {
      if (timer) clearTimeout(timer);
      if ((err as any).code === "ENOENT") {
        reject(new Error(`Required binary "${cmd}" not found. Install libreoffice and poppler-utils.`));
      } else {
        reject(err);
      }
    });
    child.on("close", (code) => {
      if (timer) clearTimeout(timer);
      if (code === 0) resolve();
      else reject(new Error(`${cmd} exited with code ${code}. ${stderr.slice(0, 300)}`));
    });
  });
}

export function decodeXmlEntities(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&amp;/g, "&");
}

/** Extract visible text from a slide/notes XML part by collecting <a:t> runs. */
export function extractText(xml: string): string {
  const matches = xml.match(/<a:t>([\s\S]*?)<\/a:t>/g) || [];
  const lines = matches
    .map((m) => decodeXmlEntities(m.replace(/<\/?a:t>/g, "")).trim())
    .filter((t) => t.length > 0);
  return lines.join("\n");
}

interface SlideTextInfo { title: string; text: string; notes: string; }

/**
 * Strip any relationship that points outside the package (TargetMode="External")
 * from every `.rels` part in the OOXML container, and neutralize any raw
 * `http(s)://` targets that show up unmodified in other XML parts.
 *
 * PPTX files can reference remote resources (linked images, OLE objects,
 * hyperlinks, etc.) via `<Relationship ... TargetMode="External" Target="http://...">`.
 * When LibreOffice renders such a file it will resolve those references,
 * causing the server to make outbound HTTP(S) requests to attacker-chosen
 * hosts (SSRF against internal services / cloud metadata endpoints). Since
 * this import only needs the visual/text content of the deck, we remove all
 * external relationships before the file ever reaches LibreOffice.
 */
const RELS_ATTR_PREFIX = "@_";

const relsXmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: RELS_ATTR_PREFIX,
  parseAttributeValue: false,
  parseTagValue: false,
  trimValues: false,
});

const relsXmlBuilder = new XMLBuilder({
  ignoreAttributes: false,
  attributeNamePrefix: RELS_ATTR_PREFIX,
  suppressBooleanAttributes: false,
  format: false,
});

/** Case/whitespace-insensitive lookup of an attribute value on a parsed XML node. */
function getAttr(node: Record<string, any>, attrName: string): string | undefined {
  const target = (RELS_ATTR_PREFIX + attrName).toLowerCase();
  for (const key of Object.keys(node)) {
    if (key.toLowerCase() === target) {
      const value = node[key];
      return typeof value === "string" ? value : String(value);
    }
  }
  return undefined;
}

async function sanitizePptxZip(zip: JSZip): Promise<void> {
  const relsPaths = Object.keys(zip.files).filter((p) => p.endsWith(".rels"));
  for (const relsPath of relsPaths) {
    const file = zip.file(relsPath);
    if (!file) continue;
    const xml = await file.async("string");
    let parsed: any;
    try {
      parsed = relsXmlParser.parse(xml);
    } catch {
      // If the relationships part isn't well-formed XML, refuse to trust it
      // rather than silently pass a potentially malicious/ambiguous part
      // through to LibreOffice.
      zip.file(relsPath, "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?><Relationships xmlns=\"http://schemas.openxmlformats.org/package/2006/relationships\"/>");
      continue;
    }

    const root = parsed?.Relationships;
    if (!root || typeof root !== "object") continue;

    const rawRelationships = root.Relationship;
    if (rawRelationships === undefined) continue;
    const list = Array.isArray(rawRelationships) ? rawRelationships : [rawRelationships];

    // Drop any relationship pointing outside the package, however it is
    // expressed (quote style, attribute order, self-closing vs. not, or
    // case variations all normalize away once parsed as real XML).
    const filtered = list.filter((rel) => {
      if (typeof rel !== "object" || rel === null) return true;
      const targetMode = (getAttr(rel, "TargetMode") || "").trim().toLowerCase();
      if (targetMode === "external") return false;
      const target = getAttr(rel, "Target") || "";
      // Belt-and-braces: also drop anything with an absolute http(s)/ftp
      // target even if TargetMode wasn't explicitly declared as External.
      if (/^\s*(https?|ftp):\/\//i.test(target)) return false;
      return true;
    });

    if (filtered.length === list.length) continue; // nothing changed

    if (filtered.length === 0) {
      delete root.Relationship;
    } else {
      root.Relationship = filtered;
    }
    // Drop any parsed XML declaration node so we don't emit it twice — we
    // always prepend a fresh, well-formed declaration below.
    delete parsed["?xml"];
    const rebuilt =
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      relsXmlBuilder.build(parsed);
    zip.file(relsPath, rebuilt);
  }
}

/**
 * Read per-slide text + speaker notes from the .pptx, ordered by slide number.
 * Notes are resolved via each slide's relationship part for correctness.
 */
async function extractSlideTexts(zip: JSZip): Promise<SlideTextInfo[]> {
  const slidePaths = Object.keys(zip.files)
    .filter((p) => /^ppt\/slides\/slide\d+\.xml$/.test(p))
    .sort((a, b) => {
      const na = Number(a.match(/slide(\d+)\.xml$/)![1]);
      const nb = Number(b.match(/slide(\d+)\.xml$/)![1]);
      return na - nb;
    });

  const out: SlideTextInfo[] = [];
  for (const sp of slidePaths) {
    const slideXml = await zip.file(sp)!.async("string");
    const text = extractText(slideXml);
    const title = text.split("\n")[0] || "";

    // Resolve speaker notes via the slide's rels part.
    let notes = "";
    const base = sp.replace(/^ppt\/slides\//, "");
    const relsPath = `ppt/slides/_rels/${base}.rels`;
    const relsFile = zip.file(relsPath);
    if (relsFile) {
      const relsXml = await relsFile.async("string");
      const m = relsXml.match(/Target="([^"]*notesSlide\d+\.xml)"/);
      if (m) {
        const notesPath = path.posix.normalize(`ppt/slides/${m[1]}`).replace(/^ppt\/slides\/\.\.\//, "ppt/");
        const notesFile = zip.file(notesPath) || zip.file(notesPath.replace(/^.*ppt\//, "ppt/"));
        if (notesFile) notes = extractText(await notesFile.async("string"));
      }
    }
    out.push({ title, text, notes });
  }
  return out;
}

/** Convert the .pptx to one PNG buffer per slide via LibreOffice + pdftoppm. */
async function renderSlideImages(buffer: Buffer): Promise<Buffer[]> {
  const work = await fs.mkdtemp(path.join(os.tmpdir(), "pptx-"));
  try {
    const inputPath = path.join(work, "deck.pptx");
    await fs.writeFile(inputPath, buffer);

    // Isolate the LibreOffice user profile to this run to avoid lock contention.
    // Defense-in-depth: even though external relationships are stripped from the
    // OOXML before we get here, force all HTTP(S) traffic through a bogus proxy
    // so LibreOffice cannot reach the network (internal services, cloud metadata
    // endpoints, etc.) if some other reference sneaks through.
    const env = {
      ...process.env,
      HOME: work,
      http_proxy: "http://127.0.0.1:1",
      https_proxy: "http://127.0.0.1:1",
      HTTP_PROXY: "http://127.0.0.1:1",
      HTTPS_PROXY: "http://127.0.0.1:1",
      no_proxy: "",
      NO_PROXY: "",
    };
    await run(
      SOFFICE_BIN,
      [
        "--headless",
        "--norestore",
        `-env:UserInstallation=file://${path.join(work, "louser")}`,
        "--convert-to",
        "pdf",
        "--outdir",
        work,
        inputPath,
      ],
      { cwd: work, env, timeoutMs: 120000 },
    );

    const pdfPath = path.join(work, "deck.pdf");
    await fs.access(pdfPath).catch(() => {
      throw new Error("LibreOffice did not produce a PDF from the PowerPoint file.");
    });

    // pdftoppm zero-pads page numbers based on page count: slide-1.png … slide-12.png.
    await run(PDFTOPPM_BIN, ["-png", "-r", "150", pdfPath, path.join(work, "slide")], {
      cwd: work,
      timeoutMs: 120000,
    });

    const files = (await fs.readdir(work))
      .filter((f) => /^slide-?\d+\.png$/.test(f))
      .sort((a, b) => {
        const na = Number(a.match(/(\d+)\.png$/)![1]);
        const nb = Number(b.match(/(\d+)\.png$/)![1]);
        return na - nb;
      });

    if (files.length === 0) throw new Error("No slides were rendered from the PowerPoint file.");
    return Promise.all(files.map((f) => fs.readFile(path.join(work, f))));
  } finally {
    await fs.rm(work, { recursive: true, force: true }).catch(() => {});
  }
}

/**
 * Import a .pptx buffer into an array of Orion slides. Each slide is a
 * full-bleed image of the original, with alt text + narration script seeded
 * from the deck's text and speaker notes.
 */
export async function importPptx(opts: {
  buffer: Buffer;
  ownerUserId?: string;
}): Promise<{ slides: Slide[] }> {
  const zip = await JSZip.loadAsync(opts.buffer);
  await sanitizePptxZip(zip);
  const sanitizedBuffer = await zip.generateAsync({ type: "nodebuffer" });
  const [texts, images] = await Promise.all([
    extractSlideTexts(zip).catch(() => [] as SlideTextInfo[]),
    renderSlideImages(sanitizedBuffer),
  ]);

  const storage = new ObjectStorageService();
  const slides: Slide[] = [];

  for (let i = 0; i < images.length; i++) {
    const info = texts[i];
    const url = await storage.storeObjectBytes({
      entityId: `slides/${randomUUID()}.png`,
      data: images[i],
      contentType: "image/png",
      // Private: served to learners via the course-aware media proxy.
      acl: { owner: opts.ownerUserId || "system", visibility: "private" },
    });

    const alt = (info?.title || info?.text?.split("\n")[0] || `Slide ${i + 1}`).slice(0, 280);
    // Start with the full-bleed image (visual fidelity) then add editable text blocks.
    const blocks: SlideBlock[] = [{ id: genId(), type: "image_slide", url, alt }];

    // Heading from the slide title.
    if (info?.title) {
      blocks.push({ id: genId(), type: "heading", level: 2, text: info.title });
    }
    // Body text: lines after the title, HTML-escaped into <p> tags so the
    // rich-text editor renders them as editable paragraphs.
    const bodyLines = (info?.text || "")
      .split("\n")
      .slice(info?.title ? 1 : 0)
      .filter((l) => l.trim());
    if (bodyLines.length > 0) {
      const htmlEsc = (s: string) =>
        s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
      const html = bodyLines.map((l) => `<p>${htmlEsc(l)}</p>`).join("");
      blocks.push({ id: genId(), type: "text", html });
    }

    const notes = (info?.notes || "").trim();
    // If there are no speaker notes, fall back to the slide's body text so the
    // narration script is pre-populated without requiring a manual override.
    const narrationText = notes || bodyLines.join("\n");
    slides.push({
      id: genId("slide"),
      blocks,
      narration: narrationText ? { mode: "tts", text: narrationText } : { mode: "none" },
    });
  }

  return { slides };
}
