/**
 * Course service — DB helpers for the Learning Courses Module.
 *
 * Kept separate from `server/storage.ts` to avoid bloating the IStorage
 * interface and to keep course-specific concerns localized.
 */

import { db } from "../db";
import { and, eq, inArray, or, isNull, desc, sql } from "drizzle-orm";
import * as schema from "@shared/schema";
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
  const [row] = await db.update(schema.lessons).set(data as any).where(eq(schema.lessons.id, id)).returning();
  return row ?? null;
}
export async function deleteLesson(id: string): Promise<void> {
  await db.delete(schema.lessons).where(eq(schema.lessons.id, id));
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

  const updates: any = { progressPercent, status };
  if (status === "completed" && !enr.completedAt) updates.completedAt = new Date();
  if (status === "in_progress" && !enr.startedAt) updates.startedAt = new Date();

  const [row] = await db.update(schema.courseEnrollments)
    .set(updates).where(eq(schema.courseEnrollments.id, enrollmentId)).returning();
  return row;
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
export async function deleteLink(id: string): Promise<void> {
  await db.delete(schema.assessmentCourseLinks).where(eq(schema.assessmentCourseLinks.id, id));
}

/** Score a quiz lesson — returns score 0-100 and pass/fail. */
export function scoreQuiz(
  questions: Array<{ id: string; correctAnswerIds?: string[]; correctAnswerId?: string }>,
  responses: Record<string, string | string[]>,
): { score: number; correct: number; total: number } {
  let correct = 0;
  for (const q of questions) {
    const r = responses[q.id];
    if (!r) continue;
    if (q.correctAnswerIds && q.correctAnswerIds.length > 0) {
      const arr = Array.isArray(r) ? r : [r];
      const sorted = (a: string[]) => [...a].sort().join("|");
      if (sorted(arr) === sorted(q.correctAnswerIds)) correct++;
    } else if (q.correctAnswerId) {
      if (r === q.correctAnswerId) correct++;
    }
  }
  const total = questions.length;
  const score = total === 0 ? 0 : Math.round((correct / total) * 100);
  return { score, correct, total };
}
