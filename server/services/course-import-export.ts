/**
 * Course JSON export / import service.
 *
 * Format: .orion-course.json
 *
 * Version 1 — course metadata + modules + lessons (no embedded media).
 *   Produced only when `exportCourse` is called with `{ embedMedia: false }`.
 *   Backward-compatible: version-1 files continue to validate and import.
 *
 * Version 2 (default) — same structure plus an `assets` map that embeds all
 *   managed object-storage media (hero image, narration audio, slide/upload
 *   images) as base64-encoded strings with their content types.  On import,
 *   each asset is restored to a fresh managed object path and all known media
 *   URL fields are rewritten before records are persisted.
 *
 * Portability guarantee:
 *   - Export throws if a referenced managed asset cannot be read — a partial
 *     package is worse than no package.
 *   - Import throws for any malformed, unrecognised, or unrestorable asset
 *     entry — a broken reference inside a saved course is not acceptable.
 *   - URL rewriting is restricted to a known set of media-URL field names so
 *     that free-text / HTML content is never accidentally altered.
 *
 * What is intentionally excluded:
 *   - Enrollment and progress data (learner records stay with the platform)
 *   - SCORM binary packages (scorm lessons retain their config shape but the
 *     binary package itself must be re-uploaded after import)
 *   - createdBy / ownerTenantId (set by the importer's auth context)
 *   - Database IDs (fresh UUIDs are assigned on import)
 */

import { db } from "../db";
import { eq, or } from "drizzle-orm";
import * as schema from "@shared/schema";
import type {
  Course, CourseModule, Lesson,
  InsertCourse, InsertCourseModule, InsertLesson,
} from "@shared/schema";
import { extractManagedObjectPaths } from "@shared/slides";
import { ObjectStorageService } from "../objectStorage";
import { ObjectAclPolicy } from "../objectAcl";
import { randomUUID } from "crypto";
import {
  isPptxReviewPreviewPath,
  isPptxReviewPreviewReference,
} from "./pptx-review-paths";

// ─── Size limits ──────────────────────────────────────────────────────────────

/** Maximum decoded bytes for a single embedded asset (50 MiB). */
const MAX_ASSET_BYTES = 50 * 1024 * 1024;

/** Maximum total decoded bytes across all assets in one package (500 MiB). */
const MAX_TOTAL_BYTES = 500 * 1024 * 1024;

// ─── Known media-URL field names ──────────────────────────────────────────────
//
// Rewriting is intentionally restricted to these field names so that free-text
// or HTML fields that happen to contain an /objects path are never altered.
// These match the keys used by extractManagedObjectPaths in shared/slides.ts.

const MEDIA_URL_KEYS = new Set(["url", "audioUrl", "videoUrl", "poster", "src"]);

/** Regex matching a valid managed object path. */
const MANAGED_PATH_RE = /^\/objects\/(uploads|narration|slides)\/[A-Za-z0-9._\-/]+$/;

// ─── Format types ────────────────────────────────────────────────────────────

export interface CourseExportLesson {
  title: string;
  type: string;
  order: number;
  estimatedMinutes: number | null;
  required: boolean;
  content: Record<string, any>;
}

export interface CourseExportModule {
  title: string;
  description: string | null;
  order: number;
  lessons: CourseExportLesson[];
}

/** An embedded asset in a v2 export package. */
export interface EmbeddedAsset {
  /** Original managed object path, e.g. `/objects/uploads/<uuid>` */
  originalPath: string;
  contentType: string;
  /** Base64-encoded file bytes */
  data: string;
}

/** Version-1 export document (no embedded assets). */
export interface CourseExportDocV1 {
  format: "orion-course";
  version: "1";
  exportedAt: string;
  course: {
    title: string;
    slug: string;
    description: string;
    summary: string | null;
    imageUrl: string | null;
    estimatedMinutes: number | null;
    status: string;
    visibility: string;
    passingScore: number;
    certificateEnabled: boolean;
    tags: string[];
    modules: CourseExportModule[];
  };
}

