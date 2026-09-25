/**
 * Builds a Synozur annual training course from its source in
 * courseware/annual-training/<course>/ as a draft, tenant-private Orion course
 * in the development database, exports it through Orion's supported
 * .orion-course.json mechanism, and writes the administrator package.
 *
 * Usage:
 *   npx tsx scripts/build-annual-training-course.ts <course> [--render] [--render-only] [--replace] [--no-import]
 *
 *   --render       Re-render graphics and the PDF from their HTML sources first.
 *   --render-only  Render media and stop (no database writes).
 *   --replace      Delete and rebuild an existing development draft with the same slug.
 *   --no-import    Compile and validate only; write admin docs without touching the database.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { db } from "../server/db";
import * as schema from "../shared/schema";
import {
  exportCourse,
  importCourse,
  validateCourseExportDoc,
  type CourseExportDocV2,
  type CourseExportLesson,
  type CourseExportModule,
} from "../server/services/course-import-export";
import { closeRenderer } from "../courseware/annual-training/shared/render";
import { assertDevelopmentWorkspace } from "../courseware/annual-training/shared/dev-guard";
import { NARRATION_VOICE, writeAdminPackage, type AdminSpec, type MediaRecord } from "../courseware/annual-training/shared/admin-docs";
import type { BlockSpec, CourseSpec, LessonSpec } from "../courseware/annual-training/shared/spec";

const CREATOR_EMAIL = "chris.mcnulty@synozur.com";
const TENANT_DOMAIN = "synozur.com";
const WORDS_PER_MINUTE = 150;
const PENDING_RE = /\[TO CONFIRM BEFORE RELEASE:[^\]]*\]/g;

interface CourseModule {
  course: CourseSpec;
  admin: AdminSpec;
  welcomeScript: string[];
  attestationStatement: string;
  graphics: Record<string, { file: string }>;
  mediaDir: string;
  renderAll: () => Promise<void>;
}

// Each course lives in courseware/annual-training/<key>/ with content.ts,
// graphics.ts, and admin.ts exporting the same names.
const COURSES = ["information-security", "data-privacy", "business-conduct"] as const;

async function loadCourse(key: string): Promise<CourseModule> {
  const dir = `../courseware/annual-training/${key}`;
  const content = await import(`${dir}/content`);
  const graphics = await import(`${dir}/graphics`);
  const { admin } = await import(`${dir}/admin`);
  return {
    course: content.course,
    admin,
    welcomeScript: content.WELCOME_SCRIPT,
    attestationStatement: content.ATTESTATION_STATEMENT,
    graphics: graphics.GRAPHICS,
    mediaDir: graphics.MEDIA_DIR,
    renderAll: graphics.renderAll,
  };
}

const CONTENT_TYPES: Record<string, string> = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".pdf": "application/pdf" };

async function exists(file: string) {
  return fs.access(file).then(() => true, () => false);
}

class MediaLibrary {
  readonly assets: CourseExportDocV2["assets"] = {};
  private paths = new Map<string, string>();
  readonly usage = new Map<string, Set<string>>();
  readonly alts = new Map<string, string>();
  readonly equivalents = new Map<string, string>();

  constructor(private files: Map<string, string>) {}

  async use(key: string, where: string): Promise<string> {
    const file = this.files.get(key);
    if (!file) throw new Error(`Unknown media key "${key}"`);
    (this.usage.get(key) ?? this.usage.set(key, new Set()).get(key)!).add(where);
    const known = this.paths.get(key);
    if (known) return known;
    const ext = path.extname(file).toLowerCase();
    const contentType = CONTENT_TYPES[ext];
    if (!contentType) throw new Error(`Unsupported media type for ${file}`);
    const data = await fs.readFile(file);
    if (!data.length) throw new Error(`Media file is empty: ${file}`);
    const objectPath = `/objects/uploads/${randomUUID()}${ext}`;
    this.assets[objectPath] = { originalPath: objectPath, contentType, data: data.toString("base64") };
    this.paths.set(key, objectPath);
    return objectPath;
  }
}

async function compileBlocks(blocks: BlockSpec[], slideId: string, where: string, media: MediaLibrary) {
  const out: Record<string, unknown>[] = [];
  for (const [i, block] of blocks.entries()) {
    const id = `${slideId}-b${i + 1}`;
    switch (block.type) {
      case "heading":
        out.push({ id, type: "heading", level: block.level, text: block.text });
        break;
      case "text":
        out.push({ id, type: "text", html: block.html });
        break;
      case "callout":
        out.push({ id, type: "callout", tone: block.tone, html: block.html });
        break;
      case "image": {
        if (!block.alt.trim()) throw new Error(`Image in ${where} is missing alt text`);
        const url = await media.use(block.media, where);
        media.alts.set(block.media, block.alt);
        const next = blocks[i + 1];
        if (next?.type === "text") media.equivalents.set(block.media, `Text block after the image in ${where}`);
        out.push({ id, type: "image", url, alt: block.alt, ...(block.caption ? { caption: block.caption } : {}) });
        break;
      }
      case "video-slot": {
        const poster = await media.use(block.posterMedia, `${where} (video poster)`);
        out.push({ id, type: "video", url: "", provider: "mp4", poster, caption: block.caption });
        break;
      }
    }
  }
  return out;
}

async function compileLesson(lesson: LessonSpec, order: number, media: MediaLibrary, mediaDir: string): Promise<CourseExportLesson> {
  const where = `${lesson.key} ${lesson.title}`;
  const base = { title: lesson.title, order, estimatedMinutes: lesson.minutes, required: lesson.required };
  if (lesson.kind === "slides") {
    const slides = [];
    for (const slide of lesson.slides) {
      slides.push({
        id: slide.id,
        blocks: await compileBlocks(slide.blocks, slide.id, where, media),
        ...(slide.narration
          ? { narration: { mode: "tts", text: slide.narration, voice: NARRATION_VOICE, approved: false } }
          : {}),
      });
    }
    return { ...base, type: "slides", content: { slides, ...(lesson.activityType ? { activityType: lesson.activityType } : {}) } };
  }
  if (lesson.kind === "quiz") {
    const questions = lesson.questions.map(q => {
      const answerIds = new Set(q.answers.map(a => a.id));
      const correct = Array.isArray(q.correct) ? q.correct : [q.correct];
      if (!correct.length || correct.some(id => !answerIds.has(id))) throw new Error(`Question ${q.id} in ${where} has an invalid key`);
      // Only keys Orion's grader and learner redaction understand. Per-choice
      // feedback, revisit targets, and sources stay in the admin package.
      const answers = q.answers.map(a => ({ id: a.id, text: a.text }));
      return Array.isArray(q.correct)
        ? { id: q.id, text: q.text, type: "multiple", answers, correctAnswerIds: correct, explanation: q.explanation }
        : { id: q.id, text: q.text, answers, correctAnswerId: q.correct, explanation: q.explanation };
    });
    return { ...base, type: "quiz", content: { passingScore: lesson.passingScore, introHtml: lesson.introHtml, questions } };
  }
  if (lesson.kind === "rich_text") {
    const courseResources = [];
    for (const r of lesson.resources ?? []) {
      const data = await fs.readFile(path.join(mediaDir, r.mediaFile));
      courseResources.push({ id: r.id, title: r.title, description: r.description, filename: r.filename, mimeType: r.mimeType, dataBase64: data.toString("base64") });
    }
    return { ...base, type: "rich_text", content: { html: lesson.html, ...(courseResources.length ? { courseResources } : {}) } };
  }
  return { ...base, type: "attestation", content: { statement: lesson.statement, requireTyped: true } };
}

function assertLearnerSafe(doc: CourseExportDocV2, spec: CourseSpec, statement: string) {
  const allowedQuestionKeys = new Set(["id", "text", "type", "answers", "correctAnswerId", "correctAnswerIds", "explanation"]);
  let graded = 0;
  for (const m of doc.course.modules) {
    for (const l of m.lessons) {
      if (l.type === "quiz") {
        for (const q of l.content.questions) {
          for (const key of Object.keys(q)) if (!allowedQuestionKeys.has(key)) throw new Error(`Quiz question ${q.id} has unexpected key ${key}`);
          for (const a of q.answers) if (Object.keys(a).some(k => k !== "id" && k !== "text")) throw new Error(`Answer in ${q.id} has extra keys`);
        }
        if (l.content.passingScore > 0) graded++;
      }
      if (l.type === "attestation" && l.content.statement !== statement) throw new Error("Attestation statement differs from the preserved source wording");
    }
  }
  if (graded !== 1) throw new Error(`Expected exactly one graded quiz, found ${graded}`);
  const json = JSON.stringify(doc.course);
  if (/\.pptx/i.test(json)) throw new Error("Course content references a PowerPoint file");
  if (/correct answer is|answer key/i.test(json)) throw new Error("Course content appears to reveal an answer key");
  const finalQuiz = spec.modules.flatMap(m => m.lessons).find(l => l.kind === "quiz" && !l.practice);
  if (!finalQuiz || finalQuiz.kind !== "quiz" || finalQuiz.questions.length !== 8) throw new Error("Final quiz must have eight questions");
}

function pendingMarkers(doc: CourseExportDocV2) {
  const found: Array<{ lesson: string; marker: string }> = [];
  for (const m of doc.course.modules) {
    for (const l of m.lessons) {
      const seen = new Set<string>();
      for (const match of JSON.stringify(l.content).matchAll(PENDING_RE)) {
        if (!seen.has(match[0])) found.push({ lesson: l.title, marker: match[0] });
        seen.add(match[0]);
      }
    }
  }
  return found;
}

async function resolveTenant() {
  const rows = await db
    .select({ tenantId: schema.tenantDomains.tenantId, name: schema.tenants.name, verified: schema.tenantDomains.verified })
    .from(schema.tenantDomains)
    .innerJoin(schema.tenants, eq(schema.tenants.id, schema.tenantDomains.tenantId))
    .where(eq(schema.tenantDomains.domain, TENANT_DOMAIN));
  if (rows.length !== 1) throw new Error(`Expected one tenant for ${TENANT_DOMAIN}, found ${rows.length}`);
  return rows[0];
}

async function main() {
  const [courseKey, ...flags] = process.argv.slice(2);
  if (!(COURSES as readonly string[]).includes(courseKey ?? "")) throw new Error(`Usage: build-annual-training-course.ts <${COURSES.join("|")}> [flags]`);
  const mod = await loadCourse(courseKey!);
  const spec = mod.course;

  const has = (f: string) => flags.includes(f);
  const graphicFiles = Object.values(mod.graphics).map(g => path.join(mod.mediaDir, g.file));
  const missing = (await Promise.all(graphicFiles.map(exists))).some(ok => !ok);
  if (has("--render") || has("--render-only") || missing) {
    await mod.renderAll();
    await closeRenderer();
    console.log(`Rendered media into ${mod.mediaDir}`);
  }
  if (has("--render-only")) return;

  const files = new Map<string, string>();
  for (const [key, g] of Object.entries(mod.graphics)) files.set(key, path.join(mod.mediaDir, g.file));
  for (const p of spec.photos) {
    if (Object.values(p).some(v => /PENDING_PHOTO_CREDIT/.test(v))) throw new Error(`Photo ${p.key} has no credit recorded yet`);
    files.set(p.key, path.join(mod.mediaDir, p.file));
  }
  const media = new MediaLibrary(files);

  const heroUrl = await media.use(spec.heroMedia, "Course hero (catalog card and course header)");
  media.alts.set(spec.heroMedia, "Decorative course header (no alt text in Orion’s hero field)");
  const modules: CourseExportModule[] = [];
  for (const [mi, m] of spec.modules.entries()) {
    const lessons: CourseExportLesson[] = [];
    for (const [li, lesson] of m.lessons.entries()) lessons.push(await compileLesson(lesson, li, media, mod.mediaDir));
    modules.push({ title: m.title, description: m.description, order: mi, lessons });
  }

  const doc: CourseExportDocV2 = {
    format: "orion-course",
    version: "2",
    exportedAt: new Date().toISOString(),
    assets: media.assets,
    course: {
      title: spec.title,
      slug: spec.slug,
      description: spec.description,
      summary: spec.summary,
      imageUrl: heroUrl,
      estimatedMinutes: spec.estimatedMinutes,
      status: "draft",
      visibility: "private",
      passingScore: spec.passingScore,
      certificateEnabled: false,
      tags: spec.tags,
      modules,
    },
  };
  validateCourseExportDoc(doc);
  assertLearnerSafe(doc, spec, mod.attestationStatement);

  if (!has("--no-import")) assertDevelopmentWorkspace();
  const tenant = await resolveTenant();
  let courseId: string | null = null;
  let exportPath: string | null = null;
  let summary: Record<string, unknown> = { compiled: true, assets: Object.keys(doc.assets).length };

  if (!has("--no-import")) {
    const [creator] = await db.select({ id: schema.users.id, tenantId: schema.users.tenantId }).from(schema.users)
      .where(eq(schema.users.email, CREATOR_EMAIL)).limit(1);
    if (!creator) throw new Error("Development creator account was not found.");

    const [existing] = await db.select({ id: schema.courses.id }).from(schema.courses).where(eq(schema.courses.slug, spec.slug)).limit(1);
    if (existing) {
      if (!has("--replace")) throw new Error(`Development course ${spec.slug} already exists; pass --replace to rebuild it.`);
      // One conditional statement, so a course that is published, enrolled, or
      // re-owned in the meantime is never deleted: only a draft this build
      // created (same slug, tenant, and creator) with no enrollments.
      const deleted = await db.delete(schema.courses).where(and(
        eq(schema.courses.id, existing.id),
        eq(schema.courses.slug, spec.slug),
        eq(schema.courses.status, "draft"),
        eq(schema.courses.ownerTenantId, tenant.tenantId),
        eq(schema.courses.createdBy, creator.id),
        sql`not exists (select 1 from ${schema.courseEnrollments} where ${schema.courseEnrollments.courseId} = ${schema.courses.id})`,
      )).returning({ id: schema.courses.id });
      if (!deleted.length) {
        throw new Error(`Refusing to replace ${spec.slug}: it is not an unenrolled draft created by ${CREATOR_EMAIL} in ${tenant.name}.`);
      }
    }

    const imported = await importCourse(doc, { slug: spec.slug, ownerTenantId: tenant.tenantId, createdBy: creator.id, visibility: "private" });
    if (imported.course.slug !== spec.slug) throw new Error(`Imported slug was changed to ${imported.course.slug}`);
    const exported = await exportCourse(imported.course.id);
    if (!exported) throw new Error("Imported course could not be exported.");
    validateCourseExportDoc(exported);
    exportPath = path.join("handoff", `${spec.slug}.orion-course.json`);
    await fs.mkdir(path.dirname(exportPath), { recursive: true });
    await fs.writeFile(exportPath, `${JSON.stringify(exported, null, 2)}\n`, "utf8");
    courseId = imported.course.id;
    summary = {
      courseId,
      slug: imported.course.slug,
      status: imported.course.status,
      visibility: imported.course.visibility,
      ownerTenant: `${tenant.name} (${tenant.tenantId})`,
      moduleCount: imported.moduleCount,
      lessonCount: imported.lessonCount,
      restoredAssetCount: imported.restoredAssetCount,
      exportPath,
      exportBytes: (await fs.stat(exportPath)).size,
    };
  }

  const mediaRecords: MediaRecord[] = [];
  for (const [key, file] of files) {
    const used = media.usage.get(key);
    if (!used) continue;
    const photo = spec.photos.find(p => p.key === key);
    mediaRecords.push({
      key,
      file: path.basename(file),
      kind: photo ? "photo" : "graphic",
      usedIn: [...used],
      alt: media.alts.get(key),
      textEquivalent: media.equivalents.get(key),
      credit: photo
        ? `“${photo.title}” by ${photo.creator}, ${photo.source}. ${photo.landingUrl} (file: ${photo.downloadedFrom}, retrieved ${photo.retrieved})`
        : "Authored for this course (HTML/CSS source alongside the PNG); official Synozur logo file",
      rights: photo ? `${photo.license} (${photo.licenseUrl}). ${photo.notes}` : "Synozur-owned course graphic; logo used unmodified",
    });
  }
  for (const lesson of spec.modules.flatMap(m => m.lessons)) {
    if (lesson.kind !== "rich_text") continue;
    for (const r of lesson.resources ?? []) {
      mediaRecords.push({
        key: r.id,
        file: r.mediaFile,
        kind: "pdf",
        usedIn: [`${lesson.key} ${lesson.title} (course resource “${r.title}”)`],
        textEquivalent: `Same content as the ${lesson.key} lesson text`,
        credit: "Authored for this course (HTML source alongside the PDF); official Synozur logo file",
        rights: "Synozur-owned course material; watermarked DRAFT until contacts are verified",
      });
    }
  }

  const devDomain = process.env.REPLIT_DEV_DOMAIN;
  const outDir = path.join("handoff", "annual-training", courseKey!);
  const written = await writeAdminPackage({
    outDir,
    spec,
    admin: mod.admin,
    welcomeScript: mod.welcomeScript,
    info: {
      devCourseId: courseId,
      tenantName: tenant.name,
      tenantId: tenant.tenantId,
      previewUrl: devDomain ? `https://${devDomain}/courses/${spec.slug}` : `/courses/${spec.slug}`,
      exportPath,
      pendingMarkers: pendingMarkers(doc),
      media: mediaRecords,
      wordsPerMinute: WORDS_PER_MINUTE,
    },
  });
  console.log(JSON.stringify({ ...summary, adminPackage: written }, null, 2));
}

main()
  .catch(error => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeRenderer();
    process.exit();
  });
