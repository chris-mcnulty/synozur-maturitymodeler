/**
 * Course service — DB helpers for the Learning Courses Module.
 *
 * Kept separate from `server/storage.ts` to avoid bloating the IStorage
 * interface and to keep course-specific concerns localized.
 */

import { db } from "../db";
import { and, eq, inArray, or, isNull, desc, sql } from "drizzle-orm";
import * as schema from "@shared/schema";
import { extractManagedObjectPaths } from "@shared/slides";
import type {
  Course, InsertCourse,
  CourseModule, InsertCourseModule,
  Lesson, InsertLesson,
  CourseEnrollment, InsertCourseEnrollment,
  LessonProgress, InsertLessonProgress,
  CourseTag, InsertCourseTag,
  AttestationRecord, InsertAttestationRecord,
  AssessmentCourseLink, InsertAssessmentCourseLink,
} from "@shared/schema";

export interface CourseListOptions {
  status?: string;
  tenantIds?: string[] | null; // tenants the requester belongs to (null = global admin)
  includePrivate?: boolean;
}

export interface CourseWithMeta extends Course {
  moduleCount: number;
  lessonCount: number;
  enrollmentCount: number;
  tags: CourseTag[];
}

export interface CourseFull extends Course {
  modules: (CourseModule & { lessons: Lesson[] })[];
  tags: CourseTag[];
}

/** Visibility filter shared by catalog + admin list. */
async function visibilityFilter(opts: CourseListOptions): Promise<any | undefined> {
  if (opts.tenantIds === null) {
    // Global admin sees everything
    return undefined;
  }
  const tenantIds = opts.tenantIds ?? [];
  if (tenantIds.length === 0) {
    return eq(schema.courses.visibility, "public");
  }
  // Resolve courseIds shared with these tenants via course_tenants junction
  const sharedRows = await db.select({ courseId: schema.courseTenants.courseId })
    .from(schema.courseTenants)
    .where(inArray(schema.courseTenants.tenantId, tenantIds));
  const sharedCourseIds = sharedRows.map(r => r.courseId);

  const conds: any[] = [
    eq(schema.courses.visibility, "public"),
    inArray(schema.courses.ownerTenantId, tenantIds),
  ];
  if (sharedCourseIds.length > 0) {
    conds.push(inArray(schema.courses.id, sharedCourseIds));
  }
  return or(...conds);
}

/** Can the user access this course (read)? */
export async function userCanViewCourse(user: schema.User | undefined, course: schema.Course): Promise<boolean> {
  if (course.visibility === "public") return true;
  if (!user) return false;
  if (user.role === "global_admin") return true;
  if (user.tenantId && course.ownerTenantId === user.tenantId) return true;
  // Check shared via course_tenants
  if (user.tenantId) {
    const [shared] = await db.select().from(schema.courseTenants)
      .where(and(eq(schema.courseTenants.courseId, course.id), eq(schema.courseTenants.tenantId, user.tenantId)))
      .limit(1);
    if (shared) return true;
  }
  return false;
}

/** Can the user manage (edit/delete) this course? */
export function userCanManageCourse(user: schema.User | undefined, course: schema.Course): boolean {
  if (!user) return false;
  if (user.role === "global_admin") return true;
  if (user.role !== "tenant_admin" && user.role !== "tenant_modeler") return false;
  return !!user.tenantId && course.ownerTenantId === user.tenantId;
}

export async function listCourses(opts: CourseListOptions = {}): Promise<CourseWithMeta[]> {
  const conds: any[] = [];
  if (opts.status) conds.push(eq(schema.courses.status, opts.status as any));
  const vis = await visibilityFilter(opts);
  if (vis) conds.push(vis);

  const rows = await db.select().from(schema.courses)
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(desc(schema.courses.updatedAt));

  return enrichCourseList(rows);
}