/** Version-2 export document (all managed media embedded). */
export interface CourseExportDocV2 {
  format: "orion-course";
  version: "2";
  exportedAt: string;
  /**
   * Keyed by original managed object path.  Each entry carries the base64
   * file bytes and the content type so the receiver can restore the object
   * without additional metadata lookups.
   */
  assets: Record<string, EmbeddedAsset>;
  course: {
    title: string;
    slug: string;
    description: string;
    summary: string | null;
    imageUrl: string | null;
    estimatedMinutes: number | null;
    status: string;
    visibility: string;
    passingScore: number;
    certificateEnabled: boolean;
    tags: string[];
    modules: CourseExportModule[];
  };
}

/** Union type accepted by validate / import. */
export type CourseExportDoc = CourseExportDocV1 | CourseExportDocV2;

// ─── Export ──────────────────────────────────────────────────────────────────

/**
 * Export a course.
 *
 * Default (`embedMedia` unset or `true`) produces a version-2 package with all
 * managed object-storage assets embedded as base64.  Pass `embedMedia: false`
 * to produce a legacy version-1 package without embedded media (useful for
 * metadata-only exports where the receiver handles media separately).
 *
 * Throws if any referenced managed asset is missing or unreadable — a partial
 * package silently loses media and is worse than no package.
 */
export async function exportCourse(
  courseId: string,
  opts: { embedMedia?: boolean } = {},
): Promise<CourseExportDoc | null> {
  const embedMedia = opts.embedMedia !== false; // default true

  // Load full course
  const [course] = await db.select().from(schema.courses)
    .where(or(eq(schema.courses.id, courseId), eq(schema.courses.slug, courseId)))
    .limit(1);
  if (!course) return null;

  const [modules, allLessons, tagRows] = await Promise.all([
    db.select().from(schema.courseModules)
      .where(eq(schema.courseModules.courseId, course.id))
      .orderBy(schema.courseModules.order),
    db.select().from(schema.lessons)
      .innerJoin(schema.courseModules, eq(schema.lessons.moduleId, schema.courseModules.id))
      .where(eq(schema.courseModules.courseId, course.id)),
    db.select({ tag: schema.courseTags })
      .from(schema.courseTagAssignments)
      .innerJoin(schema.courseTags, eq(schema.courseTagAssignments.tagId, schema.courseTags.id))
      .where(eq(schema.courseTagAssignments.courseId, course.id)),
  ]);

  // Group lessons by module
  const lessonsByModule = new Map<string, Lesson[]>();
  for (const row of allLessons) {
    const lesson = (row as any).lessons as Lesson;
    const arr = lessonsByModule.get(lesson.moduleId) ?? [];
    arr.push(lesson);
    lessonsByModule.set(lesson.moduleId, arr);
  }
  for (const arr of Array.from(lessonsByModule.values())) {
    arr.sort((a: any, b: any) => a.order - b.order);
  }

  const exportModules: CourseExportModule[] = modules.map(m => ({
    title: m.title,
    description: m.description ?? null,
    order: m.order,
    lessons: (lessonsByModule.get(m.id) ?? []).map((l: any) => ({
      title: l.title,
      type: l.type,
      order: l.order,
      estimatedMinutes: l.estimatedMinutes ?? null,
      required: l.required,
      content: l.content ?? {},
    })),
  }));

  const courseSection = {
    title: course.title,
    slug: course.slug,
    description: course.description,
    summary: course.summary ?? null,
    imageUrl: course.imageUrl ?? null,
    estimatedMinutes: course.estimatedMinutes ?? null,
    status: course.status,
    visibility: course.visibility,
    passingScore: course.passingScore,
    certificateEnabled: course.certificateEnabled,
    tags: tagRows.map(r => r.tag.name),
    modules: exportModules,
  };

  if (!embedMedia) {
    return {
      format: "orion-course",
      version: "1",
      exportedAt: new Date().toISOString(),
      course: courseSection,
    };
  }

  // ── v2: collect & embed managed assets ───────────────────────────────────
  const storage = new ObjectStorageService();
  const assets: Record<string, EmbeddedAsset> = {};

  /**
   * Collect an object path into the assets map (deduped).
   * Throws if the object is missing or unreadable — portability requires every
   * referenced asset to be present in the package.
   */
  async function collectAsset(objectPath: string | null | undefined): Promise<void> {
    if (!objectPath) return;
    if (!MANAGED_PATH_RE.test(objectPath)) return; // external URL — skip, not an error
    if (assets[objectPath]) return; // deduplicate

    const result = await storage.readObjectBytes(objectPath);
    if (!result) {
      throw new Error(
        `[exportCourse] managed asset not found in object storage: ${objectPath}. ` +
        `Ensure the asset exists before exporting or use embedMedia: false for a legacy export.`
      );
    }
    assets[objectPath] = {
      originalPath: objectPath,
      contentType: result.contentType,
      data: result.data.toString("base64"),
    };
    // readObjectBytes already loaded into memory — no extra size check needed here;
    // the per-asset limit is enforced on import.
  }

  // Course hero image
  await collectAsset(course.imageUrl);

  // All managed paths referenced in lesson content (via known media-URL keys)
  for (const m of exportModules) {
    for (const l of m.lessons) {
      const paths = extractManagedObjectPaths(l.content);
      for (const p of paths) {
        await collectAsset(p);
      }
    }
  }

  return {
    format: "orion-course",
    version: "2",
    exportedAt: new Date().toISOString(),
    assets,
    course: courseSection,
  };
}

