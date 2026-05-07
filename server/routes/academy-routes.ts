/**
 * Academy routes — Academies (Learning Sequences) API.
 *
 * Mirrors course-routes.ts authorization model:
 *  - Catalog read: visibility filter via academy_tenants + ownerTenantId.
 *  - Mutations: must be global admin OR an admin/modeler in the academy's
 *    owning tenant. Tenant-side users cannot change ownerTenantId or
 *    visibility — only global admins can.
 *  - Tenant share endpoints (`/api/academies/:id/tenants`) require global
 *    admin (matches the model-tenants pattern).
 *  - Delete is archive-by-default; ?hard=true + global admin to hard delete.
 */

import type { Express, Request, Response } from "express";
import { z } from "zod";
import { ensureAdminOrModeler } from "../auth";
import { getAccessibleTenantIds, checkIsGlobalAdmin } from "../permissions";
import * as academySvc from "../services/academy-service";
import * as schema from "@shared/schema";

async function requireManageAcademy(req: Request, res: Response, id: string): Promise<schema.Academy | null> {
  const user = req.user as schema.User | undefined;
  const academy = await academySvc.getAcademyById(id);
  if (!academy) {
    res.status(404).json({ error: "Academy not found" });
    return null;
  }
  if (!academySvc.userCanManageAcademy(user, academy)) {
    res.status(403).json({ error: "Forbidden" });
    return null;
  }
  return academy;
}

