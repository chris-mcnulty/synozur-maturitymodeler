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
import express from "express";
import { z } from "zod";
import { ensureAuthenticated, ensureAdminOrModeler } from "../auth";
import { getAccessibleTenantIds, checkIsGlobalAdmin, canManageModels } from "../permissions";
import * as courseSvc from "../services/course-service";
import * as scormSvc from "../services/scorm-service";
import * as courseIE from "../services/course-import-export";
import { synthesizeNarration, isTtsConfigured } from "../services/tts-service";
import { importPptx } from "../services/pptx-import";
import { slidesContentSchema, extractManagedObjectPaths } from "@shared/slides";

/**
 * Validate a lesson's content payload against its type. Currently enforces the
 * `slides` block model so malformed slide content can't be persisted by a
 * hand-crafted request (the editor always sends valid data). Throws a ZodError
 * (→ 400) on failure.
 */
function validateLessonContent(type: string, content: unknown): void {
  if (type === "slides") {
    slidesContentSchema.parse(content);
  }
}
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
        // Strip all server-side grading keys regardless of which naming
        // convention the content author used (correctIds, correctAnswerIds,
        // correctAnswerId). The sample-course format uses `options` for the
        // choices array; legacy content may use `answers` — normalise to
        // `answers` so the client only has to handle one field name.
        const { correctAnswerId, correctAnswerIds, correctIds, explanation, ...rest } = q ?? {};
        const rawChoices = q?.options ?? q?.answers ?? [];
        const answers = rawChoices.map((a: any) => {
          const { isCorrect, correct, score, ...arest } = a ?? {};
          return arest;
        });
        // Drop `options` from rest so clients only see `answers`
        const { options: _opts, ...safeRest } = rest;
        return { ...safeRest, answers };
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
        // all; tenant admins/modelers see only courses owned by their tenants.
        // Archived courses are hidden by default; pass ?includeArchived=true
        // to include them.
        if (!user) return res.status(401).json({ error: "Unauthorized" });
        const ownerOnly = checkIsGlobalAdmin(user) ? null : (tenantIds ?? []);
        const includeArchived = req.query.includeArchived === "true";
        const statuses = includeArchived
          ? ["draft", "published", "archived"]
          : ["draft", "published"];
        const all = await courseSvc.listCoursesOwnedBy(ownerOnly, statuses);
        return res.json(all);
      }
      const published = await courseSvc.listCourses({ tenantIds, status: "published" });
      let payload = published;
      if (includeDrafts && user) {
        const ownerOnly = checkIsGlobalAdmin(user) ? null : (tenantIds ?? []);
        if (ownerOnly === null || ownerOnly.length > 0) {
          const drafts = await courseSvc.listCoursesOwnedBy(ownerOnly, ["draft"]);
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

  // Re-issue (or first-issue) the certificate for the current user's enrollment.
  // Useful when generation initially failed, or when the course's
  // `certificateEnabled` flag was flipped on after the learner already
  // completed the course.
  app.post("/api/courses/:id/certificate", ensureAuthenticated, async (req, res) => {
    try {
      const user = req.user as schema.User;
      const enrollment = await courseSvc.getEnrollment(req.params.id, user.id);
      if (!enrollment) return res.status(404).json({ error: "Not enrolled" });
      if (enrollment.status !== "completed") {
        return res.status(400).json({ error: "Course is not completed" });
      }
      const updated = await courseSvc.maybeIssueCertificate(enrollment);
      if (!updated) {
        return res.status(400).json({ error: "Certificate is not enabled for this course" });
      }
      res.json(updated);
    } catch (err: any) {
      console.error("certificate error", err);
      res.status(500).json({ error: err.message ?? "Failed to issue certificate" });
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
      validateLessonContent(parsed.type ?? "rich_text", parsed.content);
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
      if (patch.content !== undefined) {
        validateLessonContent(patch.type ?? ctx.lesson.type, patch.content);
      }
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

  // Update a course's image. The body may contain a freshly-uploaded
  // object-storage URL; we set its ACL to public and persist the
  // normalized path on the course row. Mirrors /api/models/:id/image.
  app.put("/api/courses/:id/image", ensureAdminOrModeler, async (req, res) => {
    try {
      const { imageUrl } = req.body;
      if (!imageUrl) return res.status(400).json({ error: "imageUrl is required" });
      const course = await requireManageCourse(req, res, req.params.id);
      if (!course) return;
      const user = req.user as schema.User;
      const { ObjectStorageService } = await import("../objectStorage");
      const objectStorageService = new ObjectStorageService();
      const normalizedPath = await objectStorageService.trySetObjectEntityAclPolicy(
        imageUrl,
        { owner: user.id || "admin", visibility: "public" },
      );
      const updated = await courseSvc.updateCourse(course.id, { imageUrl: normalizedPath } as any);
      if (!updated) return res.status(404).json({ error: "Course not found" });
      res.json(updated);
    } catch (err: any) {
      console.error("update course image error", err);
      res.status(500).json({ error: err.message ?? "Failed to update course image" });
    }
  });

  // ----- Course ↔ tenant share (private courses) -----
  // Mirrors /api/models/:id/tenants. All operations are global-admin only:
  // tenant assignments expose other tenants' names/IDs, so non-global
  // managers (who can edit a course they own) shouldn't see the share list.
  app.get("/api/courses/:id/tenants", ensureAdminOrModeler, async (req, res) => {
    try {
      const user = req.user as schema.User;
      if (!checkIsGlobalAdmin(user)) {
        return res.status(403).json({ error: "Only global admins can view course tenant access" });
      }
      const course = await requireManageCourse(req, res, req.params.id);
      if (!course) return;
      const rows = await courseSvc.listCourseTenants(course.id);
      res.json(rows);
    } catch (err: any) {
      res.status(500).json({ error: err.message ?? "Failed" });
    }
  });

  app.post("/api/courses/:id/tenants", ensureAdminOrModeler, async (req, res) => {
    try {
      const user = req.user as schema.User;
      if (!checkIsGlobalAdmin(user)) {
        return res.status(403).json({ error: "Only global admins can manage course tenant access" });
      }
      const course = await requireManageCourse(req, res, req.params.id);
      if (!course) return;
      const { tenantId } = req.body;
      if (!tenantId) return res.status(400).json({ error: "tenantId is required" });
      const result = await courseSvc.addCourseTenant(course.id, tenantId);
      // 201 only when the row was newly created. If the assignment already
      // existed, return 200 with the existing row. Race deletion → 409.
      if (result.created) return res.status(201).json(result.row);
      if (result.row) return res.status(200).json(result.row);
      return res.status(409).json({ error: "Tenant assignment was concurrently removed" });
    } catch (err: any) {
      console.error("add course tenant error", err);
      res.status(500).json({ error: err.message ?? "Failed" });
    }
  });

  app.delete("/api/courses/:id/tenants/:tenantId", ensureAdminOrModeler, async (req, res) => {
    try {
      const user = req.user as schema.User;
      if (!checkIsGlobalAdmin(user)) {
        return res.status(403).json({ error: "Only global admins can manage course tenant access" });
      }
      const course = await requireManageCourse(req, res, req.params.id);
      if (!course) return;
      const ok = await courseSvc.removeCourseTenant(course.id, req.params.tenantId);
      if (!ok) return res.status(404).json({ error: "Tenant assignment not found" });
      res.json({ success: true });
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

  // ----- SCORM -----
  // Import endpoint: accepts a raw .zip body (Content-Type: application/zip
  // or application/octet-stream). Express's global JSON parser ignores
  // these content types, so we attach a route-scoped raw parser with a
  // generous 200MB cap to fit typical SCORM training bundles.
  app.post(
    "/api/scorm/import",
    ensureAdminOrModeler,
    express.raw({ type: ["application/zip", "application/octet-stream", "application/x-zip-compressed"], limit: "200mb" }),
    async (req, res) => {
      try {
        const user = req.user as schema.User;
        const buf: Buffer | undefined = req.body && Buffer.isBuffer(req.body) ? req.body : undefined;
        if (!buf || buf.length === 0) {
          return res.status(400).json({
            error: "Empty body. POST a .zip with Content-Type: application/zip",
          });
        }
        const courseId = (req.query.courseId as string | undefined) || undefined;
        if (courseId) {
          const c = await requireManageCourse(req, res, courseId);
          if (!c) return;
        }
        const fileName = (req.query.fileName as string | undefined) || undefined;
        const result = await scormSvc.importScormZip({
          zip: buf,
          uploadedBy: user.id,
          courseId: courseId ?? null,
          fileName,
        });
        res.json(result);
      } catch (err: any) {
        console.error("scorm import error", err);
        res.status(400).json({ error: err.message ?? "Failed to import SCORM" });
      }
    },
  );

  // ----- Slide narration: machine TTS (Azure Speech) -----
  // Generates narration audio for the supplied text, stores it, and returns
  // the object URL. The client patches it onto the slide's narration and saves
  // the lesson as usual.
  app.get("/api/courses/tts/status", ensureAdminOrModeler, (_req, res) => {
    res.json({ configured: isTtsConfigured() });
  });

  app.post("/api/courses/:id/narration/tts", ensureAdminOrModeler, async (req, res) => {
    try {
      const course = await requireManageCourse(req, res, req.params.id);
      if (!course) return;
      const { text, voice } = req.body ?? {};
      if (typeof text !== "string" || !text.trim()) {
        return res.status(400).json({ error: "text is required" });
      }
      const user = req.user as schema.User;
      const result = await synthesizeNarration({ text, voice, ownerUserId: user.id });
      res.json(result);
    } catch (err: any) {
      console.error("tts narration error", err);
      res.status(400).json({ error: err.message ?? "Failed to generate narration" });
    }
  });

  // ----- PowerPoint import → slides -----
  // Accepts a raw .pptx body, renders each slide to an image, and returns the
  // resulting Orion slides for the client to merge into the slide editor.
  app.post(
    "/api/courses/:id/slides/pptx-import",
    ensureAdminOrModeler,
    express.raw({
      type: [
        "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        "application/octet-stream",
        "application/zip",
      ],
      limit: "100mb",
    }),
    async (req, res) => {
      try {
        const course = await requireManageCourse(req, res, req.params.id);
        if (!course) return;
        const buf: Buffer | undefined = req.body && Buffer.isBuffer(req.body) ? req.body : undefined;
        if (!buf || buf.length === 0) {
          return res.status(400).json({
            error: "Empty body. POST a .pptx file as the request body.",
          });
        }
        // A .pptx is a ZIP container — reject anything that isn't (PK\x03\x04)
        // before handing off to LibreOffice.
        if (buf.length < 4 || buf[0] !== 0x50 || buf[1] !== 0x4b || buf[2] !== 0x03 || buf[3] !== 0x04) {
          return res.status(400).json({ error: "File does not look like a .pptx (expected a ZIP/OOXML container)." });
        }
        const user = req.user as schema.User;
        const result = await importPptx({ buffer: buf, ownerUserId: user.id });
        res.json(result);
      } catch (err: any) {
        console.error("pptx import error", err);
        res.status(400).json({ error: err.message ?? "Failed to import PowerPoint" });
      }
    },
  );

  // ----- Finalize an uploaded media object -----
  // After a direct-to-storage Uppy upload, normalize the raw URL to a stable
  // `/objects/...` path and set its ACL so learners can read it. Used by the
  // slide editor for inline images/video and recorded narration audio.
  app.post("/api/objects/finalize", ensureAdminOrModeler, async (req, res) => {
    try {
      const { url } = req.body ?? {};
      if (typeof url !== "string" || !url) {
        return res.status(400).json({ error: "url is required" });
      }
      const user = req.user as schema.User;
      const { ObjectStorageService } = await import("../objectStorage");
      const objectStorageService = new ObjectStorageService();
      // Only finalize freshly-uploaded objects (under the `uploads/` prefix that
      // getObjectEntityUploadURL writes to). This prevents re-ACLing an
      // arbitrary existing object — e.g. flipping someone's private certificate
      // to public — via a guessed/known /objects path.
      const normalizedPath = objectStorageService.normalizeObjectEntityPath(url);
      if (!normalizedPath.startsWith("/objects/uploads/")) {
        return res.status(400).json({ error: "Only freshly uploaded objects can be finalized" });
      }
      // Course/lesson media is private: it's served to learners through the
      // course-aware proxy (`GET /api/courses/:id/media`) which gates by course
      // access. (Hero images are finalized separately via PUT .../image and
      // stay public for the anonymous catalog.)
      await objectStorageService.trySetObjectEntityAclPolicy(url, {
        owner: user.id || "admin",
        visibility: "private",
      });
      res.json({ url: normalizedPath });
    } catch (err: any) {
      console.error("object finalize error", err);
      res.status(400).json({ error: err.message ?? "Failed to finalize object" });
    }
  });

  // Course-aware media proxy. Slide images, narration audio and uploaded
  // lesson media are stored privately; learners reach them only through this
  // route, which gates by course access (anonymous is fine for public,
  // published courses). Course managers stream any managed object (the editor
  // previews media before it's saved into a lesson); everyone else may only
  // fetch objects actually referenced by the course's lessons, so an
  // accessible course can't be used as an open proxy. No `ensureAuthenticated`
  // — anonymous viewers of public courses must work — but session cookies
  // still flow for logged-in users.
  const MANAGED_MEDIA_RE = /^\/objects\/(?:uploads|narration|slides)\/[A-Za-z0-9._\-/]+$/;
  app.get("/api/courses/:id/media", async (req, res) => {
    try {
      const rawPath = typeof req.query.path === "string" ? req.query.path : "";
      if (!MANAGED_MEDIA_RE.test(rawPath)) {
        return res.status(400).json({ error: "Invalid media path" });
      }
      const user = req.user as schema.User | undefined;
      const course = await courseSvc.getCourseById(req.params.id);
      if (!course) return res.status(404).json({ error: "Course not found" });

      const canManage = courseSvc.userCanManageCourse(user, course);
      if (!canManage) {
        if (course.status !== "published") {
          return res.status(403).json({ error: "Course is not available" });
        }
        if (!(await courseSvc.userCanViewCourse(user, course))) {
          return res.status(403).json({ error: "Forbidden" });
        }
        // Confirm the object is referenced by one of this course's lessons.
        const full = await courseSvc.getCourseFull(course.id);
        const referenced = new Set(
          (full?.modules ?? []).flatMap((m: any) =>
            (m.lessons ?? []).flatMap((l: any) => extractManagedObjectPaths(l.content)),
          ),
        );
        if (!referenced.has(rawPath)) {
          return res.status(404).json({ error: "Not found" });
        }
      }

      const { ObjectStorageService, ObjectNotFoundError } = await import("../objectStorage");
      const svc = new ObjectStorageService();
      try {
        const file = await svc.getObjectEntityFile(rawPath);
        await svc.downloadObject(file, res);
      } catch (err) {
        if (err instanceof ObjectNotFoundError) {
          return res.status(404).json({ error: "Not found" });
        }
        throw err;
      }
    } catch (err: any) {
      console.error("course media proxy error", err);
      if (!res.headersSent) res.status(500).json({ error: err.message ?? "Failed" });
    }
  });

  // Resolve a SCORM package and authorize the caller against its owning
  // course. SCORM packages without a courseId (orphan uploads) are only
  // visible to global admins. For attached packages we delegate to the
  // existing course access helpers so tenant scoping is preserved.
  type ScormAccessLevel = "manage" | "view";
  async function loadAuthorizedScormPackage(
    req: Request,
    res: Response,
    pid: string,
    level: ScormAccessLevel,
  ): Promise<schema.ScormPackage | null> {
    const pkg = await scormSvc.getScormPackage(pid);
    if (!pkg) {
      res.status(404).json({ error: "Not found" });
      return null;
    }
    const user = req.user as schema.User | undefined;
    if (!pkg.courseId) {
      if (!user || !checkIsGlobalAdmin(user)) {
        res.status(403).json({ error: "Forbidden" });
        return null;
      }
      return pkg;
    }
    const course = await courseSvc.getCourseById(pkg.courseId);
    if (!course) {
      res.status(404).json({ error: "Course not found" });
      return null;
    }
    const canManage = courseSvc.userCanManageCourse(user, course);
    if (level === "manage") {
      if (!canManage) {
        res.status(403).json({ error: "Forbidden" });
        return null;
      }
      return pkg;
    }
    // view-level: allow managers, otherwise require course visibility
    // and an active/available course state.
    if (!canManage) {
      if (course.status !== "published") {
        res.status(403).json({ error: "Course is not available" });
        return null;
      }
      if (!(await courseSvc.userCanViewCourse(user, course))) {
        res.status(403).json({ error: "Forbidden" });
        return null;
      }
    }
    return pkg;
  }

  // List SCORM packages — scoped to courses the caller can manage so
  // the lesson editor only sees packages from its own tenant(s).
  app.get("/api/scorm/packages", ensureAdminOrModeler, async (req, res) => {
    try {
      const user = req.user as schema.User;
      const { db } = await import("../db");
      const rows = await db.select().from(schema.scormPackages);
      const filtered: schema.ScormPackage[] = [];
      const courseCache = new Map<string, schema.Course | null>();
      const isGlobal = checkIsGlobalAdmin(user);
      for (const pkg of rows) {
        if (!pkg.courseId) {
          if (isGlobal) filtered.push(pkg);
          continue;
        }
        let course = courseCache.get(pkg.courseId);
        if (course === undefined) {
          course = await courseSvc.getCourseById(pkg.courseId);
          courseCache.set(pkg.courseId, course);
        }
        if (course && courseSvc.userCanManageCourse(user, course)) {
          filtered.push(pkg);
        }
      }
      res.json(filtered);
    } catch (err: any) {
      res.status(500).json({ error: err.message ?? "Failed" });
    }
  });

  app.get("/api/scorm/packages/:pid", ensureAuthenticated, async (req, res) => {
    const pkg = await loadAuthorizedScormPackage(req, res, req.params.pid, "view");
    if (!pkg) return;
    res.json(pkg);
  });

  // Authenticated asset serving for the SCORM runtime (admin/preview
  // path). Uses session auth and is gated by course view access. The
  // primary playback path uses /api/scorm/play/:token/* below, which
  // is cookieless so the sandboxed iframe can load relative subresources.
  app.get(
    "/api/scorm/packages/:pid/assets/*",
    ensureAuthenticated,
    async (req, res) => {
      const pkg = await loadAuthorizedScormPackage(req, res, req.params.pid, "view");
      if (!pkg) return;
      try {
        const rest = (req.params as any)[0] || "";
        await scormSvc.streamScormAsset(pkg.id, rest, res);
      } catch (err: any) {
        if (!res.headersSent) res.status(500).json({ error: err.message ?? "Failed" });
      }
    },
  );

  // Issue a signed launch token for a SCORM lesson. We validate course
  // visibility + lesson membership here (cookies still flow on this
  // POST), then return a path-bearing src that the player iframe loads.
  // The src includes the prior cmi snapshot in the URL fragment so the
  // SCO resumes from its persisted state on relaunch.
  app.post(
    "/api/courses/:id/lessons/:lid/scorm/launch",
    ensureAuthenticated,
    async (req, res) => {
      try {
        const user = req.user as schema.User;
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
        if (lessonCtx.lesson.type !== "scorm") {
          return res.status(400).json({ error: "Lesson is not a SCORM lesson" });
        }
        const content: any = lessonCtx.lesson.content || {};
        if (!content.packageId) return res.status(400).json({ error: "SCORM lesson is not wired up" });
        const pkg = await scormSvc.getScormPackage(content.packageId);
        if (!pkg) return res.status(404).json({ error: "SCORM package missing" });

        const enrollment = await courseSvc.getOrCreateEnrollment(course.id, user.id, user.tenantId ?? null);
        // Enforce sequential gating before minting a launch token —
        // the lesson list exposes locked lesson IDs and we don't want
        // the launch endpoint to be a back door around isLessonUnlocked.
        // Managers/instructors bypass for preview, matching other routes.
        if (!courseSvc.userCanManageCourse(user, course)) {
          const unlocked = await courseSvc.isLessonUnlocked(course.id, lessonCtx.lesson.id, enrollment.id);
          if (!unlocked) return res.status(403).json({ error: "Lesson is locked" });
        }
        // Hydrate prior cmi from the user's existing lesson_progress
        const allProgress = await courseSvc.getLessonProgressForEnrollment(enrollment.id).catch(() => [] as schema.LessonProgress[]);
        const progress = allProgress.find((p) => p.lessonId === lessonCtx.lesson.id) || null;
        const cmi = (progress?.data as any)?.cmi || {};

        const token = scormSvc.signLaunchToken(pkg.id, user.id);
        const entryPoint = (content.entryPoint || pkg.entryPoint || "index.html").replace(/^\/+/, "");
        let src = `/api/scorm/play/${token}/${entryPoint}`;
        if (cmi && Object.keys(cmi).length > 0) {
          const enc = Buffer.from(JSON.stringify(cmi), "utf-8").toString("base64");
          // Use base64 (not base64url) so atob() works in browsers, and
          // keep the cmi in the URL fragment so it never reaches the
          // server in HTTP logs.
          src += `#cmi=${encodeURIComponent(enc)}`;
        }
        res.json({ src, version: pkg.scormVersion, entryPoint });
      } catch (err: any) {
        console.error("scorm launch error", err);
        res.status(400).json({ error: err.message ?? "Failed" });
      }
    },
  );

  // Cookieless asset serving for the sandboxed player. The token in
  // the path identifies (package, user) and is HMAC-signed with a
  // short TTL — see signLaunchToken/verifyLaunchToken. Because the
  // token is part of the path, every relative URL inside the package
  // automatically resolves under the same token, which is exactly
  // what real-world SCOs need to fetch their JSON/JS/asset siblings.
  app.options("/api/scorm/play/:token/*", (_req, res) => {
    res.set({
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Max-Age": "600",
    });
    res.status(204).end();
  });
  app.get("/api/scorm/play/:token/*", async (req, res) => {
    try {
      const claims = scormSvc.verifyLaunchToken(req.params.token);
      if (!claims) {
        res.set({ "Access-Control-Allow-Origin": "*" });
        return res.status(403).json({ error: "Invalid or expired launch token" });
      }
      const rest = (req.params as any)[0] || "";
      await scormSvc.streamScormAsset(claims.pid, rest, res);
    } catch (err: any) {
      if (!res.headersSent) res.status(500).json({ error: err.message ?? "Failed" });
    }
  });

  // SCORM runtime progress: dedicated endpoint that bypasses the
  // generic /progress guard which (intentionally) refuses scorm
  // lessons. We translate cmi.* into our normalized shape.
  const scormProgressSchema = z.object({
    cmi: z.record(z.any()).optional(),
    completionStatus: z.string().optional(),
    successStatus: z.string().optional(),
    score: z.number().optional(),
  });
  app.post(
    "/api/courses/:id/lessons/:lid/scorm/progress",
    ensureAuthenticated,
    async (req, res) => {
      try {
        const user = req.user as schema.User;
        const parsed = scormProgressSchema.parse(req.body);

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
        if (lessonCtx.lesson.type !== "scorm") {
          return res.status(400).json({ error: "Lesson is not a SCORM lesson" });
        }
        const enrollment = await courseSvc.getOrCreateEnrollment(course.id, user.id, user.tenantId ?? null);
        if (!(await courseSvc.isLessonUnlocked(course.id, lessonCtx.lesson.id, enrollment.id))) {
          return res.status(403).json({ error: "Previous required lessons must be completed first" });
        }

        // Normalize cmi → our status enum. SCORM 1.2 reports lesson_status
        // (passed/completed/failed/incomplete/browsed/not attempted).
        // SCORM 2004 splits completion_status (completed/incomplete/...)
        // and success_status (passed/failed/unknown).
        const cmi = parsed.cmi || {};
        const ls = String(cmi["cmi.core.lesson_status"] ?? "").toLowerCase();
        const cs = String(parsed.completionStatus ?? cmi["cmi.completion_status"] ?? "").toLowerCase();
        const ss = String(parsed.successStatus ?? cmi["cmi.success_status"] ?? "").toLowerCase();
        let status: schema.LessonProgressStatus = "in_progress";
        if (ls === "passed" || ls === "completed" || ss === "passed" || cs === "completed") status = "completed";
        else if (ls === "failed" || ss === "failed") status = "failed";

        let score: number | undefined = parsed.score;
        if (score == null) {
          const raw = cmi["cmi.core.score.raw"] ?? cmi["cmi.score.raw"];
          if (raw != null && raw !== "") {
            const n = Number(raw);
            if (Number.isFinite(n)) score = Math.round(n);
          }
        }
        if (score != null) score = Math.max(0, Math.min(100, score));

        const progress = await courseSvc.upsertLessonProgress(enrollment.id, lessonCtx.lesson.id, {
          status,
          score: score as any,
          data: { cmi } as any,
        });
        const updated = await courseSvc.recalculateEnrollment(enrollment.id);
        res.json({ progress, enrollment: updated });
      } catch (err: any) {
        console.error("scorm progress error", err);
        res.status(400).json({ error: err.message ?? "Failed" });
      }
    },
  );

  // ── JSON export / import ────────────────────────────────────────────────────

  // Export a course as a portable .orion-course.json file.
  // The file includes all metadata, modules, and lessons (full content
  // payloads). Enrollment data and SCORM binaries are excluded.
  app.get("/api/courses/:id/export/json", ensureAdminOrModeler, async (req, res) => {
    try {
      const course = await requireManageCourse(req, res, req.params.id);
      if (!course) return;
      const doc = await courseIE.exportCourse(course.id);
      if (!doc) return res.status(404).json({ error: "Course not found" });
      const safeName = course.slug.replace(/[^a-z0-9-]/g, "-");
      res.set({
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="${safeName}.orion-course.json"`,
      });
      res.json(doc);
    } catch (err: any) {
      console.error("course json export error", err);
      if (!res.headersSent) res.status(500).json({ error: err.message ?? "Failed to export" });
    }
  });

  // Import a course from a .orion-course.json file.
  // Accepts the parsed JSON as the request body.
  // Always imports as status="draft". Slug is deduped automatically.
  app.post("/api/courses/import/json", ensureAdminOrModeler, async (req, res) => {
    try {
      const user = req.user as schema.User;
      const isGlobal = checkIsGlobalAdmin(user);

      // Validate the document shape
      let doc: courseIE.CourseExportDoc;
      try {
        courseIE.validateCourseExportDoc(req.body);
        doc = req.body as courseIE.CourseExportDoc;
      } catch (err: any) {
        return res.status(400).json({ error: err.message ?? "Invalid course file" });
      }

      // Determine owner tenant (same rules as course creation)
      const ownerTenantId = isGlobal
        ? (req.query.ownerTenantId as string | undefined ?? null)
        : (user.tenantId ?? null);
      if (!isGlobal && !user.tenantId) {
        return res.status(403).json({ error: "Tenant admins must be assigned to a tenant" });
      }

      const result = await courseIE.importCourse(doc, {
        ownerTenantId,
        createdBy: user.id,
      });

      res.status(201).json({
        course: result.course,
        moduleCount: result.moduleCount,
        lessonCount: result.lessonCount,
        tagCount: result.tagCount,
      });
    } catch (err: any) {
      console.error("course json import error", err);
      res.status(500).json({ error: err.message ?? "Failed to import" });
    }
  });

  // Export a course as a SCORM 1.2 package.
  app.get("/api/courses/:id/scorm/export", ensureAdminOrModeler, async (req, res) => {
    try {
      const course = await requireManageCourse(req, res, req.params.id);
      if (!course) return;
      const full = await courseSvc.getCourseFull(course.id);
      if (!full) return res.status(404).json({ error: "Course not found" });
      const zipBuf = await scormSvc.buildScormExport(full);
      const safeName = full.slug.replace(/[^a-z0-9-]/g, "-");
      res.set({
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${safeName}-scorm12.zip"`,
        "Content-Length": String(zipBuf.length),
      });
      res.end(zipBuf);
    } catch (err: any) {
      console.error("scorm export error", err);
      if (!res.headersSent) res.status(500).json({ error: err.message ?? "Failed" });
    }
  });
}
