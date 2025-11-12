import { Router, Request, Response } from "express";
import { db } from "./db";
import { 
  tenants, 
  tenantDomains, 
  tenantEntitlements,
  modelTenants,
  tenantAuditLog,
  insertTenantSchema,
  insertTenantDomainSchema,
  insertTenantEntitlementSchema,
  insertModelTenantSchema,
} from "@shared/schema";
import { eq, and } from "drizzle-orm";

const router = Router();

// Middleware to require admin role
const requireAdmin = (req: Request, res: Response, next: Function) => {
  if (!req.isAuthenticated() || req.user?.role !== 'admin') {
    return res.status(403).json({ error: "Unauthorized. Admin access required." });
  }
  next();
};

// ========== TENANT MANAGEMENT ROUTES (Admin Only) ==========

// Get all tenants
router.get("/api/tenants", requireAdmin, async (req, res) => {
  try {
    const allTenants = await db.select().from(tenants);
    
    // For each tenant, get their domains and entitlements
    const tenantsWithDetails = await Promise.all(
      allTenants.map(async (tenant) => {
        const domains = await db
          .select()
          .from(tenantDomains)
          .where(eq(tenantDomains.tenantId, tenant.id));
        
        const entitlements = await db
          .select()
          .from(tenantEntitlements)
          .where(eq(tenantEntitlements.tenantId, tenant.id));
        
        return {
          ...tenant,
          domains,
          entitlements,
        };
      })
    );
    
    res.json(tenantsWithDetails);
  } catch (error) {
    console.error("Error fetching tenants:", error);
    res.status(500).json({ error: "Failed to fetch tenants" });
  }
});

// Get single tenant by ID
router.get("/api/tenants/:id", requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    
    const tenant = await db.select().from(tenants).where(eq(tenants.id, id)).limit(1);
    
    if (!tenant.length) {
      return res.status(404).json({ error: "Tenant not found" });
    }
    
    const domains = await db
      .select()
      .from(tenantDomains)
      .where(eq(tenantDomains.tenantId, id));
    
    const entitlements = await db
      .select()
      .from(tenantEntitlements)
      .where(eq(tenantEntitlements.tenantId, id));
    
    res.json({
      ...tenant[0],
      domains,
      entitlements,
    });
  } catch (error) {
    console.error("Error fetching tenant:", error);
    res.status(500).json({ error: "Failed to fetch tenant" });
  }
});

// Create new tenant
router.post("/api/tenants", requireAdmin, async (req, res) => {
  try {
    const validatedData = insertTenantSchema.parse(req.body);
    
    const [newTenant] = await db
      .insert(tenants)
      .values(validatedData)
      .returning();
    
    // Log the creation
    await db.insert(tenantAuditLog).values({
      tenantId: newTenant.id,
      actorUserId: req.user!.id,
      action: "create_tenant",
      targetType: "tenant",
      targetId: newTenant.id,
      metadata: { tenantName: newTenant.name },
    });
    
    res.status(201).json(newTenant);
  } catch (error: any) {
    console.error("Error creating tenant:", error);
    if (error.name === "ZodError") {
      return res.status(400).json({ error: "Invalid tenant data", details: error.errors });
    }
    res.status(500).json({ error: "Failed to create tenant" });
  }
});

// Update tenant
router.put("/api/tenants/:id", requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const validatedData = insertTenantSchema.partial().parse(req.body);
    
    const [updatedTenant] = await db
      .update(tenants)
      .set({ ...validatedData, updatedAt: new Date() })
      .where(eq(tenants.id, id))
      .returning();
    
    if (!updatedTenant) {
      return res.status(404).json({ error: "Tenant not found" });
    }
    
    // Log the update
    await db.insert(tenantAuditLog).values({
      tenantId: id,
      actorUserId: req.user!.id,
      action: "update_tenant",
      targetType: "tenant",
      targetId: id,
      metadata: { changes: validatedData },
    });
    
    res.json(updatedTenant);
  } catch (error: any) {
    console.error("Error updating tenant:", error);
    if (error.name === "ZodError") {
      return res.status(400).json({ error: "Invalid tenant data", details: error.errors });
    }
    res.status(500).json({ error: "Failed to update tenant" });
  }
});