// ─── Validation ───────────────────────────────────────────────────────────────

export function validateCourseExportDoc(raw: unknown): asserts raw is CourseExportDoc {
  if (!raw || typeof raw !== "object") throw new Error("Invalid course file: not an object");
  const doc = raw as any;

  if (doc.format !== "orion-course")
    throw new Error(`Invalid course file: expected format "orion-course", got "${doc.format}"`);
  if (doc.version !== "1" && doc.version !== "2")
    throw new Error(`Unsupported course file version: ${doc.version}`);
  if (!doc.course) throw new Error("Missing 'course' field");

  const c = doc.course;
  if (typeof c.title !== "string" || !c.title.trim()) throw new Error("course.title is required");
  if (!Array.isArray(c.modules)) throw new Error("course.modules must be an array");

  for (let mi = 0; mi < c.modules.length; mi++) {
    const m = c.modules[mi];
    if (typeof m.title !== "string" || !m.title.trim())
      throw new Error(`modules[${mi}].title is required`);
    if (!Array.isArray(m.lessons))
      throw new Error(`modules[${mi}].lessons must be an array`);
    for (let li = 0; li < m.lessons.length; li++) {
      const l = m.lessons[li];
      if (typeof l.title !== "string" || !l.title.trim())
        throw new Error(`modules[${mi}].lessons[${li}].title is required`);
      if (typeof l.type !== "string")
        throw new Error(`modules[${mi}].lessons[${li}].type is required`);
    }
  }

  if (doc.version === "2") {
    // ── assets map: structural check ────────────────────────────────────────
    if (
      doc.assets === undefined || doc.assets === null ||
      typeof doc.assets !== "object" || Array.isArray(doc.assets)
    ) {
      throw new Error("version 2 course file must have an 'assets' object");
    }

    let totalDecodedBytes = 0;

    for (const [key, entry] of Object.entries(doc.assets as Record<string, unknown>)) {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
        throw new Error(`assets["${key}"]: entry must be an object`);
      }
      const asset = entry as any;

      // key and originalPath must match a recognised managed path
      if (!MANAGED_PATH_RE.test(key)) {
        throw new Error(
          `assets: key "${key}" is not a recognised managed object path ` +
          `(must match /objects/(uploads|narration|slides)/...)`
        );
      }
      if (asset.originalPath !== key) {
        throw new Error(
          `assets["${key}"]: originalPath "${asset.originalPath}" must equal the map key`
        );
      }

      // contentType must be a non-empty string
      if (typeof asset.contentType !== "string" || !asset.contentType.trim()) {
        throw new Error(`assets["${key}"]: contentType must be a non-empty string`);
      }

      // data must be a non-empty, valid base64 string that decodes to > 0 bytes
      if (typeof asset.data !== "string" || !asset.data) {
        throw new Error(`assets["${key}"]: data must be a non-empty base64 string`);
      }
      // Validate base64 characters (standard + URL-safe + padding)
      if (!/^[A-Za-z0-9+/\-_]+=*$/.test(asset.data)) {
        throw new Error(`assets["${key}"]: data contains invalid base64 characters`);
      }
      let decodedLen: number;
      try {
        decodedLen = Buffer.from(asset.data, "base64").length;
      } catch {
        throw new Error(`assets["${key}"]: data is not valid base64`);
      }
      if (decodedLen === 0) {
        throw new Error(`assets["${key}"]: data decodes to zero bytes`);
      }
      if (decodedLen > MAX_ASSET_BYTES) {
        throw new Error(
          `assets["${key}"]: decoded size ${decodedLen} bytes exceeds ` +
          `the per-asset limit of ${MAX_ASSET_BYTES} bytes`
        );
      }

      totalDecodedBytes += decodedLen;
      if (totalDecodedBytes > MAX_TOTAL_BYTES) {
        throw new Error(
          `assets: total decoded size exceeds the package limit of ${MAX_TOTAL_BYTES} bytes`
        );
      }
    }
  }
}