async function enrichCourseList(rows: Course[]): Promise<CourseWithMeta[]> {
  if (rows.length === 0) return [];
  const ids = rows.map(r => r.id);

  const [modules, lessons, enrolls, tagAssigns] = await Promise.all([
    db.select({ courseId: schema.courseModules.courseId, id: schema.courseModules.id })
      .from(schema.courseModules).where(inArray(schema.courseModules.courseId, ids)),
    db.select({
      moduleId: schema.lessons.moduleId,
      courseId: schema.courseModules.courseId,
    })
      .from(schema.lessons)
      .innerJoin(schema.courseModules, eq(schema.lessons.moduleId, schema.courseModules.id))
      .where(inArray(schema.courseModules.courseId, ids)),
    db.select({ courseId: schema.courseEnrollments.courseId })
      .from(schema.courseEnrollments).where(inArray(schema.courseEnrollments.courseId, ids)),
    db.select({
      courseId: schema.courseTagAssignments.courseId,
      tag: schema.courseTags,
    })
      .from(schema.courseTagAssignments)
      .innerJoin(schema.courseTags, eq(schema.courseTagAssignments.tagId, schema.courseTags.id))
      .where(inArray(schema.courseTagAssignments.courseId, ids)),
  ]);

  const moduleCountByCourse = new Map<string, number>();
  for (const m of modules) moduleCountByCourse.set(m.courseId, (moduleCountByCourse.get(m.courseId) || 0) + 1);
  const lessonCountByCourse = new Map<string, number>();
  for (const l of lessons) lessonCountByCourse.set(l.courseId, (lessonCountByCourse.get(l.courseId) || 0) + 1);
  const enrollCountByCourse = new Map<string, number>();
  for (const e of enrolls) enrollCountByCourse.set(e.courseId, (enrollCountByCourse.get(e.courseId) || 0) + 1);
  const tagsByCourse = new Map<string, CourseTag[]>();
  for (const t of tagAssigns) {
    const arr = tagsByCourse.get(t.courseId) || [];
    arr.push(t.tag);
    tagsByCourse.set(t.courseId, arr);
  }

  return rows.map(c => ({
    ...c,
    moduleCount: moduleCountByCourse.get(c.id) || 0,
    lessonCount: lessonCountByCourse.get(c.id) || 0,
    enrollmentCount: enrollCountByCourse.get(c.id) || 0,
    tags: tagsByCourse.get(c.id) || [],
  }));
}

