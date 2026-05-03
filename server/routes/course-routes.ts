/**
 * Course routes — Learning Courses Module API.
 *
 * Authorization model:
 *   - Catalog read (GET /api/courses, GET /api/courses/:id): visibility filter
 *     enforced server-side via course_tenants + ownerTenantId. Drafts/archived
 *     visible only to global admins or owning-tenant admins/modelers.
 *   - Mutations on courses/modules/lessons: must be global admin OR an admin/
 *     modeler in the course's owning tenant. Tenant admins/modelers cannot
 *     change ownerTenantId or visibility — only global admins can.
 *   - Enrollment: only on published courses the user can view.
 *   - Lesson progress / attestation: lesson must belong to the URL course;
 *     enrollment is auto-created; sequential gating enforced server-side.
 *   - Course delete is archive-by-default (status='archived'). Hard delete
 *     requires `?hard=true` AND global admin.
 */

import type { Express, Request, Response } from "express";
import { z } from "zod";
import { ensureAuthenticated, ensureAdminOrModeler } from "../auth";
import { getAccessibleTenantIds, checkIsGlobalAdmin, canManageModels } from "../permissions";
import * as courseSvc from "../services/course-service";
import * as schema from "@shared/schema";
import { db } from "../db";
import { eq } from "drizzle-orm";

/**
 * Redact authoritative grading data from quiz lessons before sending to a
 * learner. Quiz scoring runs server-side, so the client never needs to see
 * `correctAnswerId` / `correctAnswerIds` / `explanation` on individual answers.
 */
function redactGradingKeys<T extends { modules: any[] }>(course: T): T {
  const cloned = { ...course, modules: course.modules.map(m => ({
    ...m,
    lessons: (m.lessons ?? []).map((l: any) => {
      if (l.type !== "quiz") return l;
      const content = (l.content ?? {}) as any;
      const safeQuestions = (content.questions ?? []).map((q: any) => {
        const { correctAnswerId, correctAnswerIds, explanation, ...rest } = q ?? {};
        const answers = (q?.answers ?? []).map((a: any) => {
          const { isCorrect, correct, score, ...arest } = a ?? {};
          return arest;
        });
        return { ...rest, answers };
      });
      const { questions: _omit, ...restContent } = content;
      return {
        ...l,
        content: { ...restContent, questions: safeQuestions },
      };
    }),
  })) };
  return cloned as T;
}

async function requireManageCourse(req: Request, res: Response, courseId: string): Promise<schema.Course | null> {
  const user = req.user as schema.User | undefined;
  const course = await courseSvc.getCourseById(courseId);
  if (!course) {
    res.status(404).json({ error: "Course not found" });
    return null;
  }
  if (!courseSvc.userCanManageCourse(user, course)) {
    res.status(403).json({ error: "Forbidden" });
    return null;
  }
  return course;
}