// ─── Import ──────────────────────────────────────────────────────────────────

export interface ImportOptions {
  /** Force a specific slug; otherwise derived from the file slug (deduped) */
  slug?: string;
  /** Force the course owner tenant. Required for non-global-admin callers. */
  ownerTenantId?: string | null;
  /** User ID of the importer (stored as createdBy). */
  createdBy?: string;
  /** Override visibility (default: keep file value) */
  visibility?: "public" | "private";
  /** Review-only preview paths authorized by a claimed PowerPoint commit. */
  allowedPptxReviewPreviewPaths?: readonly string[];
}

export interface ImportResult {
  course: Course;
  moduleCount: number;
  lessonCount: number;
  tagCount: number;
  /** Number of media assets restored from embedded v2 package. */
  restoredAssetCount: number;
}

export async function importCourse(doc: CourseExportDoc, opts: ImportOptions = {}): Promise<ImportResult> {
  const c = doc.course;

  // ── v2: restore embedded assets to fresh object paths ────────────────────
  /** Maps original path → new managed path after re-upload. */
  const pathMap = new Map<string, string>();
  let restoredAssetCount = 0;

  if (doc.version === "2") {
    const storage = new ObjectStorageService();
    const ownerTag = opts.ownerTenantId ?? opts.createdBy ?? "imported";
    const privateAcl: ObjectAclPolicy = { owner: ownerTag, visibility: "private" };

    for (const [originalPath, asset] of Object.entries((doc as CourseExportDocV2).assets)) {
      // ── Structural validation (mirrors validateCourseExportDoc) ──────────
      // importCourse may be called without a prior validate (e.g. programmatic
      // use), so we re-check and throw rather than silently skipping.

      if (!asset || typeof asset !== "object" || Array.isArray(asset)) {
        throw new Error(`[importCourse] asset entry for "${originalPath}" is not an object`);
      }
      if (!MANAGED_PATH_RE.test(originalPath)) {
        throw new Error(
          `[importCourse] asset key "${originalPath}" is not a recognised managed path`
        );
      }
      if ((asset as any).originalPath !== originalPath) {
        throw new Error(
          `[importCourse] asset["${originalPath}"].originalPath does not match its key`
        );
      }
      if (
        typeof (asset as any).contentType !== "string" ||
        !(asset as any).contentType.trim()
      ) {
        throw new Error(`[importCourse] asset "${originalPath}" has missing or empty contentType`);
      }
      if (typeof (asset as any).data !== "string" || !(asset as any).data) {
        throw new Error(`[importCourse] asset "${originalPath}" has missing or empty data`);
      }

      // ── Decode ───────────────────────────────────────────────────────────
      let dataBuffer: Buffer;
      try {
        dataBuffer = Buffer.from((asset as any).data, "base64");
      } catch (err) {
        throw new Error(`[importCourse] asset "${originalPath}" base64 decode failed: ${err}`);
      }
      if (dataBuffer.length === 0) {
        throw new Error(`[importCourse] asset "${originalPath}" decodes to zero bytes`);
      }

      // ── Infer destination path ────────────────────────────────────────────
      const prefixMatch = originalPath.match(/^\/objects\/(uploads|narration|slides)\//);
      // MANAGED_PATH_RE already guarantees this matches — guard for type narrowing
      if (!prefixMatch) {
        throw new Error(`[importCourse] unexpected path format after validation: ${originalPath}`);
      }
      const prefix = prefixMatch[1]; // "uploads" | "narration" | "slides"

      const originalFilename = originalPath.split("/").pop() ?? "";
      const ext = originalFilename.includes(".")
        ? "." + originalFilename.split(".").pop()
        : extensionForContentType((asset as any).contentType);

      const newEntityId = `${prefix}/${randomUUID()}${ext}`;
      // Course cards render the hero directly rather than through the
      // course-aware media proxy, so restored heroes must retain the public
      // read policy used by the normal hero upload path. Lesson/narration
      // media stays private and is authorized through the course proxy.
      const assetAcl: ObjectAclPolicy = originalPath === c.imageUrl
        ? { owner: ownerTag, visibility: "public" }
        : privateAcl;

      // ── Store ─────────────────────────────────────────────────────────────
      // Storage failures throw — we will not silently leave broken references.
      const newPath = await storage.storeObjectBytes({
        entityId: newEntityId,
        data: dataBuffer,
        contentType: (asset as any).contentType,
        acl: assetAcl,
      });
      pathMap.set(originalPath, newPath);
      restoredAssetCount++;
    }
  }

  // Review previews are temporary capabilities, not general-purpose course
  // media. Only the claimed PowerPoint commit route may attach its own paths.
  const allowedReviewPaths = new Set(opts.allowedPptxReviewPreviewPaths ?? []);
  for (const module of c.modules ?? []) {
    for (const lesson of module.lessons ?? []) {
      const finalContent = pathMap.size > 0
        ? rewriteMediaUrls(lesson.content ?? {}, pathMap)
        : (lesson.content ?? {});
      for (const objectPath of extractManagedObjectPaths(finalContent)) {
        if (
          isPptxReviewPreviewPath(objectPath) &&
          !allowedReviewPaths.has(objectPath)
        ) {
          throw new Error("PowerPoint review previews can only be attached by their active review session.");
        }
      }
    }
  }

  // Resolve a unique slug
  const baseSlug = opts.slug ?? c.slug ?? slugify(c.title);
  const slug = await uniqueSlug(baseSlug);

  // Resolve / create tags by name
  const tagIds: string[] = [];
  if (Array.isArray(c.tags)) {
    for (const name of c.tags) {
      const trimmed = name.trim();
      if (!trimmed) continue;
      const [existing] = await db.select().from(schema.courseTags)
        .where(eq(schema.courseTags.name, trimmed)).limit(1);
      if (existing) {
        tagIds.push(existing.id);
      } else {
        const [created] = await db.insert(schema.courseTags)
          .values({ name: trimmed } as any)
          .returning();
        tagIds.push(created.id);
      }
    }
  }

  // Rewrite hero image URL if it was a managed path that was restored
  const importedImageUrl = c.imageUrl
    ? (pathMap.get(c.imageUrl) ?? c.imageUrl)
    : undefined;
  if (
    importedImageUrl &&
    isPptxReviewPreviewReference(importedImageUrl) &&
    !allowedReviewPaths.has(importedImageUrl)
  ) {
    throw new Error("PowerPoint review previews cannot be used as imported course images.");
  }

  // Create the course — always imported as "draft" for safety
  const courseData: InsertCourse = {
    slug,
    title: c.title,
    description: c.description ?? "",
    summary: c.summary ?? undefined,
    imageUrl: importedImageUrl,
    estimatedMinutes: c.estimatedMinutes ?? undefined,
    status: "draft",
    visibility: opts.visibility ?? (c.visibility as any) ?? "public",
    ownerTenantId: opts.ownerTenantId,
    passingScore: c.passingScore ?? 80,
    certificateEnabled: c.certificateEnabled ?? false,
    createdBy: opts.createdBy ?? undefined,
  } as any;

  const [course] = await db.insert(schema.courses).values(courseData as any).returning();

  // Attach tags
  if (tagIds.length > 0) {
    await db.insert(schema.courseTagAssignments)
      .values(tagIds.map(tagId => ({ courseId: course.id, tagId })));
  }

  // Create modules + lessons
  let totalLessons = 0;
  const modules = c.modules ?? [];
  for (let mi = 0; mi < modules.length; mi++) {
    const m = modules[mi];
    const moduleData: InsertCourseModule = {
      courseId: course.id,
      title: m.title,
      description: m.description ?? undefined,
      order: m.order ?? mi,
    } as any;
    const [module] = await db.insert(schema.courseModules).values(moduleData as any).returning();

    const lessons = m.lessons ?? [];
    for (let li = 0; li < lessons.length; li++) {
      const l = lessons[li];
      const lessonData: InsertLesson = {
        moduleId: module.id,
        title: l.title,
        type: l.type as any,
        order: l.order ?? li,
        estimatedMinutes: l.estimatedMinutes ?? undefined,
        required: l.required ?? true,
        content: pathMap.size > 0 ? rewriteMediaUrls(l.content ?? {}, pathMap) : (l.content ?? {}),
      } as any;
      await db.insert(schema.lessons).values(lessonData as any);
      totalLessons++;
    }
  }

  return {
    course,
    moduleCount: modules.length,
    lessonCount: totalLessons,
    tagCount: tagIds.length,
    restoredAssetCount,
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function slugify(s: string): string {
  return s.toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

async function uniqueSlug(base: string): Promise<string> {
  let candidate = base || "course";
  let attempt = 0;
  while (true) {
    const [existing] = await db.select({ id: schema.courses.id })
      .from(schema.courses)
      .where(eq(schema.courses.slug, candidate))
      .limit(1);
    if (!existing) return candidate;
    attempt++;
    candidate = `${base}-${attempt + 1}`;
  }
}

/**
 * Recursively rewrite managed object paths in a lesson content payload.
 * Only values of known media-URL field names are rewritten — free-text, HTML,
 * captions and other string fields are left untouched even if they happen to
 * contain an /objects path.
 */
function rewriteMediaUrls(node: unknown, pathMap: Map<string, string>): any {
  if (Array.isArray(node)) {
    return node.map(item => rewriteMediaUrls(item, pathMap));
  }
  if (node && typeof node === "object") {
    const out: Record<string, any> = {};
    for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
      if (typeof value === "string" && MEDIA_URL_KEYS.has(key) && pathMap.has(value)) {
        out[key] = pathMap.get(value)!;
      } else if (typeof value !== "string") {
        out[key] = rewriteMediaUrls(value, pathMap);
      } else {
        out[key] = value;
      }
    }
    return out;
  }
  return node;
}

/** Guess a file extension from a MIME type. */
function extensionForContentType(ct: string): string {
  const base = ct.split(";")[0].trim().toLowerCase();
  const MAP: Record<string, string> = {
    "image/jpeg": ".jpg",
    "image/jpg": ".jpg",
    "image/png": ".png",
    "image/gif": ".gif",
    "image/webp": ".webp",
    "image/svg+xml": ".svg",
    "audio/mpeg": ".mp3",
    "audio/mp3": ".mp3",
    "audio/wav": ".wav",
    "audio/ogg": ".ogg",
    "video/mp4": ".mp4",
    "video/webm": ".webm",
    "application/pdf": ".pdf",
  };
  return MAP[base] ?? "";
}