export function registerAcademyRoutes(app: Express) {
  // ---- Public/learner list ----
  app.get("/api/academies", async (req, res) => {
    try {
      const user = req.user as schema.User | undefined;
      let tenantIds: string[] | null = [];
      let canSeeUnpublished = false;
      if (user) {
        if (checkIsGlobalAdmin(user)) {
          tenantIds = null;
          canSeeUnpublished = true;
        } else {
          const accessible = getAccessibleTenantIds(user) ?? [];
          const set = new Set<string>(accessible);
          if (user.tenantId) set.add(user.tenantId);
          tenantIds = Array.from(set);
          if (user.role === "tenant_admin" || user.role === "tenant_modeler") {
            canSeeUnpublished = true;
          }
        }
      }
      const manageable = req.query.manageable === "true";
      if (manageable) {
        if (!user) return res.status(401).json({ error: "Unauthorized" });
        const ownerOnly = checkIsGlobalAdmin(user) ? null : (tenantIds ?? []);
        const includeArchived = req.query.includeArchived === "true";
        const statuses = includeArchived
          ? ["draft", "published", "archived"]
          : ["draft", "published"];
        const all = await academySvc.listAcademiesOwnedBy(ownerOnly, statuses);
        return res.json(all);
      }
      const published = await academySvc.listAcademies({ tenantIds, status: "published" });
      let payload = published;
      if (canSeeUnpublished && user) {
        const ownerOnly = checkIsGlobalAdmin(user) ? null : (tenantIds ?? []);
        if (ownerOnly === null || ownerOnly.length > 0) {
          const drafts = await academySvc.listAcademiesOwnedBy(ownerOnly, ["draft"]);
          const seen = new Set(payload.map(a => a.id));
          payload = [...payload, ...drafts.filter(d => !seen.has(d.id))];
        }
      }
      res.json(payload);
    } catch (err: any) {
      console.error("list academies error", err);
      res.status(500).json({ error: err.message ?? "Failed to list academies" });
    }
  });

  app.get("/api/academies/:idOrSlug", async (req, res) => {
    try {
      const user = req.user as schema.User | undefined;
      // Pass the caller into getAcademyFull so per-item course hydration
      // respects course visibility — private/tenant-only courses the user
      // can't see are returned as `course: null`.
      const academy = await academySvc.getAcademyFull(req.params.idOrSlug, user);
      if (!academy) return res.status(404).json({ error: "Academy not found" });
      const canView = await academySvc.userCanViewAcademy(user, academy);
      if (!canView) return res.status(403).json({ error: "Forbidden" });
      if (academy.status !== "published") {
        if (!academySvc.userCanManageAcademy(user, academy)) {
          return res.status(404).json({ error: "Academy not found" });
        }
      }
      res.json(academy);
    } catch (err: any) {
      console.error("get academy error", err);
      res.status(500).json({ error: err.message ?? "Failed to fetch academy" });
    }
  });

  // ---- Mutations ----
  app.post("/api/academies", ensureAdminOrModeler, async (req, res) => {
    try {
      const user = req.user as schema.User;
      const isGlobal = checkIsGlobalAdmin(user);
      const ownerTenantId = isGlobal
        ? (req.body.ownerTenantId ?? null)
        : (user.tenantId ?? null);
      if (!isGlobal && !user.tenantId) {
        return res.status(403).json({ error: "Tenant admins must be assigned to a tenant" });
      }
      // Visibility is a global-admin field at create time too — keeps create
      // consistent with the PUT route, which rejects visibility changes from
      // tenant-side users. Non-global users get the schema default ('private').
      const { visibility: _vis, ...createBody } = req.body;
      const parsed = schema.insertAcademySchema.parse({
        ...createBody,
        ...(isGlobal && _vis !== undefined ? { visibility: _vis } : {}),
        createdBy: user.id,
        ownerTenantId,
      });
      const academy = await academySvc.createAcademy(parsed);
      res.json(academy);
    } catch (err: any) {
      console.error("create academy error", err);
      res.status(400).json({ error: err.message ?? "Failed to create academy" });
    }
  });

  app.put("/api/academies/:id", ensureAdminOrModeler, async (req, res) => {
    try {
      const user = req.user as schema.User;
      const academy = await requireManageAcademy(req, res, req.params.id);
      if (!academy) return;
      const isGlobal = checkIsGlobalAdmin(user);
      const { ownerTenantId, visibility, ...rest } = req.body;
      const patch: any = { ...rest };
      if (isGlobal) {
        if (ownerTenantId !== undefined) patch.ownerTenantId = ownerTenantId;
        if (visibility !== undefined) patch.visibility = visibility;
      } else {
        if (ownerTenantId !== undefined && ownerTenantId !== academy.ownerTenantId) {
          return res.status(403).json({ error: "Only global admins can change an academy's owner tenant" });
        }
        if (visibility !== undefined && visibility !== academy.visibility) {
          return res.status(403).json({ error: "Only global admins can change an academy's visibility" });
        }
      }
      const updated = await academySvc.updateAcademy(academy.id, patch);
      if (!updated) return res.status(404).json({ error: "Academy not found" });
      res.json(updated);
    } catch (err: any) {
      res.status(400).json({ error: err.message ?? "Failed to update academy" });
    }
  });

  app.delete("/api/academies/:id", ensureAdminOrModeler, async (req, res) => {
    try {
      const user = req.user as schema.User;
      const academy = await requireManageAcademy(req, res, req.params.id);
      if (!academy) return;
      const hard = req.query.hard === "true";
      if (hard) {
        if (!checkIsGlobalAdmin(user)) {
          return res.status(403).json({ error: "Only global admins can hard-delete an academy" });
        }
        await academySvc.deleteAcademy(academy.id);
        return res.json({ success: true, deleted: true });
      }
      const archived = await academySvc.archiveAcademy(academy.id);
      res.json({ success: true, archived: true, academy: archived });
    } catch (err: any) {
      res.status(500).json({ error: err.message ?? "Failed" });
    }
  });

  // ---- Image ----
  app.put("/api/academies/:id/image", ensureAdminOrModeler, async (req, res) => {
    try {
      const { imageUrl } = req.body;
      if (!imageUrl) return res.status(400).json({ error: "imageUrl is required" });
      const academy = await requireManageAcademy(req, res, req.params.id);
      if (!academy) return;
      const user = req.user as schema.User;
      const { ObjectStorageService } = await import("../objectStorage");
      const objectStorageService = new ObjectStorageService();
      const normalizedPath = await objectStorageService.trySetObjectEntityAclPolicy(
        imageUrl,
        { owner: user.id || "admin", visibility: "public" },
      );
      const updated = await academySvc.updateAcademy(academy.id, { imageUrl: normalizedPath } as any);
      if (!updated) return res.status(404).json({ error: "Academy not found" });
      res.json(updated);
    } catch (err: any) {
      console.error("update academy image error", err);
      res.status(500).json({ error: err.message ?? "Failed to update academy image" });
    }
  });

  // ---- Items ----
  const itemBodySchema = z.object({
    itemType: z.enum(schema.ACADEMY_ITEM_TYPES),
    courseId: z.string().nullable().optional(),
    externalProvider: z.enum(schema.ACADEMY_EXTERNAL_PROVIDERS).nullable().optional(),
    externalTitle: z.string().nullable().optional(),
    externalUrl: z.string().url().nullable().optional(),
    externalDurationMinutes: z.number().int().min(0).nullable().optional(),
    externalDescription: z.string().nullable().optional(),
    required: z.boolean().optional(),
    order: z.number().int().min(0).optional(),
  });

  app.post("/api/academies/:id/items", ensureAdminOrModeler, async (req, res) => {
    try {
      const academy = await requireManageAcademy(req, res, req.params.id);
      if (!academy) return;
      const parsed = itemBodySchema.parse(req.body);
      if (parsed.itemType === "course" && !parsed.courseId) {
        return res.status(400).json({ error: "courseId is required for course items" });
      }
      if (parsed.itemType === "external" && (!parsed.externalUrl || !parsed.externalTitle)) {
        return res.status(400).json({ error: "externalTitle and externalUrl are required for external items" });
      }
      const item = await academySvc.createAcademyItem({
        ...parsed,
        academyId: academy.id,
      } as any);
      res.json(item);
    } catch (err: any) {
      res.status(400).json({ error: err.message ?? "Failed" });
    }
  });

  app.put("/api/academy-items/:id", ensureAdminOrModeler, async (req, res) => {
    try {
      const user = req.user as schema.User;
      const academy = await academySvc.getAcademyForItem(req.params.id);
      if (!academy) return res.status(404).json({ error: "Item not found" });
      if (!academySvc.userCanManageAcademy(user, academy)) return res.status(403).json({ error: "Forbidden" });
      const existing = await academySvc.getAcademyItem(req.params.id);
      if (!existing) return res.status(404).json({ error: "Item not found" });
      const parsed = itemBodySchema.partial().parse(req.body);
      // Compute the post-update state and re-validate type/field invariants.
      // When `itemType` flips, also clear the fields that no longer apply so
      // a course→external switch doesn't keep a stale `courseId`, and vice
      // versa. Without this guard the row can end up internally inconsistent
      // (e.g. itemType='course' with no courseId, or itemType='external'
      // missing externalUrl/title) and break the learner UI.
      const merged: any = { ...existing, ...parsed };
      const finalType = (parsed.itemType ?? existing.itemType) as schema.AcademyItemType;
      const typeChanged = parsed.itemType !== undefined && parsed.itemType !== existing.itemType;
      if (typeChanged) {
        if (finalType === "course") {
          merged.externalProvider = null;
          merged.externalTitle = null;
          merged.externalUrl = null;
          merged.externalDurationMinutes = null;
          merged.externalDescription = null;
        } else if (finalType === "external") {
          merged.courseId = null;
        }
      }
      if (finalType === "course" && !merged.courseId) {
        return res.status(400).json({ error: "courseId is required for course items" });
      }
      if (finalType === "external" && (!merged.externalUrl || !merged.externalTitle)) {
        return res.status(400).json({ error: "externalTitle and externalUrl are required for external items" });
      }
      // Build the patch to send to the DB: anything in `parsed` plus any
      // fields we cleared on a type change.
      const patch: any = { ...parsed };
      if (typeChanged) {
        if (finalType === "course") {
          patch.externalProvider = null;
          patch.externalTitle = null;
          patch.externalUrl = null;
          patch.externalDurationMinutes = null;
          patch.externalDescription = null;
        } else if (finalType === "external") {
          patch.courseId = null;
        }
      }
      const updated = await academySvc.updateAcademyItem(req.params.id, patch);
      if (!updated) return res.status(404).json({ error: "Not found" });
      res.json(updated);
    } catch (err: any) {
      res.status(400).json({ error: err.message ?? "Failed" });
    }
  });

  app.delete("/api/academy-items/:id", ensureAdminOrModeler, async (req, res) => {
    try {
      const user = req.user as schema.User;
      const academy = await academySvc.getAcademyForItem(req.params.id);
      if (!academy) return res.status(404).json({ error: "Item not found" });
      if (!academySvc.userCanManageAcademy(user, academy)) return res.status(403).json({ error: "Forbidden" });
      await academySvc.deleteAcademyItem(req.params.id);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message ?? "Failed" });
    }
  });

  app.put("/api/academies/:id/items/reorder", ensureAdminOrModeler, async (req, res) => {
    try {
      const academy = await requireManageAcademy(req, res, req.params.id);
      if (!academy) return;
      const { orderedIds } = req.body as { orderedIds?: string[] };
      if (!Array.isArray(orderedIds) || orderedIds.some((x) => typeof x !== "string")) {
        return res.status(400).json({ error: "orderedIds must be an array of item ids" });
      }
      // Reorder must be a full permutation of this academy's current items —
      // no duplicates, no foreign IDs, no missing IDs. Otherwise the
      // transaction silently leaves rows with stale `order` values.
      const currentIds = await academySvc.listAcademyItemIds(academy.id);
      if (orderedIds.length !== currentIds.length) {
        return res.status(400).json({
          error: "orderedIds must contain every current item exactly once",
        });
      }
      const submitted = new Set(orderedIds);
      if (submitted.size !== orderedIds.length) {
        return res.status(400).json({ error: "orderedIds contains duplicate ids" });
      }
      const known = new Set(currentIds);
      for (const id of orderedIds) {
        if (!known.has(id)) {
          return res.status(400).json({ error: `id '${id}' does not belong to this academy` });
        }
      }
      await academySvc.reorderAcademyItems(academy.id, orderedIds);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message ?? "Failed" });
    }
  });

  // ---- Tenant share ----
  // All operations are global-admin only — assignments expose other tenants'
  // names/IDs, so non-global managers (who can edit an academy they own)
  // shouldn't see the share list. Mirrors /api/models/:id/tenants.
  app.get("/api/academies/:id/tenants", ensureAdminOrModeler, async (req, res) => {
    try {
      const user = req.user as schema.User;
      if (!checkIsGlobalAdmin(user)) {
        return res.status(403).json({ error: "Only global admins can view academy tenant access" });
      }
      const academy = await requireManageAcademy(req, res, req.params.id);
      if (!academy) return;
      const rows = await academySvc.listAcademyTenants(academy.id);
      res.json(rows);
    } catch (err: any) {
      res.status(500).json({ error: err.message ?? "Failed" });
    }
  });

  app.post("/api/academies/:id/tenants", ensureAdminOrModeler, async (req, res) => {
    try {
      const user = req.user as schema.User;
      if (!checkIsGlobalAdmin(user)) {
        return res.status(403).json({ error: "Only global admins can manage academy tenant access" });
      }
      const academy = await requireManageAcademy(req, res, req.params.id);
      if (!academy) return;
      const { tenantId } = req.body;
      if (!tenantId) return res.status(400).json({ error: "tenantId is required" });
      const result = await academySvc.addAcademyTenant(academy.id, tenantId);
      if (result.created) return res.status(201).json(result.row);
      if (result.row) return res.status(200).json(result.row);
      return res.status(409).json({ error: "Tenant assignment was concurrently removed" });
    } catch (err: any) {
      console.error("add academy tenant error", err);
      res.status(500).json({ error: err.message ?? "Failed" });
    }
  });

  app.delete("/api/academies/:id/tenants/:tenantId", ensureAdminOrModeler, async (req, res) => {
    try {
      const user = req.user as schema.User;
      if (!checkIsGlobalAdmin(user)) {
        return res.status(403).json({ error: "Only global admins can manage academy tenant access" });
      }
      const academy = await requireManageAcademy(req, res, req.params.id);
      if (!academy) return;
      const ok = await academySvc.removeAcademyTenant(academy.id, req.params.tenantId);
      if (!ok) return res.status(404).json({ error: "Tenant assignment not found" });
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message ?? "Failed" });
    }
  });
}