export function registerCourseRoutes(app: Express) {
  // ---------- Public/learner ----------
  app.get("/api/courses", async (req, res) => {
    try {
      const user = req.user as schema.User | undefined;
      let tenantIds: string[] | null = [];
      let includeDrafts = false;
      if (user) {
        if (checkIsGlobalAdmin(user)) {
          tenantIds = null;
          includeDrafts = true;
        } else {
          // getAccessibleTenantIds returns [] for the regular `user` role, so
          // we union in the user's own tenantId so they can see private
          // courses owned by or shared with their tenant.
          const accessible = getAccessibleTenantIds(user) ?? [];
          const set = new Set<string>(accessible);
          if (user.tenantId) set.add(user.tenantId);
          tenantIds = Array.from(set);
          if (user.role === "tenant_admin" || user.role === "tenant_modeler") {
            includeDrafts = true;
          }
        }
      }
      const manageable = req.query.manageable === "true";
      if (manageable) {
        // Authoring view: courses the caller can manage. Global admins see
        // all; tenant admins/modelers see only courses owned by their tenants
        // (any status).
        if (!user) return res.status(401).json({ error: "Unauthorized" });
        const ownerOnly = checkIsGlobalAdmin(user) ? null : (tenantIds ?? []);
        const all = await courseSvc.listCoursesOwnedBy(ownerOnly, ["draft", "published", "archived"]);
        return res.json(all);
      }
      const published = await courseSvc.listCourses({ tenantIds, status: "published" });
      let payload = published;
      if (includeDrafts && user) {
        const ownerOnly = checkIsGlobalAdmin(user) ? null : (tenantIds ?? []);
        if (ownerOnly === null || ownerOnly.length > 0) {
          const drafts = await courseSvc.listCoursesOwnedBy(ownerOnly, ["draft", "archived"]);
          const seen = new Set(payload.map(c => c.id));
          payload = [...payload, ...drafts.filter(d => !seen.has(d.id))];
        }
      }
      res.json(payload);
    } catch (err: any) {
      console.error("list courses error", err);
      res.status(500).json({ error: err.message ?? "Failed to list courses" });
    }
  });

  app.get("/api/courses/:idOrSlug", async (req, res) => {
    try {
      const course = await courseSvc.getCourseFull(req.params.idOrSlug);
      if (!course) return res.status(404).json({ error: "Course not found" });
      const user = req.user as schema.User | undefined;
      const canView = await courseSvc.userCanViewCourse(user, course);
      if (!canView) return res.status(403).json({ error: "Forbidden" });
      if (course.status !== "published") {
        // Drafts/archived: only visible to managers
        if (!courseSvc.userCanManageCourse(user, course)) {
          return res.status(404).json({ error: "Course not found" });
        }
      }
      const isManager = courseSvc.userCanManageCourse(user, course);
      let payload: any = course;
      if (!isManager) {
        // Redact grading keys from quiz lessons.
        payload = redactGradingKeys(payload);
        // Sequential gating: learners only get content for unlocked lessons.
        // Locked lessons keep their metadata (title/type/order/required) so
        // the syllabus renders, but their `content` is stripped server-side.
        const enrollment = user
          ? await courseSvc.getEnrollment(course.id, user.id)
          : null;
        const allLessons = payload.modules.flatMap((m: any) => m.lessons ?? []);
        const unlockedIds = new Set<string>();
        if (enrollment) {
          for (const l of allLessons) {
            const ok = await courseSvc.isLessonUnlocked(course.id, l.id, enrollment.id);
            if (ok) unlockedIds.add(l.id);
          }
        }
        payload = {
          ...payload,
          modules: payload.modules.map((m: any) => ({
            ...m,
            lessons: (m.lessons ?? []).map((l: any) =>
              unlockedIds.has(l.id) ? l : { ...l, content: null, locked: true },
            ),
          })),
        };
      }
      res.json(payload);
    } catch (err: any) {
      console.error("get course error", err);
      res.status(500).json({ error: err.message ?? "Failed to fetch course" });
    }
  });

  app.post("/api/courses/:id/enroll", ensureAuthenticated, async (req, res) => {
    try {
      const user = req.user as schema.User;
      const course = await courseSvc.getCourseById(req.params.id);
      if (!course) return res.status(404).json({ error: "Course not found" });
      if (course.status !== "published") {
        return res.status(403).json({ error: "Course is not available for enrollment" });
      }
      const canView = await courseSvc.userCanViewCourse(user, course);
      if (!canView) return res.status(403).json({ error: "Forbidden" });
      const enrollment = await courseSvc.getOrCreateEnrollment(course.id, user.id, user.tenantId ?? null);
      res.json(enrollment);
    } catch (err: any) {
      console.error("enroll error", err);
      res.status(500).json({ error: err.message ?? "Failed to enroll" });
    }
  });

  app.get("/api/me/courses", ensureAuthenticated, async (req, res) => {
    try {
      const user = req.user as schema.User;
      const enrollments = await courseSvc.listMyEnrollments(user.id);
      res.json(enrollments);
    } catch (err: any) {
      res.status(500).json({ error: err.message ?? "Failed" });
    }
  });

  app.get("/api/courses/:id/my-progress", ensureAuthenticated, async (req, res) => {
    try {
      const user = req.user as schema.User;
      const enrollment = await courseSvc.getEnrollment(req.params.id, user.id);
      if (!enrollment) return res.json({ enrollment: null, progress: [] });
      const progress = await courseSvc.getLessonProgressForEnrollment(enrollment.id);
      res.json({ enrollment, progress });
    } catch (err: any) {
      res.status(500).json({ error: err.message ?? "Failed" });
    }
  });

  const progressSchema = z.object({
    status: z.enum(schema.LESSON_PROGRESS_STATUSES).optional(),
    score: z.number().int().min(0).max(100).optional(),
    data: z.any().optional(),
  });

  app.post("/api/courses/:id/lessons/:lid/progress", ensureAuthenticated, async (req, res) => {
    try {
      const user = req.user as schema.User;
      const parsed = progressSchema.parse(req.body);

      const course = await courseSvc.getCourseById(req.params.id);
      if (!course) return res.status(404).json({ error: "Course not found" });
      if (course.status !== "published" && !courseSvc.userCanManageCourse(user, course)) {
        return res.status(403).json({ error: "Course is not available" });
      }
      if (!(await courseSvc.userCanViewCourse(user, course))) {
        return res.status(403).json({ error: "Forbidden" });
      }

      // Lesson must belong to this course
      const lessonCtx = await courseSvc.getCourseForLesson(req.params.lid);
      if (!lessonCtx || lessonCtx.course.id !== course.id) {
        return res.status(400).json({ error: "Lesson does not belong to this course" });
      }
      const { lesson } = lessonCtx;

      const enrollment = await courseSvc.getOrCreateEnrollment(course.id, user.id, user.tenantId ?? null);

      // Sequential gating
      const unlocked = await courseSvc.isLessonUnlocked(course.id, lesson.id, enrollment.id);
      if (!unlocked) {
        return res.status(403).json({ error: "Previous required lessons must be completed first" });
      }

      // Lesson-type integrity: quizzes, attestations, and SCORM cannot be
      // marked complete via this generic endpoint — they have dedicated
      // paths that produce the required server-validated artifacts
      // (graded score, signed attestation record, SCORM cmi state).
      let finalPatch: any = parsed;
      if (lesson.type === "quiz") {
        if (!parsed.data?.responses) {
          return res.status(400).json({
            error: "Quizzes must be submitted with a 'responses' map; manual completion is not allowed.",
          });
        }
        const questions = (lesson.content as any)?.questions || [];
        const { score } = courseSvc.scoreQuiz(questions, parsed.data.responses);
        const passingScore = (lesson.content as any)?.passingScore ?? 70;
        finalPatch = {
          data: parsed.data,
          score,
          status: score >= passingScore ? "completed" : "failed",
        };
      } else if (lesson.type === "attestation") {
        return res.status(400).json({
          error: "Attestation lessons must be completed via the /attest endpoint.",
        });
      } else if (lesson.type === "scorm") {
        return res.status(400).json({
          error: "SCORM lessons can only be progressed through the SCORM runtime.",
        });
      } else {
        // Allowed lesson types for direct status reporting: rich_text, slides, video, audio
        const allowedStatuses: schema.LessonProgressStatus[] = ["not_started", "in_progress", "completed"];
        if (parsed.status && !allowedStatuses.includes(parsed.status)) {
          return res.status(400).json({ error: `Invalid status for ${lesson.type} lesson` });
        }
        // Don't allow client-supplied scores on non-quiz lessons
        finalPatch = { status: parsed.status, data: parsed.data };
      }

      const progress = await courseSvc.upsertLessonProgress(enrollment.id, lesson.id, finalPatch);
      const updated = await courseSvc.recalculateEnrollment(enrollment.id);
      res.json({ progress, enrollment: updated });
    } catch (err: any) {
      console.error("progress error", err);
      res.status(400).json({ error: err.message ?? "Failed to record progress" });
    }
  });

  const attestSchema = z.object({
    signedName: z.string().min(1).max(255),
  });

  app.post("/api/courses/:id/lessons/:lid/attest", ensureAuthenticated, async (req, res) => {
    try {
      const user = req.user as schema.User;
      const parsed = attestSchema.parse(req.body);

      const course = await courseSvc.getCourseById(req.params.id);
      if (!course) return res.status(404).json({ error: "Course not found" });
      if (course.status !== "published" && !courseSvc.userCanManageCourse(user, course)) {
        return res.status(403).json({ error: "Course is not available" });
      }
      if (!(await courseSvc.userCanViewCourse(user, course))) {
        return res.status(403).json({ error: "Forbidden" });
      }

      const lessonCtx = await courseSvc.getCourseForLesson(req.params.lid);
      if (!lessonCtx || lessonCtx.course.id !== course.id) {
        return res.status(400).json({ error: "Lesson does not belong to this course" });
      }
      const { lesson } = lessonCtx;
      if (lesson.type !== "attestation") {
        return res.status(400).json({ error: "Lesson is not an attestation" });
      }

      const enrollment = await courseSvc.getOrCreateEnrollment(course.id, user.id, user.tenantId ?? null);
      const unlocked = await courseSvc.isLessonUnlocked(course.id, lesson.id, enrollment.id);
      if (!unlocked) {
        return res.status(403).json({ error: "Previous required lessons must be completed first" });
      }

      const statement = (lesson.content as any)?.statement || "I attest I have read and understood the material.";
      const record = await courseSvc.recordAttestation({
        enrollmentId: enrollment.id,
        lessonId: lesson.id,
        userId: user.id,
        tenantId: user.tenantId ?? undefined,
        statement,
        signedName: parsed.signedName,
        ipAddress: req.ip,
        userAgent: req.headers["user-agent"] || null,
      } as any);
      const progress = await courseSvc.upsertLessonProgress(enrollment.id, lesson.id, {
        status: "completed",
        data: { signedName: parsed.signedName, attestationId: record.id } as any,
      });
      const updated = await courseSvc.recalculateEnrollment(enrollment.id);
      res.json({ record, progress, enrollment: updated });
    } catch (err: any) {
      console.error("attest error", err);
      res.status(400).json({ error: err.message ?? "Failed to record attestation" });
    }
  });

  // ---------- Admin/modeler ----------
  app.post("/api/courses", ensureAdminOrModeler, async (req, res) => {
    try {
      const user = req.user as schema.User;
      const isGlobal = checkIsGlobalAdmin(user);
      // Tenant admins/modelers can ONLY create courses owned by their tenant.
      // Visibility may be public/private; ownerTenantId is forced.
      const ownerTenantId = isGlobal
        ? (req.body.ownerTenantId ?? null)
        : (user.tenantId ?? null);
      if (!isGlobal && !user.tenantId) {
        return res.status(403).json({ error: "Tenant admins must be assigned to a tenant" });
      }
      const parsed = schema.insertCourseSchema.parse({
        ...req.body,
        createdBy: user.id,
        ownerTenantId,
      });
      const course = await courseSvc.createCourse(parsed);
      if (Array.isArray(req.body.tagIds)) {
        await courseSvc.setCourseTags(course.id, req.body.tagIds);
      }
      res.json(course);
    } catch (err: any) {
      console.error("create course error", err);
      res.status(400).json({ error: err.message ?? "Failed to create course" });
    }
  });

  app.put("/api/courses/:id", ensureAdminOrModeler, async (req, res) => {
    try {
      const user = req.user as schema.User;
      const course = await requireManageCourse(req, res, req.params.id);
      if (!course) return;
      const isGlobal = checkIsGlobalAdmin(user);

      const { tagIds, ownerTenantId, visibility, ...rest } = req.body;
      const patch: any = { ...rest };
      if (isGlobal) {
        if (ownerTenantId !== undefined) patch.ownerTenantId = ownerTenantId;
        if (visibility !== undefined) patch.visibility = visibility;
      } else {
        // Non-global users may post the unchanged values back; only reject if
        // they actually attempt to change owner tenant or visibility.
        if (ownerTenantId !== undefined && ownerTenantId !== course.ownerTenantId) {
          return res.status(403).json({ error: "Only global admins can change a course's owner tenant" });
        }
        if (visibility !== undefined && visibility !== course.visibility) {
          return res.status(403).json({ error: "Only global admins can change a course's visibility" });
        }
      }
      const updated = await courseSvc.updateCourse(course.id, patch);
      if (!updated) return res.status(404).json({ error: "Course not found" });
      if (Array.isArray(tagIds)) {
        await courseSvc.setCourseTags(updated.id, tagIds);
      }
      res.json(updated);
    } catch (err: any) {
      res.status(400).json({ error: err.message ?? "Failed to update course" });
    }
  });

  app.delete("/api/courses/:id", ensureAdminOrModeler, async (req, res) => {
    try {
      const user = req.user as schema.User;
      const course = await requireManageCourse(req, res, req.params.id);
      if (!course) return;
      const hard = req.query.hard === "true";
      if (hard) {
        if (!checkIsGlobalAdmin(user)) {
          return res.status(403).json({ error: "Only global admins can hard-delete a course" });
        }
        await courseSvc.deleteCourse(course.id);
        return res.json({ success: true, deleted: true });
      }
      const archived = await courseSvc.archiveCourse(course.id);
      res.json({ success: true, archived: true, course: archived });
    } catch (err: any) {
      res.status(500).json({ error: err.message ?? "Failed" });
    }
  });

  app.post("/api/courses/:id/modules", ensureAdminOrModeler, async (req, res) => {
    try {
      const course = await requireManageCourse(req, res, req.params.id);
      if (!course) return;
      const parsed = schema.insertCourseModuleSchema.parse({ ...req.body, courseId: course.id });
      res.json(await courseSvc.createModule(parsed));
    } catch (err: any) {
      res.status(400).json({ error: err.message ?? "Failed" });
    }
  });

  app.put("/api/course-modules/:id", ensureAdminOrModeler, async (req, res) => {
    try {
      const user = req.user as schema.User;
      const course = await courseSvc.getCourseForModule(req.params.id);
      if (!course) return res.status(404).json({ error: "Module not found" });
      if (!courseSvc.userCanManageCourse(user, course)) return res.status(403).json({ error: "Forbidden" });
      const { courseId, ...patch } = req.body;
      const mod = await courseSvc.updateModule(req.params.id, patch);
      if (!mod) return res.status(404).json({ error: "Not found" });
      res.json(mod);
    } catch (err: any) {
      res.status(400).json({ error: err.message ?? "Failed" });
    }
  });

  app.delete("/api/course-modules/:id", ensureAdminOrModeler, async (req, res) => {
    try {
      const user = req.user as schema.User;
      const course = await courseSvc.getCourseForModule(req.params.id);
      if (!course) return res.status(404).json({ error: "Module not found" });
      if (!courseSvc.userCanManageCourse(user, course)) return res.status(403).json({ error: "Forbidden" });
      await courseSvc.deleteModule(req.params.id);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message ?? "Failed" });
    }
  });

  app.post("/api/course-modules/:mid/lessons", ensureAdminOrModeler, async (req, res) => {
    try {
      const user = req.user as schema.User;
      const course = await courseSvc.getCourseForModule(req.params.mid);
      if (!course) return res.status(404).json({ error: "Module not found" });
      if (!courseSvc.userCanManageCourse(user, course)) return res.status(403).json({ error: "Forbidden" });
      const parsed = schema.insertLessonSchema.parse({ ...req.body, moduleId: req.params.mid });
      res.json(await courseSvc.createLesson(parsed));
    } catch (err: any) {
      res.status(400).json({ error: err.message ?? "Failed" });
    }
  });

  app.put("/api/lessons/:id", ensureAdminOrModeler, async (req, res) => {
    try {
      const user = req.user as schema.User;
      const ctx = await courseSvc.getCourseForLesson(req.params.id);
      if (!ctx) return res.status(404).json({ error: "Lesson not found" });
      if (!courseSvc.userCanManageCourse(user, ctx.course)) return res.status(403).json({ error: "Forbidden" });
      const { moduleId, ...patch } = req.body; // disallow moving lesson across modules via PUT
      const lesson = await courseSvc.updateLesson(req.params.id, patch);
      if (!lesson) return res.status(404).json({ error: "Not found" });
      res.json(lesson);
    } catch (err: any) {
      res.status(400).json({ error: err.message ?? "Failed" });
    }
  });

  app.delete("/api/lessons/:id", ensureAdminOrModeler, async (req, res) => {
    try {
      const user = req.user as schema.User;
      const ctx = await courseSvc.getCourseForLesson(req.params.id);
      if (!ctx) return res.status(404).json({ error: "Lesson not found" });
      if (!courseSvc.userCanManageCourse(user, ctx.course)) return res.status(403).json({ error: "Forbidden" });
      await courseSvc.deleteLesson(req.params.id);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message ?? "Failed" });
    }
  });

  app.get("/api/courses/:id/enrollments", ensureAdminOrModeler, async (req, res) => {
    try {
      const course = await requireManageCourse(req, res, req.params.id);
      if (!course) return;
      const enrollments = await courseSvc.listEnrollmentsForCourse(course.id);
      res.json(enrollments);
    } catch (err: any) {
      res.status(500).json({ error: err.message ?? "Failed" });
    }
  });

  // ----- Tags (global taxonomy) -----
  app.get("/api/course-tags", async (_req, res) => {
    try { res.json(await courseSvc.listTags()); }
    catch (err: any) { res.status(500).json({ error: err.message ?? "Failed" }); }
  });
  app.post("/api/course-tags", ensureAdminOrModeler, async (req, res) => {
    try {
      const user = req.user as schema.User;
      const parsed = schema.insertCourseTagSchema.parse({ ...req.body, createdBy: user.id });
      res.json(await courseSvc.createTag(parsed));
    } catch (err: any) { res.status(400).json({ error: err.message ?? "Failed" }); }
  });
  app.delete("/api/course-tags/:id", ensureAdminOrModeler, async (req, res) => {
    try {
      const user = req.user as schema.User;
      // Only global admins can delete shared taxonomy
      if (!checkIsGlobalAdmin(user)) return res.status(403).json({ error: "Only global admins can delete tags" });
      await courseSvc.deleteTag(req.params.id);
      res.json({ success: true });
    } catch (err: any) { res.status(500).json({ error: err.message ?? "Failed" }); }
  });

  // ----- Attestations (admin compliance view) -----
  // Compliance records are limited to tenant_admin / global_admin; modelers
  // do not have a need-to-know for signed legal/HR attestations.
  app.get("/api/attestations", ensureAuthenticated, async (req, res) => {
    try {
      const user = req.user as schema.User;
      if (user.role !== "tenant_admin" && user.role !== "global_admin") {
        return res.status(403).json({ error: "Forbidden" });
      }
      const isGlobal = checkIsGlobalAdmin(user);
      const tenantIds = isGlobal ? null : (getAccessibleTenantIds(user) ?? []);
      const records = await courseSvc.listAttestationsForTenant(tenantIds);
      res.json(records);
    } catch (err: any) { res.status(500).json({ error: err.message ?? "Failed" }); }
  });

  // ----- Recommended courses (driven by assessment_course_links) -----
  app.get("/api/assessments/:id/recommended-courses", async (req, res) => {
    try {
      const user = req.user as schema.User | undefined;
      const recs = await courseSvc.recommendCoursesForAssessment(req.params.id, user);
      res.json(recs);
    } catch (err: any) {
      console.error("recommend courses error", err);
      res.status(500).json({ error: err.message ?? "Failed to fetch recommendations" });
    }
  });

  app.get("/api/me/recommended-courses", ensureAuthenticated, async (req, res) => {
    try {
      const user = req.user as schema.User;
      const latest = await courseSvc.getLatestAssessmentWithResult(user.id);
      if (!latest) return res.json({ assessmentId: null, courses: [] });
      const recs = await courseSvc.recommendCoursesForAssessment(latest.assessmentId, user);
      res.json({ assessmentId: latest.assessmentId, courses: recs });
    } catch (err: any) {
      console.error("recommend my courses error", err);
      res.status(500).json({ error: err.message ?? "Failed to fetch recommendations" });
    }
  });

  // ----- Assessment ↔ course links (global admin only) -----
  // Allow whoever can manage the underlying model to manage its course links.
  async function requireManageLinkModel(req: Request, res: Response, modelId: string): Promise<schema.Model | null> {
    const [model] = await db.select().from(schema.models).where(eq(schema.models.id, modelId)).limit(1);
    if (!model) { res.status(404).json({ error: "Model not found" }); return null; }
    const user = req.user as schema.User;
    if (!canManageModels(user, model.ownerTenantId ?? null)) {
      res.status(403).json({ error: "You do not have permission to manage links for this model" });
      return null;
    }
    return model;
  }

  app.get("/api/models/:id/course-links", ensureAdminOrModeler, async (req, res) => {
    try {
      const model = await requireManageLinkModel(req, res, req.params.id);
      if (!model) return;
      res.json(await courseSvc.listLinksForModel(req.params.id));
    } catch (err: any) { res.status(500).json({ error: err.message ?? "Failed" }); }
  });
  app.post("/api/models/:id/course-links", ensureAdminOrModeler, async (req, res) => {
    try {
      const model = await requireManageLinkModel(req, res, req.params.id);
      if (!model) return;
      const parsed = schema.insertAssessmentCourseLinkSchema.parse({ ...req.body, modelId: req.params.id });
      res.json(await courseSvc.createLink(parsed));
    } catch (err: any) { res.status(400).json({ error: err.message ?? "Failed" }); }
  });
  app.patch("/api/course-links/:id", ensureAdminOrModeler, async (req, res) => {
    try {
      const link = await courseSvc.getLink(req.params.id);
      if (!link) return res.status(404).json({ error: "Link not found" });
      const model = await requireManageLinkModel(req, res, link.modelId);
      if (!model) return;
      const patchSchema = schema.insertAssessmentCourseLinkSchema.partial().pick({
        dimensionId: true, courseId: true, scoreThreshold: true, priority: true,
      });
      const patch = patchSchema.parse(req.body);
      const updated = await courseSvc.updateLink(req.params.id, patch);
      if (!updated) return res.status(404).json({ error: "Link not found" });
      res.json(updated);
    } catch (err: any) { res.status(400).json({ error: err.message ?? "Failed" }); }
  });
  app.delete("/api/course-links/:id", ensureAdminOrModeler, async (req, res) => {
    try {
      const link = await courseSvc.getLink(req.params.id);
      if (!link) return res.status(404).json({ error: "Link not found" });
      const model = await requireManageLinkModel(req, res, link.modelId);
      if (!model) return;
      await courseSvc.deleteLink(req.params.id);
      res.json({ success: true });
    } catch (err: any) { res.status(500).json({ error: err.message ?? "Failed" }); }
  });

  // ----- SCORM (stubbed for follow-up) -----
  app.post("/api/scorm/import", ensureAdminOrModeler, async (_req, res) => {
    res.status(501).json({
      error: "SCORM import not yet implemented",
      hint: "Tracked for a follow-up task. Upload .zip + parse imsmanifest.xml + create course/lesson + serve runtime.",
    });
  });

  app.get("/api/courses/:id/scorm/export", ensureAdminOrModeler, async (req, res) => {
    const course = await requireManageCourse(req, res, req.params.id);
    if (!course) return;
    res.status(501).json({
      error: "SCORM export not yet implemented",
      hint: "Tracked for a follow-up task.",
    });
  });
}