export async function getCourseFull(idOrSlug: string): Promise<CourseFull | null> {
  const [course] = await db.select().from(schema.courses)
    .where(or(eq(schema.courses.id, idOrSlug), eq(schema.courses.slug, idOrSlug)))
    .limit(1);
  if (!course) return null;

  const [mods, allLessons, tagRows] = await Promise.all([
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

  const lessonsByModule = new Map<string, Lesson[]>();
  for (const row of allLessons) {
    const lesson = (row as any).lessons as Lesson;
    const arr = lessonsByModule.get(lesson.moduleId) || [];
    arr.push(lesson);
    lessonsByModule.set(lesson.moduleId, arr);
  }
  Array.from(lessonsByModule.values()).forEach((arr: Lesson[]) =>
    arr.sort((a, b) => a.order - b.order)
  );

  return {
    ...course,
    modules: mods.map(m => ({ ...m, lessons: lessonsByModule.get(m.id) || [] })),
    tags: tagRows.map(t => t.tag),
  };
}

export async function createCourse(data: InsertCourse): Promise<Course> {
  const [row] = await db.insert(schema.courses).values(data as any).returning();
  return row;
}

export async function updateCourse(id: string, data: Partial<InsertCourse>): Promise<Course | null> {
  const [row] = await db.update(schema.courses)
    .set({ ...data, updatedAt: new Date() } as any)
    .where(eq(schema.courses.id, id)).returning();
  return row ?? null;
}

/**
 * List courses owned by the given tenants (or all, when tenantIds is null)
 * with the requested statuses. Used by admin/modeler manager views to surface
 * THEIR tenant's drafts/archived without leaking other tenants' unpublished
 * courses, even if those happen to be public.
 */
export async function listCoursesOwnedBy(
  tenantIds: string[] | null,
  statuses: string[],
): Promise<CourseWithMeta[]> {
  const conds: any[] = [inArray(schema.courses.status, statuses as any)];
  if (tenantIds !== null) {
    if (tenantIds.length === 0) return [];
    conds.push(inArray(schema.courses.ownerTenantId, tenantIds));
  }
  const rows = await db.select().from(schema.courses)
    .where(and(...conds))
    .orderBy(desc(schema.courses.updatedAt));
  return enrichCourseList(rows);
}

export async function deleteCourse(id: string): Promise<void> {
  await db.delete(schema.courses).where(eq(schema.courses.id, id));
}

// ----- Course ↔ tenant share (manages course_tenants junction) -----
export interface CourseTenantShare {
  id: string;
  tenantId: string;
  tenantName: string;
  createdAt: Date;
}

export async function listCourseTenants(courseId: string): Promise<CourseTenantShare[]> {
  const rows = await db
    .select({
      id: schema.courseTenants.id,
      tenantId: schema.courseTenants.tenantId,
      tenantName: schema.tenants.name,
      createdAt: schema.courseTenants.createdAt,
    })
    .from(schema.courseTenants)
    .innerJoin(schema.tenants, eq(schema.courseTenants.tenantId, schema.tenants.id))
    .where(eq(schema.courseTenants.courseId, courseId));
  return rows;
}

export interface AddCourseTenantResult {
  row: schema.CourseTenant | null;
  created: boolean;
}

export async function addCourseTenant(courseId: string, tenantId: string): Promise<AddCourseTenantResult> {
  const [inserted] = await db.insert(schema.courseTenants)
    .values({ courseId, tenantId })
    .onConflictDoNothing()
    .returning();
  if (inserted) return { row: inserted, created: true };
  // Already existed — fetch the existing row. Could still be missing if a
  // concurrent delete races, so the caller must handle null.
  const [existing] = await db.select().from(schema.courseTenants)
    .where(and(eq(schema.courseTenants.courseId, courseId), eq(schema.courseTenants.tenantId, tenantId)))
    .limit(1);
  return { row: existing ?? null, created: false };
}

export async function removeCourseTenant(courseId: string, tenantId: string): Promise<boolean> {
  const rows = await db.delete(schema.courseTenants)
    .where(and(eq(schema.courseTenants.courseId, courseId), eq(schema.courseTenants.tenantId, tenantId)))
    .returning();
  return rows.length > 0;
}

export async function archiveCourse(id: string): Promise<Course | null> {
  const [row] = await db.update(schema.courses)
    .set({ status: "archived", updatedAt: new Date() } as any)
    .where(eq(schema.courses.id, id)).returning();
  return row ?? null;
}

export async function getCourseById(id: string): Promise<Course | null> {
  const [row] = await db.select().from(schema.courses).where(eq(schema.courses.id, id)).limit(1);
  return row ?? null;
}

/** Returns the parent course of a module (for authorization checks). */
export async function getCourseForModule(moduleId: string): Promise<Course | null> {
  const [row] = await db.select({ course: schema.courses })
    .from(schema.courseModules)
    .innerJoin(schema.courses, eq(schema.courseModules.courseId, schema.courses.id))
    .where(eq(schema.courseModules.id, moduleId))
    .limit(1);
  return (row as any)?.course ?? null;
}

/** Returns the parent course of a lesson (for authorization checks). */
export async function getCourseForLesson(lessonId: string): Promise<{ course: Course; module: CourseModule; lesson: Lesson } | null> {
  const [row] = await db.select({
    lesson: schema.lessons,
    module: schema.courseModules,
    course: schema.courses,
  })
    .from(schema.lessons)
    .innerJoin(schema.courseModules, eq(schema.lessons.moduleId, schema.courseModules.id))
    .innerJoin(schema.courses, eq(schema.courseModules.courseId, schema.courses.id))
    .where(eq(schema.lessons.id, lessonId))
    .limit(1);
  if (!row) return null;
  return { course: (row as any).course, module: (row as any).module, lesson: (row as any).lesson };
}

/**
 * Sequential gating: a lesson is unlocked iff all required lessons that
 * precede it in (module.order, lesson.order) order are completed for the
 * given enrollment.
 */
export async function isLessonUnlocked(courseId: string, lessonId: string, enrollmentId: string): Promise<boolean> {
  const rows = await db.select({ lesson: schema.lessons, module: schema.courseModules })
    .from(schema.lessons)
    .innerJoin(schema.courseModules, eq(schema.lessons.moduleId, schema.courseModules.id))
    .where(eq(schema.courseModules.courseId, courseId));
  const ordered = rows
    .map((r: any) => ({ lesson: r.lesson as Lesson, module: r.module as CourseModule }))
    .sort((a, b) => a.module.order - b.module.order || a.lesson.order - b.lesson.order);
  const idx = ordered.findIndex(o => o.lesson.id === lessonId);
  if (idx < 0) return false;
  const priorRequired = ordered.slice(0, idx).filter(o => o.lesson.required).map(o => o.lesson.id);
  if (priorRequired.length === 0) return true;
  const progress = await db.select().from(schema.lessonProgress)
    .where(and(
      eq(schema.lessonProgress.enrollmentId, enrollmentId),
      inArray(schema.lessonProgress.lessonId, priorRequired),
    ));
  const completedIds = new Set(progress.filter(p => p.status === "completed").map(p => p.lessonId));
  return priorRequired.every(id => completedIds.has(id));
}

// ----- Modules -----
export async function createModule(data: InsertCourseModule): Promise<CourseModule> {
  const [row] = await db.insert(schema.courseModules).values(data).returning();
  return row;
}
export async function updateModule(id: string, data: Partial<InsertCourseModule>): Promise<CourseModule | null> {
  const [row] = await db.update(schema.courseModules).set(data).where(eq(schema.courseModules.id, id)).returning();
  return row ?? null;
}
export async function deleteModule(id: string): Promise<void> {
  await db.delete(schema.courseModules).where(eq(schema.courseModules.id, id));
}

// ----- Lessons -----
export async function createLesson(data: InsertLesson): Promise<Lesson> {
  const [row] = await db.insert(schema.lessons).values(data as any).returning();
  return row;
}
export async function updateLesson(id: string, data: Partial<InsertLesson>): Promise<Lesson | null> {
  // Capture the prior content so we can GC objects the edit removed (e.g. a
  // replaced narration MP3, a deleted image block, regenerated TTS audio).
  const prev = data.content !== undefined ? await getLesson(id) : null;
  const [row] = await db.update(schema.lessons).set(data as any).where(eq(schema.lessons.id, id)).returning();
  if (row && prev) {
    const before = extractManagedObjectPaths(prev.content);
    const after = new Set(extractManagedObjectPaths(row.content));
    await deleteOrphanedObjects(before.filter((p) => !after.has(p)));
  }
  return row ?? null;
}
export async function deleteLesson(id: string): Promise<void> {
  const lesson = await getLesson(id);
  await db.delete(schema.lessons).where(eq(schema.lessons.id, id));
  if (lesson) await deleteOrphanedObjects(extractManagedObjectPaths(lesson.content));
}

/** Best-effort GC of object-storage entities no longer referenced by a lesson. */
async function deleteOrphanedObjects(paths: string[]): Promise<void> {
  if (paths.length === 0) return;
  try {
    const { ObjectStorageService } = await import("../objectStorage");
    const svc = new ObjectStorageService();
    await Promise.all(paths.map((p) => svc.deleteObjectByPath(p)));
  } catch (err) {
    console.error("deleteOrphanedObjects failed", err);
  }
}
export async function getLesson(id: string): Promise<Lesson | null> {
  const [row] = await db.select().from(schema.lessons).where(eq(schema.lessons.id, id)).limit(1);
  return row ?? null;
}

// ----- Enrollments / Progress -----
export async function getOrCreateEnrollment(courseId: string, userId: string, tenantId: string | null): Promise<CourseEnrollment> {
  const [existing] = await db.select().from(schema.courseEnrollments)
    .where(and(eq(schema.courseEnrollments.courseId, courseId), eq(schema.courseEnrollments.userId, userId)))
    .limit(1);
  if (existing) return existing;
  const [row] = await db.insert(schema.courseEnrollments).values({
    courseId, userId, tenantId: tenantId || undefined, status: "enrolled",
  } as any).returning();
  return row;
}

export async function getEnrollment(courseId: string, userId: string): Promise<CourseEnrollment | null> {
  const [row] = await db.select().from(schema.courseEnrollments)
    .where(and(eq(schema.courseEnrollments.courseId, courseId), eq(schema.courseEnrollments.userId, userId)))
    .limit(1);
  return row ?? null;
}

export async function listMyEnrollments(userId: string): Promise<(CourseEnrollment & { course: Course })[]> {
  const rows = await db.select().from(schema.courseEnrollments)
    .innerJoin(schema.courses, eq(schema.courseEnrollments.courseId, schema.courses.id))
    .where(eq(schema.courseEnrollments.userId, userId))
    .orderBy(desc(schema.courseEnrollments.enrolledAt));
  return rows.map((r: any) => ({ ...r.course_enrollments, course: r.courses }));
}

export async function listEnrollmentsForCourse(courseId: string): Promise<(CourseEnrollment & { user: { id: string; name: string | null; email: string | null; username: string } })[]> {
  const rows = await db.select().from(schema.courseEnrollments)
    .innerJoin(schema.users, eq(schema.courseEnrollments.userId, schema.users.id))
    .where(eq(schema.courseEnrollments.courseId, courseId))
    .orderBy(desc(schema.courseEnrollments.enrolledAt));
  return rows.map((r: any) => ({
    ...r.course_enrollments,
    user: { id: r.users.id, name: r.users.name, email: r.users.email, username: r.users.username },
  }));
}

export async function getLessonProgressForEnrollment(enrollmentId: string): Promise<LessonProgress[]> {
  return await db.select().from(schema.lessonProgress)
    .where(eq(schema.lessonProgress.enrollmentId, enrollmentId));
}

export async function upsertLessonProgress(
  enrollmentId: string,
  lessonId: string,
  patch: Partial<InsertLessonProgress> & { status?: schema.LessonProgressStatus; score?: number; data?: any },
): Promise<LessonProgress> {
  const [existing] = await db.select().from(schema.lessonProgress)
    .where(and(eq(schema.lessonProgress.enrollmentId, enrollmentId), eq(schema.lessonProgress.lessonId, lessonId)))
    .limit(1);

  const now = new Date();
  if (existing) {
    const updates: any = { ...patch, updatedAt: now };
    if (patch.status === "in_progress" && !existing.startedAt) updates.startedAt = now;
    if (patch.status === "completed" || patch.status === "failed") updates.completedAt = now;
    if (patch.status === "completed" || patch.status === "failed") {
      updates.attempts = (existing.attempts ?? 0) + 1;
    }
    const [row] = await db.update(schema.lessonProgress)
      .set(updates).where(eq(schema.lessonProgress.id, existing.id)).returning();
    return row;
  }
  const insertData: any = {
    enrollmentId, lessonId,
    status: patch.status ?? "in_progress",
    score: patch.score ?? null,
    data: patch.data ?? null,
    attempts: patch.status === "completed" || patch.status === "failed" ? 1 : 0,
    startedAt: now,
    completedAt: patch.status === "completed" || patch.status === "failed" ? now : null,
    updatedAt: now,
  };
  const [row] = await db.insert(schema.lessonProgress).values(insertData).returning();
  return row;
}

/**
 * Recalculate enrollment progress percent + status from lesson progress rows.
 * Returns the updated enrollment.
 *
 * On the first transition to "completed" (i.e. there was no prior
 * `completedAt`) on a course that has `certificateEnabled = true`, this
 * also generates a branded PDF certificate, stores it in private object
 * storage, and stamps `certificateUrl` on the enrollment row. Failures
 * during PDF generation are logged but do not roll back the completion.
 */
export async function recalculateEnrollment(enrollmentId: string): Promise<CourseEnrollment | null> {
  const [enr] = await db.select().from(schema.courseEnrollments)
    .where(eq(schema.courseEnrollments.id, enrollmentId)).limit(1);
  if (!enr) return null;

  const lessonRows = await db.select({ lesson: schema.lessons })
    .from(schema.lessons)
    .innerJoin(schema.courseModules, eq(schema.lessons.moduleId, schema.courseModules.id))
    .where(eq(schema.courseModules.courseId, enr.courseId));
  const requiredLessons = lessonRows.map(r => r.lesson).filter(l => l.required);
  const totalRequired = requiredLessons.length;

  const progress = await getLessonProgressForEnrollment(enrollmentId);
  const completedRequired = progress.filter(p =>
    p.status === "completed" && requiredLessons.some(l => l.id === p.lessonId)
  ).length;

  const progressPercent = totalRequired === 0 ? 0 : Math.round((completedRequired / totalRequired) * 100);
  let status: schema.EnrollmentStatus = enr.status;
  if (progressPercent >= 100) status = "completed";
  else if (progressPercent > 0) status = "in_progress";

  const wasCompleted = enr.status === "completed";

  const updates: any = { progressPercent, status };
  const wasAlreadyCompleted = !!enr.completedAt;
  if (status === "completed" && !enr.completedAt) updates.completedAt = new Date();
  if (status === "in_progress" && !enr.startedAt) updates.startedAt = new Date();

  const [row] = await db.update(schema.courseEnrollments)
    .set(updates).where(eq(schema.courseEnrollments.id, enrollmentId)).returning();

  // First transition to completed: run both flows.
  // 1. Local certificate PDF generation, which stamps certificateUrl on
  //    the enrollment row (legacy/local course module behavior).
  // 2. Galaxy webhook fanout: course.completed (always) and
  //    certificate.issued when the course has certificateEnabled. Webhook
  //    delivery is best-effort; failures are logged but not surfaced.
  let finalRow = row;
  if (row && status === "completed" && !wasAlreadyCompleted && !row.certificateUrl) {
    try {
      const updated = await maybeIssueCertificate(row);
      if (updated) finalRow = updated;
    } catch (err) {
      console.error("[certificate] generation failed for enrollment", enrollmentId, err);
    }
  }

  if (status === "completed" && !wasCompleted && row.tenantId) {
    try {
      const [course] = await db.select().from(schema.courses)
        .where(eq(schema.courses.id, row.courseId)).limit(1);
      const { emitGalaxyEvent } = await import("../routes/galaxy/webhooks");
      const { issueCertificateAndEmit } = await import("../routes/galaxy");
      await emitGalaxyEvent(row.tenantId, "course.completed", {
        courseId: row.courseId,
        courseTitle: course?.title,
        userId: row.userId,
        completedAt: row.completedAt,
      });
      if (course?.certificateEnabled) {
        await issueCertificateAndEmit({
          tenantId: row.tenantId,
          userId: row.userId,
          sourceType: "course",
          sourceId: row.courseId,
          title: `${course.title} — Certificate of Completion`,
          pdfUrl: finalRow?.certificateUrl ?? null,
        });
      }
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("[course-service] galaxy event emit failed", err);
    }
  }

  return finalRow;
}

/**
 * If the enrollment's course has `certificateEnabled = true`, generate
 * the PDF, persist it, stamp `certificateUrl`, and return the updated row.
 * Returns null if no certificate is required or generation fails.
 */
export async function maybeIssueCertificate(enrollment: CourseEnrollment): Promise<CourseEnrollment | null> {
  const [course] = await db.select().from(schema.courses)
    .where(eq(schema.courses.id, enrollment.courseId)).limit(1);
  if (!course || !course.certificateEnabled) return null;

  const [user] = await db.select().from(schema.users)
    .where(eq(schema.users.id, enrollment.userId)).limit(1);
  if (!user) return null;

  // Average score across graded (quiz) lessons, if any.
  const lp = await getLessonProgressForEnrollment(enrollment.id);
  const scored = lp.filter(p => typeof p.score === "number");
  const avgScore = scored.length > 0
    ? Math.round(scored.reduce((s, p) => s + (p.score ?? 0), 0) / scored.length)
    : null;

  const learnerName = (user.name && user.name.trim())
    || (user.email && user.email.split("@")[0])
    || user.username;

  // Lazy-load to avoid pulling pdf-lib into the main module graph at boot.
  const { generateAndStoreCertificate } = await import("./certificate-pdf");
  const url = await generateAndStoreCertificate({
    courseTitle: course.title,
    learnerName,
    completedAt: enrollment.completedAt ?? new Date(),
    score: avgScore,
  }, enrollment.userId);

  const [updated] = await db.update(schema.courseEnrollments)
    .set({ certificateUrl: url } as any)
    .where(eq(schema.courseEnrollments.id, enrollment.id))
    .returning();
  return updated ?? null;
}

// ----- Tags -----
export async function listTags(): Promise<CourseTag[]> {
  return await db.select().from(schema.courseTags).orderBy(schema.courseTags.name);
}
export async function createTag(data: InsertCourseTag): Promise<CourseTag> {
  const [row] = await db.insert(schema.courseTags).values(data).returning();
  return row;
}
export async function deleteTag(id: string): Promise<void> {
  await db.delete(schema.courseTags).where(eq(schema.courseTags.id, id));
}
export async function setCourseTags(courseId: string, tagIds: string[]): Promise<void> {
  await db.delete(schema.courseTagAssignments).where(eq(schema.courseTagAssignments.courseId, courseId));
  if (tagIds.length > 0) {
    await db.insert(schema.courseTagAssignments).values(
      tagIds.map(tagId => ({ courseId, tagId }))
    );
  }
}

// ----- Attestation -----
export async function recordAttestation(data: InsertAttestationRecord): Promise<AttestationRecord> {
  const [row] = await db.insert(schema.attestationRecords).values(data).returning();
  return row;
}
export async function listAttestationsForTenant(tenantIds: string[] | null): Promise<AttestationRecord[]> {
  if (tenantIds === null) {
    return await db.select().from(schema.attestationRecords).orderBy(desc(schema.attestationRecords.signedAt));
  }
  if (tenantIds.length === 0) return [];
  return await db.select().from(schema.attestationRecords)
    .where(inArray(schema.attestationRecords.tenantId, tenantIds))
    .orderBy(desc(schema.attestationRecords.signedAt));
}

// ----- Assessment ↔ course links -----
export async function listLinksForModel(modelId: string): Promise<AssessmentCourseLink[]> {
  return await db.select().from(schema.assessmentCourseLinks)
    .where(eq(schema.assessmentCourseLinks.modelId, modelId));
}
export async function createLink(data: InsertAssessmentCourseLink): Promise<AssessmentCourseLink> {
  const [row] = await db.insert(schema.assessmentCourseLinks).values(data).returning();
  return row;
}
export async function updateLink(
  id: string,
  patch: Partial<Pick<schema.AssessmentCourseLink, "dimensionId" | "courseId" | "scoreThreshold" | "priority">>,
): Promise<schema.AssessmentCourseLink | null> {
  const [row] = await db.update(schema.assessmentCourseLinks)
    .set(patch)
    .where(eq(schema.assessmentCourseLinks.id, id))
    .returning();
  return row ?? null;
}
export async function deleteLink(id: string): Promise<void> {
  await db.delete(schema.assessmentCourseLinks).where(eq(schema.assessmentCourseLinks.id, id));
}
export async function getLink(id: string): Promise<schema.AssessmentCourseLink | null> {
  const [row] = await db.select().from(schema.assessmentCourseLinks)
    .where(eq(schema.assessmentCourseLinks.id, id)).limit(1);
  return row ?? null;
}

export interface RecommendedCourse extends CourseWithMeta {
  matchedDimensionId: string | null;
  matchedDimensionLabel: string | null;
  matchedScore: number;
  threshold: number;
  priority: number;
}

/**
 * Recommend courses for a completed assessment by joining the per-dimension
 * normalized scores against the model's `assessment_course_links`.
 *
 * - Dimension scores are normalized to 0-100 using the model's maturity scale.
 *   (For 500-point legacy models the raw dim score is divided by the same
 *   max; for 100-point models it is already on the right scale.)
 * - A link triggers when the relevant score is at or below the link's
 *   `scoreThreshold`. A link with a null `dimensionId` matches the overall
 *   normalized score instead of a specific dimension.
 * - Results respect course visibility (public + tenant-owned/shared) for the
 *   passed-in user. Anonymous callers see only published, public courses.
 */
export async function recommendCoursesForAssessment(
  assessmentId: string,
  user?: schema.User,
): Promise<RecommendedCourse[]> {
  const [assessment] = await db.select().from(schema.assessments)
    .where(eq(schema.assessments.id, assessmentId)).limit(1);
  if (!assessment) return [];
  const [result] = await db.select().from(schema.results)
    .where(eq(schema.results.assessmentId, assessmentId)).limit(1);
  if (!result) return [];

  const [model] = await db.select().from(schema.models)
    .where(eq(schema.models.id, assessment.modelId)).limit(1);
  if (!model) return [];

  const scale = Array.isArray(model.maturityScale) ? (model.maturityScale as any[]) : [];
  const maxMaturityScore = scale.length > 0
    ? Math.max(...scale.map(l => Number(l.maxScore) || 0))
    : 500;
  const dimensionMaxScore = maxMaturityScore <= 100 ? 100 : maxMaturityScore;

  const dims = await db.select().from(schema.dimensions)
    .where(eq(schema.dimensions.modelId, assessment.modelId));

  const rawScores = (result.dimensionScores ?? {}) as Record<string, number>;
  const normalizedById = new Map<string, { score: number; label: string }>();
  for (const d of dims) {
    const raw = rawScores[d.key] ?? 0;
    const normalized = dimensionMaxScore > 0
      ? Math.round((raw / dimensionMaxScore) * 100)
      : 0;
    normalizedById.set(d.id, { score: normalized, label: d.label });
  }
  const overallNormalized = maxMaturityScore > 0
    ? Math.round((result.overallScore / maxMaturityScore) * 100)
    : 0;

  const links = await db.select().from(schema.assessmentCourseLinks)
    .where(eq(schema.assessmentCourseLinks.modelId, assessment.modelId));

  // Best-priority triggered link per courseId
  const triggered = new Map<string, {
    priority: number; threshold: number; score: number;
    dimensionId: string | null; dimensionLabel: string | null;
  }>();
  for (const l of links) {
    let score: number;
    let dimensionLabel: string | null = null;
    if (l.dimensionId) {
      const entry = normalizedById.get(l.dimensionId);
      if (!entry) continue;
      score = entry.score;
      dimensionLabel = entry.label;
    } else {
      score = overallNormalized;
    }
    if (score > l.scoreThreshold) continue;
    const existing = triggered.get(l.courseId);
    if (!existing || l.priority > existing.priority) {
      triggered.set(l.courseId, {
        priority: l.priority,
        threshold: l.scoreThreshold,
        score,
        dimensionId: l.dimensionId ?? null,
        dimensionLabel,
      });
    }
  }
  if (triggered.size === 0) return [];

  // Visibility: anonymous => public only; tenant users => their tenants;
  // global admins => all.
  let tenantIds: string[] | null;
  if (!user) {
    tenantIds = [];
  } else if (user.role === "global_admin") {
    tenantIds = null;
  } else {
    tenantIds = user.tenantId ? [user.tenantId] : [];
  }

  const candidateIds = Array.from(triggered.keys());
  const courseRows = await db.select().from(schema.courses)
    .where(and(
      inArray(schema.courses.id, candidateIds),
      eq(schema.courses.status, "published"),
    ));

  // Filter for visibility per-course (public or owned/shared with user's tenant)
  const visible: Course[] = [];
  for (const c of courseRows) {
    if (c.visibility === "public") { visible.push(c); continue; }
    if (tenantIds === null) { visible.push(c); continue; }
    if (tenantIds.length === 0) continue;
    if (c.ownerTenantId && tenantIds.includes(c.ownerTenantId)) {
      visible.push(c); continue;
    }
    const [shared] = await db.select().from(schema.courseTenants)
      .where(and(
        eq(schema.courseTenants.courseId, c.id),
        inArray(schema.courseTenants.tenantId, tenantIds),
      )).limit(1);
    if (shared) visible.push(c);
  }
  if (visible.length === 0) return [];

  const enriched = await enrichCourseList(visible);
  const out: RecommendedCourse[] = enriched.map(c => {
    const t = triggered.get(c.id)!;
    return {
      ...c,
      matchedDimensionId: t.dimensionId,
      matchedDimensionLabel: t.dimensionLabel,
      matchedScore: t.score,
      threshold: t.threshold,
      priority: t.priority,
    };
  });
  out.sort((a, b) => b.priority - a.priority || a.matchedScore - b.matchedScore);
  return out;
}

/**
 * Find the user's most recent completed assessment that has a result row.
 * Used to power the "Suggested for you" section on /courses.
 */
export async function getLatestAssessmentWithResult(userId: string): Promise<{ assessmentId: string } | null> {
  const [row] = await db.select({ id: schema.assessments.id })
    .from(schema.assessments)
    .innerJoin(schema.results, eq(schema.results.assessmentId, schema.assessments.id))
    .where(eq(schema.assessments.userId, userId))
    .orderBy(desc(schema.assessments.completedAt))
    .limit(1);
  return row ? { assessmentId: row.id } : null;
}

/** Score a quiz lesson — returns score 0-100 and pass/fail. */
export function scoreQuiz(
  questions: Array<{ id: string; correctAnswerIds?: string[]; correctAnswerId?: string; correctIds?: string[] }>,
  responses: Record<string, string | string[]>,
): { score: number; correct: number; total: number } {
  let correct = 0;
  for (const q of questions) {
    const r = responses[q.id];
    if (!r) continue;
    // Support both naming conventions: correctIds (sample format) and
    // correctAnswerIds / correctAnswerId (legacy format).
    const multiCorrect = q.correctIds ?? q.correctAnswerIds;
    if (multiCorrect && multiCorrect.length > 0) {
      const arr = Array.isArray(r) ? r : [r];
      const sorted = (a: string[]) => [...a].sort().join("|");
      if (sorted(arr) === sorted(multiCorrect)) correct++;
    } else if (q.correctAnswerId) {
      const single = Array.isArray(r) ? r[0] : r;
      if (single === q.correctAnswerId) correct++;
    }
  }
  const total = questions.length;
  const score = total === 0 ? 0 : Math.round((correct / total) * 100);
  return { score, correct, total };
}