// Delete tenant (with cascade deletion of related records)
router.delete("/api/tenants/:id", requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    
    // First, check if tenant exists
    const tenant = await db.select().from(tenants).where(eq(tenants.id, id)).limit(1);
    if (!tenant.length) {
      return res.status(404).json({ error: "Tenant not found" });
    }
    
    // Log the deletion before actually deleting
    await db.insert(tenantAuditLog).values({
      tenantId: id,
      actorUserId: req.user!.id,
      action: "delete_tenant",
      targetType: "tenant",
      targetId: id,
      metadata: { tenantName: tenant[0].name },
    });
    
    // Cascade delete related records (in order to avoid FK violations)
    // 1. Delete tenant entitlements
    await db.delete(tenantEntitlements).where(eq(tenantEntitlements.tenantId, id));
    
    // 2. Delete tenant domains
    await db.delete(tenantDomains).where(eq(tenantDomains.tenantId, id));
    
    // 3. Delete model-tenant associations
    await db.delete(modelTenants).where(eq(modelTenants.tenantId, id));
    
    // 4. Finally, delete the tenant itself
    const [deletedTenant] = await db
      .delete(tenants)
      .where(eq(tenants.id, id))
      .returning();
    
    res.json({ success: true, message: "Tenant and all related records deleted successfully" });
  } catch (error) {
    console.error("Error deleting tenant:", error);
    res.status(500).json({ error: "Failed to delete tenant" });
  }
});

// ========== TENANT DOMAINS ROUTES ==========

// Add domain to tenant
router.post("/api/tenants/:id/domains", requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const validatedData = insertTenantDomainSchema.parse({
      ...req.body,
      tenantId: id,
    });
    
    const [newDomain] = await db
      .insert(tenantDomains)
      .values(validatedData)
      .returning();
    
    // Log the domain addition
    await db.insert(tenantAuditLog).values({
      tenantId: id,
      actorUserId: req.user!.id,
      action: "add_domain",
      targetType: "tenant_domain",
      targetId: newDomain.id,
      metadata: { domain: newDomain.domain },
    });
    
    res.status(201).json(newDomain);
  } catch (error: any) {
    console.error("Error adding domain:", error);
    if (error.code === "23505") {
      return res.status(409).json({ error: "Domain already exists" });
    }
    if (error.name === "ZodError") {
      return res.status(400).json({ error: "Invalid domain data", details: error.errors });
    }
    res.status(500).json({ error: "Failed to add domain" });
  }
});

// Remove domain from tenant
router.delete("/api/tenants/:tenantId/domains/:domainId", requireAdmin, async (req, res) => {
  try {
    const { tenantId, domainId } = req.params;
    
    const [deletedDomain] = await db
      .delete(tenantDomains)
      .where(and(
        eq(tenantDomains.id, domainId),
        eq(tenantDomains.tenantId, tenantId)
      ))
      .returning();
    
    if (!deletedDomain) {
      return res.status(404).json({ error: "Domain not found" });
    }
    
    // Log the domain removal
    await db.insert(tenantAuditLog).values({
      tenantId,
      actorUserId: req.user!.id,
      action: "remove_domain",
      targetType: "tenant_domain",
      targetId: domainId,
      metadata: { domain: deletedDomain.domain },
    });
    
    res.json({ success: true, message: "Domain removed successfully" });
  } catch (error) {
    console.error("Error removing domain:", error);
    res.status(500).json({ error: "Failed to remove domain" });
  }
});

// ========== TENANT ENTITLEMENTS ROUTES ==========

// Set entitlements for tenant
router.put("/api/tenants/:id/entitlements", requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { application, enabled, features } = req.body;
    
    if (!application) {
      return res.status(400).json({ error: "Application is required" });
    }
    
    // Check if entitlement exists
    const existing = await db
      .select()
      .from(tenantEntitlements)
      .where(and(
        eq(tenantEntitlements.tenantId, id),
        eq(tenantEntitlements.application, application)
      ))
      .limit(1);
    
    let entitlement;
    
    if (existing.length > 0) {
      // Update existing entitlement
      [entitlement] = await db
        .update(tenantEntitlements)
        .set({
          enabled,
          features,
          updatedAt: new Date(),
        })
        .where(and(
          eq(tenantEntitlements.tenantId, id),
          eq(tenantEntitlements.application, application)
        ))
        .returning();
    } else {
      // Create new entitlement
      [entitlement] = await db
        .insert(tenantEntitlements)
        .values({
          tenantId: id,
          application,
          enabled,
          features,
        })
        .returning();
    }
    
    // Log the entitlement change
    await db.insert(tenantAuditLog).values({
      tenantId: id,
      actorUserId: req.user!.id,
      action: "update_entitlements",
      targetType: "tenant_entitlement",
      targetId: entitlement.id,
      metadata: { application, enabled, features },
    });
    
    res.json(entitlement);
  } catch (error) {
    console.error("Error updating entitlements:", error);
    res.status(500).json({ error: "Failed to update entitlements" });
  }
});

