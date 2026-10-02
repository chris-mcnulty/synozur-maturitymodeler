import type { Express } from "express";
import { ensureAuthenticated } from "../auth";
import type { User } from "@shared/schema";
import * as mandatoryTraining from "../services/mandatory-training-service";
import { checkIsGlobalAdmin } from "../permissions";
import { addRequiredLearners } from "../services/required-training-learners";

function adminTenant(user: User, requestedTenantId?: string): { allowed: boolean; tenantId: string | null } {
  if (checkIsGlobalAdmin(user)) return { allowed: true, tenantId: requestedTenantId || null };
  if (user.role !== "tenant_admin" || !user.tenantId) return { allowed: false, tenantId: null };
  if (requestedTenantId && requestedTenantId !== user.tenantId) return { allowed: false, tenantId: null };
  return { allowed: true, tenantId: user.tenantId };
}

export function registerMandatoryTrainingRoutes(app: Express) {
  app.post("/api/admin/mandatory-training/:id/learners", ensureAuthenticated, async (req, res) => {
    const access = adminTenant(req.user as User);
    if (!access.allowed) return res.status(403).json({ error: "Forbidden" });
    try {
      return res.json(await addRequiredLearners(req.params.id, req.body, access.tenantId));
    } catch (error: any) {
      return res.status(error.statusCode || (error.name === "ZodError" ? 400 : 500))
        .json({ error: error.message || "Could not add learners" });
    }
  });

  app.get("/api/me/required-training-availability", ensureAuthenticated, async (req, res) => {
    try {
      // Never accept a tenant from the client for learner navigation.
      return res.json({ hasRequiredTraining: await mandatoryTraining.hasRequiredTraining((req.user as User).tenantId) });
    } catch {
      return res.status(500).json({ error: "Could not check required training availability" });
    }
  });

  app.post("/api/admin/mandatory-training/:id/courses", ensureAuthenticated, async (req, res) => {
    const access = adminTenant(req.user as User);
    if (!access.allowed) return res.status(403).json({ error: "Forbidden" });
    try {
      return res.json(await mandatoryTraining.addRequiredCourses(req.params.id, req.body, access.tenantId));
    } catch (error: any) {
      return res.status(error.statusCode || (error.name === "ZodError" ? 400 : 500))
        .json({ error: error.message || "Could not add required courses" });
    }
  });

  app.get("/api/admin/mandatory-training/options", ensureAuthenticated, async (req, res) => {
    const user = req.user as User;
    const tenantId = typeof req.query.tenantId === "string" ? req.query.tenantId : undefined;
    if (!tenantId) return res.status(400).json({ error: "tenantId is required" });
    const access = adminTenant(user, tenantId);
    if (!access.allowed || !access.tenantId) return res.status(403).json({ error: "Forbidden" });
    try {
      return res.json(await mandatoryTraining.getMandatoryTrainingOptions(access.tenantId));
    } catch (error: any) {
      return res.status(error.message === "Tenant not found" ? 404 : 500)
        .json({ error: error.message || "Failed to load mandatory training options" });
    }
  });

  app.post("/api/admin/mandatory-training", ensureAuthenticated, async (req, res) => {
    const user = req.user as User;
    const access = adminTenant(user, req.body?.tenantId);
    if (!access.allowed) return res.status(403).json({ error: "Forbidden" });
    if (!req.body?.tenantId) return res.status(400).json({ error: "tenantId is required" });
    try {
      const schedule = await mandatoryTraining.createMandatoryTraining(req.body, user.id);
      return res.status(201).json(schedule);
    } catch (error: any) {
      const message = error.message || "Failed to create mandatory training schedule";
      const status = error.statusCode || (error.name === "ZodError" ? 400
        : message.includes("not found") ? 404
          : message.includes("unavailable") || message.includes("unpublished") ? 400
            : message.includes("must be") || message.includes("Recipients") ? 400 : 500);
      return res.status(status).json({ error: message });
    }
  });

  app.get("/api/admin/mandatory-training", ensureAuthenticated, async (req, res) => {
    const user = req.user as User;
    const requested = typeof req.query.tenantId === "string" ? req.query.tenantId : undefined;
    const access = adminTenant(user, requested);
    if (!access.allowed) return res.status(403).json({ error: "Forbidden" });
    try {
      return res.json(await mandatoryTraining.listMandatoryTraining(access.tenantId));
    } catch (error: any) {
      return res.status(500).json({ error: error.message || "Failed to list mandatory training schedules" });
    }
  });

  app.get("/api/admin/mandatory-training/:id/export", ensureAuthenticated, async (req, res) => {
    const user = req.user as User;
    const status = typeof req.query.status === "string" ? req.query.status : undefined;
    if (status !== undefined && !mandatoryTraining.isMandatoryTrainingStatus(status)) {
      return res.status(400).json({ error: "Invalid status filter" });
    }
    const report = await mandatoryTraining.getMandatoryTrainingReport(req.params.id);
    if (!report) return res.status(404).json({ error: "Schedule not found" });
    const access = adminTenant(user, report.schedule.tenantId);
    if (!access.allowed) return res.status(403).json({ error: "Forbidden" });
    try {
      const csv = await mandatoryTraining.getMandatoryTrainingExport(
        req.params.id,
        status,
      );
      if (csv === null) return res.status(404).json({ error: "Schedule not found" });
      res.type("text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="required-training-${req.params.id}.csv"`);
      return res.send(csv);
    } catch (error: any) {
      return res.status(500).json({ error: error.message || "Failed to export mandatory training report" });
    }
  });

  app.get("/api/admin/mandatory-training/:id", ensureAuthenticated, async (req, res) => {
    try {
      const report = await mandatoryTraining.getMandatoryTrainingReport(req.params.id);
      if (!report) return res.status(404).json({ error: "Schedule not found" });
      const access = adminTenant(req.user as User, report.schedule.tenantId);
      if (!access.allowed) return res.status(403).json({ error: "Forbidden" });
      return res.json(report);
    } catch (error: any) {
      return res.status(500).json({ error: error.message || "Failed to load mandatory training report" });
    }
  });

  app.get("/api/me/mandatory-training", ensureAuthenticated, async (req, res) => {
    const user = req.user as User;
    if (!user.tenantId) return res.json([]);
    try {
      return res.json(await mandatoryTraining.listMandatoryTraining(user.tenantId, user.id, true));
    } catch (error: any) {
      return res.status(500).json({ error: error.message || "Failed to load mandatory training" });
    }
  });
}