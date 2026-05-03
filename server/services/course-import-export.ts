/**
 * Course JSON export / import service.
 *
 * Format: .orion-course.json
 *
 * The file is self-contained: course metadata + all modules + all lessons,
 * including full lesson content payloads.  Tags are represented by name so
 * they survive across platform instances.
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
  Course, CourseModule, Lesson, CourseTag,
  InsertCourse, InsertCourseModule, InsertLesson,
} from "@shared/schema";

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

export interface CourseExportDoc {
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

// ─── Export ──────────────────────────────────────────────────────────────────

export async function exportCourse(courseId: string): Promise<CourseExportDoc | null> {
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
  for (const arr of lessonsByModule.values()) {
    arr.sort((a, b) => a.order - b.order);
  }

  const exportModules: CourseExportModule[] = modules.map(m => ({
    title: m.title,
    description: m.description ?? null,
    order: m.order,
    lessons: (lessonsByModule.get(m.id) ?? []).map(l => ({
      title: l.title,
      type: l.type,
      order: l.order,
      estimatedMinutes: l.estimatedMinutes ?? null,
      required: l.required,
      content: l.content ?? {},
    })),
  }));

  return {
    format: "orion-course",
    version: "1",
    exportedAt: new Date().toISOString(),
    course: {
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
    },
  };
}

// ─── Validation ───────────────────────────────────────────────────────────────

export function validateCourseExportDoc(raw: unknown): asserts raw is CourseExportDoc {
  if (!raw || typeof raw !== "object") throw new Error("Invalid course file: not an object");
  const doc = raw as any;
  if (doc.format !== "orion-course") throw new Error(`Invalid course file: expected format "orion-course", got "${doc.format}"`);
  if (doc.version !== "1") throw new Error(`Unsupported course file version: ${doc.version}`);
  if (!doc.course) throw new Error("Missing 'course' field");
  const c = doc.course;
  if (typeof c.title !== "string" || !c.title.trim()) throw new Error("course.title is required");
  if (!Array.isArray(c.modules)) throw new Error("course.modules must be an array");
  for (const [mi, m] of c.modules.entries()) {
    if (typeof m.title !== "string" || !m.title.trim()) throw new Error(`modules[${mi}].title is required`);
    if (!Array.isArray(m.lessons)) throw new Error(`modules[${mi}].lessons must be an array`);
    for (const [li, l] of m.lessons.entries()) {
      if (typeof l.title !== "string" || !l.title.trim())
        throw new Error(`modules[${mi}].lessons[${li}].title is required`);
      if (typeof l.type !== "string") throw new Error(`modules[${mi}].lessons[${li}].type is required`);
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
}

export interface ImportResult {
  course: Course;
  moduleCount: number;
  lessonCount: number;
  tagCount: number;
}

export async function importCourse(doc: CourseExportDoc, opts: ImportOptions = {}): Promise<ImportResult> {
  const c = doc.course;

  // Resolve a unique slug
  const baseSlug = opts.slug ?? c.slug ?? slugify(c.title);
  const slug = await uniqueSlug(baseSlug);

  // Resolve / create tags by name
  const tagIds: string[] = [];
  if (Array.isArray(c.tags)) {
    for (const name of c.tags) {
      const trimmed = name.trim();
      if (!trimmed) continue;
      // Try find existing
      const [existing] = await db.select().from(schema.courseTags)
        .where(eq(schema.courseTags.name, trimmed)).limit(1);
      if (existing) {
        tagIds.push(existing.id);
      } else {
        const [created] = await db.insert(schema.courseTags)
          .values({ name: trimmed, color: null } as any)
          .returning();
        tagIds.push(created.id);
      }
    }
  }

  // Create the course — always imported as "draft" for safety
  const courseData: InsertCourse = {
    slug,
    title: c.title,
    description: c.description ?? "",
    summary: c.summary ?? undefined,
    imageUrl: c.imageUrl ?? undefined,
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
  for (const [mi, m] of modules.entries()) {
    const moduleData: InsertCourseModule = {
      courseId: course.id,
      title: m.title,
      description: m.description ?? undefined,
      order: m.order ?? mi,
    } as any;
    const [module] = await db.insert(schema.courseModules).values(moduleData as any).returning();

    const lessons = m.lessons ?? [];
    for (const [li, l] of lessons.entries()) {
      const lessonData: InsertLesson = {
        moduleId: module.id,
        title: l.title,
        type: l.type as any,
        order: l.order ?? li,
        estimatedMinutes: l.estimatedMinutes ?? undefined,
        required: l.required ?? true,
        content: l.content ?? {},
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