// ========== MODEL TENANT VISIBILITY ROUTES ==========

// Get tenants for a model
router.get("/api/models/:modelId/tenants", requireAdmin, async (req, res) => {
  try {
    const { modelId } = req.params;
    
    const modelTenantList = await db
      .select({
        id: modelTenants.id,
        tenantId: modelTenants.tenantId,
        tenantName: tenants.name,
        createdAt: modelTenants.createdAt,
      })
      .from(modelTenants)
      .innerJoin(tenants, eq(modelTenants.tenantId, tenants.id))
      .where(eq(modelTenants.modelId, modelId));
    
    res.json(modelTenantList);
  } catch (error) {
    console.error("Error fetching model tenants:", error);
    res.status(500).json({ error: "Failed to fetch model tenants" });
  }
});

// Publish model to tenant (add visibility)
router.post("/api/models/:modelId/tenants", requireAdmin, async (req, res) => {
  try {
    const { modelId } = req.params;
    const { tenantId } = req.body;
    
    if (!tenantId) {
      return res.status(400).json({ error: "Tenant ID is required" });
    }
    
    const [newModelTenant] = await db
      .insert(modelTenants)
      .values({ modelId, tenantId })
      .returning();
    
    // Log the model publication
    await db.insert(tenantAuditLog).values({
      tenantId,
      actorUserId: req.user!.id,
      action: "publish_model",
      targetType: "model",
      targetId: modelId,
      metadata: { modelId, tenantId },
    });
    
    res.status(201).json(newModelTenant);
  } catch (error: any) {
    console.error("Error publishing model to tenant:", error);
    if (error.code === "23505") {
      return res.status(409).json({ error: "Model already published to this tenant" });
    }
    res.status(500).json({ error: "Failed to publish model to tenant" });
  }
});

// Unpublish model from tenant (remove visibility)
router.delete("/api/models/:modelId/tenants/:tenantId", requireAdmin, async (req, res) => {
  try {
    const { modelId, tenantId } = req.params;
    
    const [deletedModelTenant] = await db
      .delete(modelTenants)
      .where(and(
        eq(modelTenants.modelId, modelId),
        eq(modelTenants.tenantId, tenantId)
      ))
      .returning();
    
    if (!deletedModelTenant) {
      return res.status(404).json({ error: "Model tenant relationship not found" });
    }
    
    // Log the model unpublication
    await db.insert(tenantAuditLog).values({
      tenantId,
      actorUserId: req.user!.id,
      action: "unpublish_model",
      targetType: "model",
      targetId: modelId,
      metadata: { modelId, tenantId },
    });
    
    res.json({ success: true, message: "Model unpublished from tenant successfully" });
  } catch (error) {
    console.error("Error unpublishing model from tenant:", error);
    res.status(500).json({ error: "Failed to unpublish model from tenant" });
  }
});

// ========== TENANT AUDIT LOG ROUTES ==========

// Get audit log for a tenant
router.get("/api/tenants/:id/audit-log", requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const limit = parseInt(req.query.limit as string) || 100;
    const offset = parseInt(req.query.offset as string) || 0;
    
    const logs = await db
      .select()
      .from(tenantAuditLog)
      .where(eq(tenantAuditLog.tenantId, id))
      .orderBy(tenantAuditLog.createdAt)
      .limit(limit)
      .offset(offset);
    
    res.json(logs);
  } catch (error) {
    console.error("Error fetching audit log:", error);
    res.status(500).json({ error: "Failed to fetch audit log" });
  }
});

export default router;