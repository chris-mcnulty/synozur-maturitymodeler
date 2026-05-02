import type { Express } from "express";
  import { storage } from "../storage";
  import { db } from "../db";
  import { eq, inArray, desc, gte, lt, and, sql, isNotNull } from "drizzle-orm";
  import * as schema from "@shared/schema";
  import { insertAssessmentSchema, insertAssessmentResponseSchema, insertResultSchema, insertModelSchema, insertDimensionSchema, insertQuestionSchema, insertAnswerSchema, type Answer } from "@shared/schema";
  import { ensureAuthenticated, ensureAdmin, ensureAdminOrModeler, ensureAnyAdmin, ensureGlobalAdmin } from "../auth";
  import { canManageUsers, canAssignRole, checkIsGlobalAdmin, getAccessibleTenantIds, canAccessModel, hasAdminAccess } from "../permissions";
  import { ObjectStorageService, ObjectNotFoundError } from "../objectStorage";
  import { aiService } from "../services/ai-service";
  import { providerRegistry } from "../services/ai-providers/registry";
  import { validateImportData, executeImport, type ImportExportData } from "../services/import-service";
  import { duplicateModel, exportModelDefinition, importModelDefinition, exportInterviewGuide } from "../services/model-export-service";
  import { sendServiceError } from "../services/service-error";
  import { z } from "zod";
  import { randomBytes, createHash } from "crypto";
  import bcrypt from "bcryptjs";
  import { generateAdminConsentUrl, isSsoConfigured, extractDomain } from "../services/sso-service";
  import { hashPassword, comparePasswords } from "../utils/password";
  import { join, dirname } from "path";
  import { readFileSync } from "fs";
  import { fileURLToPath } from "url";

  const __filename = fileURLToPath(import.meta.url);
  const __dirname = dirname(__filename);
  
export function registerModelRoutes(app: Express) {
  app.get('/api/answers/:questionId', async (req, res) => {
    try {
      const { questionId } = req.params;
      const answers = await storage.getAnswersByQuestionId(questionId);
      res.json(answers);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch answers" });
    }
  });

  // Get all answers for a model (for export)

  app.get('/api/models/:id/answers', async (req, res) => {
    try {
      const modelId = req.params.id;
      
      // Get all questions for this model
      const questions = await storage.getQuestionsByModelId(modelId);
      const questionIds = questions.map(q => q.id);
      
      // Get all answers for these questions
      if (questionIds.length === 0) {
        return res.json([]);
      }
      
      const answers = await db.select()
        .from(schema.answers)
        .where(inArray(schema.answers.questionId, questionIds))
        .orderBy(schema.answers.order);
      
      res.json(answers);
    } catch (error) {
      console.error('Failed to fetch answers for model:', error);
      res.status(500).json({ error: "Failed to fetch answers" });
    }
  });

  app.post('/api/answers', ensureAdminOrModeler, async (req, res) => {
    try {
      const insertAnswerSchema = schema.insertAnswerSchema;
      const parsed = insertAnswerSchema.parse(req.body);
      const answer = await storage.createAnswer(parsed);
      res.json(answer);
    } catch (error) {
      res.status(400).json({ error: "Failed to create answer" });
    }
  });

  app.put('/api/answers/:id', ensureAdminOrModeler, async (req, res) => {
    try {
      const { id } = req.params;
      const answer = await storage.updateAnswer(id, req.body);
      res.json(answer);
    } catch (error) {
      res.status(400).json({ error: "Failed to update answer" });
    }
  });

  app.delete('/api/answers/:id', ensureAdminOrModeler, async (req, res) => {
    try {
      const { id } = req.params;
      await storage.deleteAnswer(id);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to delete answer" });
    }
  });

  // Question routes

  app.get("/api/questions", async (req, res) => {
    try {
      const { modelId } = req.query;
      if (!modelId || typeof modelId !== 'string') {
        return res.status(400).json({ error: "Model ID is required" });
      }
      
      const model = await storage.getModel(modelId);
      if (!model) {
        return res.status(404).json({ error: "Model not found" });
      }

      // Check visibility/tenant access
      if (!(await canAccessModel(req.user, model))) {
        return res.status(404).json({ error: "Model not found" }); // 404 to hide existence
      }

      // Only admins and modelers can access questions for draft models
      const canSeeDrafts = req.isAuthenticated() && (
        req.user?.role === 'global_admin' || 
        req.user?.role === 'tenant_admin' || 
        req.user?.role === 'tenant_modeler'
      );

      if (!canSeeDrafts && model.status !== 'published') {
        return res.status(404).json({ error: "Model not found" });
      }
      
      const questions = await storage.getQuestionsByModelId(modelId);
      res.json(questions);
    } catch (error) {
      console.error('Error fetching questions:', error);
      res.status(500).json({ error: "Failed to fetch questions" });
    }
  });

  app.post("/api/questions", ensureAdminOrModeler, async (req, res) => {
    try {
      console.log('[Question Creation] Request body:', JSON.stringify(req.body, null, 2));
      
      // Get existing questions to determine the order
      const existingQuestions = await storage.getQuestionsByModelId(req.body.modelId);
      const maxOrder = existingQuestions.reduce((max, q) => Math.max(max, q.order || 0), 0);
      
      // Add order to the question data
      const questionData = {
        ...req.body,
        order: maxOrder + 1,
      };
      
      console.log('[Question Creation] Data to validate:', JSON.stringify(questionData, null, 2));
      
      const validatedData = insertQuestionSchema.parse(questionData);
      console.log('[Question Creation] Validated data:', JSON.stringify(validatedData, null, 2));
      
      const question = await storage.createQuestion(validatedData);
      
      // Create default answers if it's a multiple choice question
      if (validatedData.type === 'multiple_choice') {
        const defaultAnswers = [
          { questionId: question.id, text: 'Not Started', score: 100, order: 1 },
          { questionId: question.id, text: 'Beginning', score: 200, order: 2 },
          { questionId: question.id, text: 'Developing', score: 300, order: 3 },
          { questionId: question.id, text: 'Advancing', score: 400, order: 4 },
          { questionId: question.id, text: 'Leading', score: 500, order: 5 },
        ];
        
        for (const answer of defaultAnswers) {
          await storage.createAnswer(answer);
        }
      }
      
      res.json(question);
    } catch (error: any) {
      console.error('Error creating question:', error);
      
      // Provide more specific error message for Zod validation errors
      if (error?.issues) {
        const zodErrors = error.issues.map((issue: any) => `${issue.path.join('.')}: ${issue.message}`).join(', ');
        return res.status(400).json({ error: `Validation error: ${zodErrors}` });
      }
      
      res.status(400).json({ error: error?.message || "Invalid question data" });
    }
  });

  app.put("/api/questions/:id", ensureAdminOrModeler, async (req, res) => {
    try {
      const questionData = {
        ...req.body,
        id: req.params.id
      };
      
      const question = await storage.updateQuestion(questionData);
      res.json(question);
    } catch (error) {
      console.error('Error updating question:', error);
      res.status(500).json({ error: "Failed to update question" });
    }
  });

  app.delete("/api/questions/:id", ensureAdminOrModeler, async (req, res) => {
    try {
      await storage.deleteQuestion(req.params.id);
      res.json({ success: true });
    } catch (error) {
      console.error('Error deleting question:', error);
      res.status(500).json({ error: "Failed to delete question" });
    }
  });

  // Model routes

  app.get("/api/models", async (req, res) => {
    try {
      const user = req.user;
      const userRole = user?.role;
      let status = req.query.status as string | undefined;
      
      // Only admins and modelers can see draft models
      const canSeeDrafts = req.isAuthenticated() && (
        userRole === 'global_admin' || 
        userRole === 'tenant_admin' || 
        userRole === 'tenant_modeler'
      );
      
      if (!canSeeDrafts) {
        status = 'published';
      }
      
      const allModels = await storage.getAllModels(status);
      
      // Filter out archived models for public access (archived models are never shown publicly)
      // Also filter by visibility and tenant access using centralized helper
      const filteredModels = [];
      for (const model of allModels) {
        // Always exclude archived models from public view
        if (model.status === 'archived') continue;
        
        if (await canAccessModel(user, model)) {
          filteredModels.push(model);
        }
      }
      
      res.json(filteredModels);
    } catch (error) {
      console.error("Error fetching models:", error);
      res.status(500).json({ error: "Failed to fetch models" });
    }
  });

  app.post("/api/models", ensureAdminOrModeler, async (req, res) => {
    try {
      const validatedData = insertModelSchema.parse(req.body);
      
      // Validate visibility and tenant ownership
      if (validatedData.visibility === 'private' && !validatedData.ownerTenantId) {
        return res.status(400).json({ error: "Private models must have an assigned tenant" });
      }
      
      if (validatedData.visibility === 'public' && validatedData.ownerTenantId) {
        // Auto-correct: public models should not have a tenant
        validatedData.ownerTenantId = null;
      }
      
      const model = await storage.createModel(validatedData);
      
      // Create dimensions if provided
      if (req.body.dimensions && Array.isArray(req.body.dimensions)) {
        for (let i = 0; i < req.body.dimensions.length; i++) {
          const dim = req.body.dimensions[i];
          await storage.createDimension({
            modelId: model.id,
            key: dim.key,
            label: dim.label,
            description: dim.description,
            order: i + 1
          });
        }
      }
      
      res.json(model);
    } catch (error) {
      console.error('Error creating model:', error);
      res.status(400).json({ error: "Invalid model data" });
    }
  });

  app.put("/api/models/:id", ensureAdminOrModeler, async (req, res) => {
    try {
      const updateData = req.body;
      
      // Validate visibility and tenant ownership if being updated
      if (updateData.visibility === 'private' && !updateData.ownerTenantId) {
        return res.status(400).json({ error: "Private models must have an assigned tenant" });
      }
      
      if (updateData.visibility === 'public' && updateData.ownerTenantId) {
        // Auto-correct: public models should not have a tenant
        updateData.ownerTenantId = null;
      }
      
      const model = await storage.updateModel(req.params.id, updateData);
      if (!model) {
        return res.status(404).json({ error: "Model not found" });
      }
      res.json(model);
    } catch (error) {
      res.status(400).json({ error: "Failed to update model" });
    }
  });

  app.put("/api/models/:id/maturity-scale", ensureAdminOrModeler, async (req, res) => {
    try {
      const { maturityScale } = req.body;
      const model = await storage.updateModel(req.params.id, { maturityScale });
      if (!model) {
        return res.status(404).json({ error: "Model not found" });
      }
      res.json(model);
    } catch (error) {
      res.status(400).json({ error: "Failed to update maturity scale" });
    }
  });

  app.put("/api/models/:id/general-resources", ensureAdminOrModeler, async (req, res) => {
    try {
      const { generalResources } = req.body;
      const model = await storage.updateModel(req.params.id, { generalResources });
      if (!model) {
        return res.status(404).json({ error: "Model not found" });
      }
      res.json(model);
    } catch (error) {
      res.status(400).json({ error: "Failed to update general resources" });
    }
  });

  app.delete("/api/models/:id", ensureAdminOrModeler, async (req, res) => {
    try {
      await storage.deleteModel(req.params.id);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to delete model" });
    }
  });

  // Duplicate a model (in-app copy without file export)

  app.post("/api/models/:id/duplicate", ensureAdminOrModeler, async (req, res) => {
    try {
      const result = await duplicateModel(req.params.id);
      res.json(result);
    } catch (error) {
      sendServiceError(res, error, "Failed to duplicate model");
    }
  });

  // Delete all assessment data for a model (admin only, for testing purposes)

  app.delete("/api/models/:id/assessment-data", ensureAdmin, async (req, res) => {
    try {
      const modelId = req.params.id;
      
      // Verify model exists
      const model = await storage.getModel(modelId);
      if (!model) {
        return res.status(404).json({ error: "Model not found" });
      }

      // Delete all assessments and their related data for this model
      const assessments = await db.select()
        .from(schema.assessments)
        .where(eq(schema.assessments.modelId, modelId));
      
      // Filter out any null/undefined IDs and ensure we have valid strings
      const assessmentIds = assessments
        .map(a => a.id)
        .filter((id): id is string => id != null && id !== '');
      
      if (assessmentIds.length > 0) {
        // Delete responses
        await db.delete(schema.assessmentResponses)
          .where(inArray(schema.assessmentResponses.assessmentId, assessmentIds));
        
        // Delete results
        await db.delete(schema.results)
          .where(inArray(schema.results.assessmentId, assessmentIds));
        
        // Note: AI content is cached by contextHash, not assessmentId, so it's not deleted here
        // The cache will naturally expire based on expiresAt timestamps
        
        // Delete assessments - use modelId directly to avoid inArray issues
        await db.delete(schema.assessments)
          .where(eq(schema.assessments.modelId, modelId));
      }

      // Delete benchmarks for this model
      await db.delete(schema.benchmarks)
        .where(eq(schema.benchmarks.modelId, modelId));
      
      res.json({ 
        success: true, 
        deletedCount: assessmentIds.length,
        message: `Deleted ${assessmentIds.length} assessments and all related data for model "${model.name}"`
      });
    } catch (error) {
      console.error("Error deleting assessment data:", error);
      res.status(500).json({ error: "Failed to delete assessment data" });
    }
  });

  // Object Storage routes for model images

  app.post("/api/objects/upload", ensureAdminOrModeler, async (req, res) => {
    try {
      const objectStorageService = new ObjectStorageService();
      const uploadURL = await objectStorageService.getObjectEntityUploadURL();
      res.json({ uploadURL });
    } catch (error) {
      console.error("Error getting upload URL:", error);
      res.status(500).json({ error: "Failed to get upload URL" });
    }
  });

  app.put("/api/models/:id/image", ensureAdminOrModeler, async (req, res) => {
    try {
      const { imageUrl } = req.body;
      if (!imageUrl) {
        return res.status(400).json({ error: "imageUrl is required" });
      }

      const userId = req.user?.id;
      const objectStorageService = new ObjectStorageService();
      
      // Set ACL policy for the uploaded image (public visibility)
      const normalizedPath = await objectStorageService.trySetObjectEntityAclPolicy(
        imageUrl,
        {
          owner: userId || 'admin',
          visibility: "public",
        }
      );

      // Update the model with the image URL
      const model = await storage.updateModel(req.params.id, { imageUrl: normalizedPath });
      if (!model) {
        return res.status(404).json({ error: "Model not found" });
      }

      res.json(model);
    } catch (error) {
      console.error("Error updating model image:", error);
      res.status(500).json({ error: "Failed to update model image" });
    }
  });

  app.get("/objects/:objectPath(*)", async (req, res) => {
    try {
      const objectStorageService = new ObjectStorageService();
      const objectFile = await objectStorageService.getObjectEntityFile(req.path);
      
      // Check ACL - only allow access to public objects or objects owned by the current user
      const userId = req.user?.id;
      const canAccess = await objectStorageService.canAccessObjectEntity({
        objectFile,
        userId,
        requestedPermission: undefined, // defaults to READ
      });
      
      if (!canAccess) {
        return res.sendStatus(403);
      }
      
      objectStorageService.downloadObject(objectFile, res);
    } catch (error) {
      console.error("Error serving object:", error);
      if (error instanceof ObjectNotFoundError) {
        return res.sendStatus(404);
      }
      return res.sendStatus(500);
    }
  });

  app.get("/api/models/by-id/:id", async (req, res) => {
    try {
      const model = await storage.getModel(req.params.id);
      if (!model) {
        return res.status(404).json({ error: "Model not found" });
      }

      // Check visibility/tenant access
      if (!(await canAccessModel(req.user, model))) {
        return res.status(404).json({ error: "Model not found" }); // 404 to hide existence
      }

      // Only admins and modelers can access draft/archived models
      const canSeeDrafts = req.isAuthenticated() && (
        req.user?.role === 'global_admin' || 
        req.user?.role === 'tenant_admin' || 
        req.user?.role === 'tenant_modeler'
      );

      // Archived models return a specific error code
      if (!canSeeDrafts && model.status === 'archived') {
        return res.status(403).json({ error: "model_archived", message: "This assessment is no longer available" });
      }

      if (!canSeeDrafts && model.status !== 'published') {
        return res.status(404).json({ error: "Model not found" });
      }

      const dimensions = await storage.getDimensionsByModelId(model.id);
      res.json({ ...model, dimensions });
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch model" });
    }
  });

  app.get("/api/models/:slug", async (req, res) => {
    try {
      const model = await storage.getModelBySlug(req.params.slug);
      if (!model) {
        return res.status(404).json({ error: "Model not found" });
      }

      // Check visibility/tenant access
      if (!(await canAccessModel(req.user, model))) {
        // For private models, return a specific error so the frontend can show the access gate
        if (model.visibility === 'private') {
          return res.status(403).json({
            error: "model_private_access_required",
            message: "Access to this model requires approval.",
            model: {
              id: model.id,
              name: model.name,
              slug: model.slug,
              description: model.description,
              estimatedTime: model.estimatedTime,
            },
          });
        }
        return res.status(404).json({ error: "Model not found" });
      }

      // Only admins and modelers can access draft/archived models
      const canSeeDrafts = req.isAuthenticated() && (
        req.user?.role === 'global_admin' || 
        req.user?.role === 'tenant_admin' || 
        req.user?.role === 'tenant_modeler'
      );

      // Archived models return a specific error code
      if (!canSeeDrafts && model.status === 'archived') {
        return res.status(403).json({ error: "model_archived", message: "This assessment is no longer available" });
      }

      if (!canSeeDrafts && model.status !== 'published') {
        return res.status(404).json({ error: "Model not found" });
      }

      const dimensions = await storage.getDimensionsByModelId(model.id);
      res.json({ ...model, dimensions });
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch model" });
    }
  });

  // Get access status for a private model (works even if user can't access)

  app.get("/api/models/:slug/access-status", async (req, res) => {
    try {
      const model = await storage.getModelBySlug(req.params.slug);
      if (!model) {
        return res.status(404).json({ error: "Model not found" });
      }

      const user = req.user;
      const canAccess = await canAccessModel(user, model);
      const ssoEnabled = isSsoConfigured();

      let adminConsentGranted = false;
      let adminConsentUrl: string | null = null;
      let requestStatus: 'none' | 'pending' | 'approved' | 'denied' = 'none';
      let existingRequest: schema.ModelAccessRequest | undefined;

      const baseUrl = `${req.protocol}://${req.get('host')}`;
      if (user?.tenantId) {
        const tenant = await storage.getTenant(user.tenantId);
        adminConsentGranted = tenant?.ssoAdminConsentGranted ?? false;
        if (ssoEnabled && tenant?.ssoTenantId) {
          try {
            const info = generateAdminConsentUrl(tenant.ssoTenantId, baseUrl);
            adminConsentUrl = info.consentUrl;
          } catch {}
        } else if (ssoEnabled) {
          try {
            const info = generateAdminConsentUrl(undefined, baseUrl);
            adminConsentUrl = info.consentUrl;
          } catch {}
        }
        existingRequest = await storage.getModelAccessRequestByEmail(model.id, user.email ?? '');
      } else {
        // For unauthenticated users on private models, check if any assigned tenant
        // has already granted admin consent — if so, they just need to sign in
        if (model.visibility === 'private' && model.id) {
          const tenantAssignments = await db
            .select({ tenantId: schema.modelTenants.tenantId })
            .from(schema.modelTenants)
            .where(eq(schema.modelTenants.modelId, model.id));
          
          for (const assignment of tenantAssignments) {
            const assignedTenant = await storage.getTenant(assignment.tenantId);
            if (assignedTenant?.ssoAdminConsentGranted) {
              adminConsentGranted = true;
              break;
            }
          }
        }

        if (user?.email) {
          existingRequest = await storage.getModelAccessRequestByEmail(model.id, user.email);
        }
      }

      if (existingRequest) {
        requestStatus = existingRequest.status as 'pending' | 'approved' | 'denied';
      }

      if (ssoEnabled && !adminConsentUrl) {
        try {
          const info = generateAdminConsentUrl(undefined, baseUrl);
          adminConsentUrl = info.consentUrl;
        } catch {}
      }

      res.json({
        canAccess,
        requestStatus,
        adminConsentGranted,
        adminConsentUrl,
        ssoConfigured: ssoEnabled,
        model: {
          id: model.id,
          name: model.name,
          slug: model.slug,
          description: model.description,
          estimatedTime: model.estimatedTime,
          visibility: model.visibility,
        },
        existingRequest: existingRequest ? {
          id: existingRequest.id,
          status: existingRequest.status,
          requestedAt: existingRequest.requestedAt,
          denialReason: existingRequest.denialReason,
        } : null,
      });
    } catch (error) {
      console.error('Error fetching access status:', error);
      res.status(500).json({ error: "Failed to fetch access status" });
    }
  });

  // Submit a model access request

  app.post("/api/models/:slug/request-access", async (req, res) => {
    try {
      const model = await storage.getModelBySlug(req.params.slug);
      if (!model) {
        return res.status(404).json({ error: "Model not found" });
      }
      if (model.visibility !== 'private') {
        return res.status(400).json({ error: "This model does not require an access request" });
      }

      const { requestorName, requestorEmail, organizationName, message } = req.body;
      if (!requestorName || !requestorEmail || !organizationName) {
        return res.status(400).json({ error: "Name, email, and organization are required" });
      }

      const email = requestorEmail.toLowerCase().trim();
      const existing = await storage.getModelAccessRequestByEmail(model.id, email);
      if (existing && existing.status === 'pending') {
        return res.status(409).json({ error: "An access request is already pending for this email", requestId: existing.id });
      }

      const user = req.user;
      let tenantId: string | null = user?.tenantId ?? null;
      let ssoTenantId: string | null = null;
      let adminConsentGranted = false;

      if (tenantId) {
        const tenant = await storage.getTenant(tenantId);
        ssoTenantId = tenant?.ssoTenantId ?? null;
        adminConsentGranted = tenant?.ssoAdminConsentGranted ?? false;
      }

      const domain = extractDomain(email);
      const accessRequest = await storage.createModelAccessRequest({
        modelId: model.id,
        requestorName: requestorName.trim(),
        requestorEmail: email,
        organizationName: organizationName.trim(),
        organizationDomain: domain || null,
        tenantId,
        ssoTenantId,
        adminConsentGranted,
        message: message?.trim() || null,
        status: 'pending',
        reviewedBy: null,
        denialReason: null,
      });

      res.status(201).json({ success: true, requestId: accessRequest.id });
    } catch (error) {
      console.error('Error creating access request:', error);
      res.status(500).json({ error: "Failed to submit access request" });
    }
  });

  // Admin: list all access requests

  app.get("/api/admin/access-requests", ensureGlobalAdmin, async (req, res) => {
    try {
      const { status, modelId } = req.query;
      const requests = await storage.getAllModelAccessRequests(
        typeof status === 'string' ? status : undefined,
        typeof modelId === 'string' ? modelId : undefined,
      );
      res.json(requests);
    } catch (error) {
      console.error('Error fetching access requests:', error);
      res.status(500).json({ error: "Failed to fetch access requests" });
    }
  });

  // Admin: approve an access request (adds tenant to model_tenants)

  app.patch("/api/admin/access-requests/:id/approve", ensureGlobalAdmin, async (req, res) => {
    try {
      const accessReq = await storage.getModelAccessRequest(req.params.id);
      if (!accessReq) {
        return res.status(404).json({ error: "Access request not found" });
      }
      if (accessReq.status !== 'pending') {
        return res.status(400).json({ error: "Request is not pending" });
      }

      let tenantId = accessReq.tenantId;

      // If request has a tenant, add it to model_tenants
      if (tenantId) {
        const existing = await db.select()
          .from(schema.modelTenants)
          .where(and(
            eq(schema.modelTenants.modelId, accessReq.modelId),
            eq(schema.modelTenants.tenantId, tenantId)
          ))
          .limit(1);

        if (existing.length === 0) {
          await db.insert(schema.modelTenants).values({
            modelId: accessReq.modelId,
            tenantId,
          });
        }
      }

      const updated = await storage.updateModelAccessRequest(accessReq.id, {
        status: 'approved',
        reviewedAt: new Date(),
        reviewedBy: req.user!.id,
      });

      res.json({ success: true, request: updated });
    } catch (error) {
      console.error('Error approving access request:', error);
      res.status(500).json({ error: "Failed to approve access request" });
    }
  });

  // Admin: deny an access request

  app.patch("/api/admin/access-requests/:id/deny", ensureGlobalAdmin, async (req, res) => {
    try {
      const accessReq = await storage.getModelAccessRequest(req.params.id);
      if (!accessReq) {
        return res.status(404).json({ error: "Access request not found" });
      }
      if (accessReq.status !== 'pending') {
        return res.status(400).json({ error: "Request is not pending" });
      }

      const updated = await storage.updateModelAccessRequest(accessReq.id, {
        status: 'denied',
        reviewedAt: new Date(),
        reviewedBy: req.user!.id,
        denialReason: req.body.reason?.trim() || null,
      });

      res.json({ success: true, request: updated });
    } catch (error) {
      console.error('Error denying access request:', error);
      res.status(500).json({ error: "Failed to deny access request" });
    }
  });

  // Admin: get count of pending access requests (for badge)

  app.get("/api/admin/access-requests/count", ensureGlobalAdmin, async (req, res) => {
    try {
      const count = await storage.countPendingAccessRequests();
      res.json({ count });
    } catch (error) {
      res.status(500).json({ error: "Failed to count pending requests" });
    }
  });

  // Dimension routes

  app.get("/api/dimensions/:modelId", async (req, res) => {
    try {
      const model = await storage.getModel(req.params.modelId);
      if (!model) {
        return res.status(404).json({ error: "Model not found" });
      }

      // Check visibility/tenant access
      if (!(await canAccessModel(req.user, model))) {
        return res.status(404).json({ error: "Model not found" }); // 404 to hide existence
      }

      // Only admins and modelers can access dimensions for draft models
      const canSeeDrafts = req.isAuthenticated() && (
        req.user?.role === 'global_admin' || 
        req.user?.role === 'tenant_admin' || 
        req.user?.role === 'tenant_modeler'
      );

      if (!canSeeDrafts && model.status !== 'published') {
        return res.status(404).json({ error: "Model not found" });
      }
      
      const dimensions = await storage.getDimensionsByModelId(req.params.modelId);
      res.json(dimensions);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch dimensions" });
    }
  });

  app.post("/api/dimensions", ensureAdminOrModeler, async (req, res) => {
    try {
      const validatedData = insertDimensionSchema.parse(req.body);
      const dimension = await storage.createDimension(validatedData);
      res.json(dimension);
    } catch (error) {
      console.error('Error creating dimension:', error);
      res.status(400).json({ error: "Invalid dimension data" });
    }
  });

  app.put("/api/dimensions/:id", ensureAdminOrModeler, async (req, res) => {
    try {
      const dimension = await storage.updateDimension(req.params.id, req.body);
      if (!dimension) {
        return res.status(404).json({ error: "Dimension not found" });
      }
      res.json(dimension);
    } catch (error) {
      res.status(400).json({ error: "Failed to update dimension" });
    }
  });

  app.delete("/api/dimensions/:id", ensureAdminOrModeler, async (req, res) => {
    try {
      await storage.deleteDimension(req.params.id);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to delete dimension" });
    }
  });

  // Questions routes

  app.get("/api/models/:slug/questions", async (req, res) => {
    try {
      const model = await storage.getModelBySlug(req.params.slug);
      if (!model) {
        return res.status(404).json({ error: "Model not found" });
      }

      // Check visibility/tenant access
      if (!(await canAccessModel(req.user, model))) {
        return res.status(404).json({ error: "Model not found" }); // 404 to hide existence
      }

      // Only admins and modelers can access questions for draft models
      const canSeeDrafts = req.isAuthenticated() && (
        req.user?.role === 'global_admin' || 
        req.user?.role === 'tenant_admin' || 
        req.user?.role === 'tenant_modeler'
      );

      if (!canSeeDrafts && model.status !== 'published') {
        return res.status(404).json({ error: "Model not found" });
      }

      const questions = await storage.getQuestionsByModelId(model.id);

      // Batch fetch all answers for these questions in a single query, then group by questionId.
      // This avoids one DB roundtrip per question (was N+1).
      const questionIds = questions.map(q => q.id);
      const allAnswers = questionIds.length > 0
        ? await db.select().from(schema.answers)
            .where(inArray(schema.answers.questionId, questionIds))
            .orderBy(schema.answers.order)
        : [];
      const answersByQuestionId = new Map<string, typeof allAnswers>();
      for (const a of allAnswers) {
        if (!answersByQuestionId.has(a.questionId)) {
          answersByQuestionId.set(a.questionId, []);
        }
        answersByQuestionId.get(a.questionId)!.push(a);
      }
      const questionsWithAnswers = questions.map((question) => ({
        ...question,
        answers: answersByQuestionId.get(question.id) ?? [],
      }));

      res.json(questionsWithAnswers);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch questions" });
    }
  });

  // Assessment routes

  app.get("/api/admin/models/:id/content", ensureAdminOrModeler, async (req, res) => {
    try {
      const modelId = req.params.id;
      
      // Get the model
      const model = await storage.getModel(modelId);
      if (!model) {
        return res.status(404).json({ error: "Model not found" });
      }

      // Get all dimensions for the model
      const dimensions = await storage.getDimensionsByModelId(modelId);
      
      // Get all questions for the model
      const questions = await storage.getQuestionsByModelId(modelId);
      
      // Get all answers for the model's questions
      const questionIds = questions.map(q => q.id);
      const answers = questionIds.length > 0 
        ? await db.select().from(schema.answers)
            .where(inArray(schema.answers.questionId, questionIds))
            .orderBy(schema.answers.score)
        : [];
      
      // Get maturity levels from the model's maturityScale field
      // Parse the maturityScale JSON and transform to match the expected format
      let maturityLevels = [];
      if (model.maturityScale) {
        try {
          const parsedScale = typeof model.maturityScale === 'string' 
            ? JSON.parse(model.maturityScale) 
            : model.maturityScale;
          
          maturityLevels = parsedScale.map((level: any) => ({
            id: level.id,
            scoreMin: level.minScore,
            scoreMax: level.maxScore,
            name: level.name,
            interpretation: level.description || null,
          }));
        } catch (error) {
          console.error('Failed to parse maturity scale:', error);
          // Fallback to default levels if parsing fails
          maturityLevels = [
            { id: "1", scoreMin: 100, scoreMax: 200, name: "Initial", interpretation: null },
            { id: "2", scoreMin: 201, scoreMax: 300, name: "Developing", interpretation: null },
            { id: "3", scoreMin: 301, scoreMax: 400, name: "Defined", interpretation: null },
            { id: "4", scoreMin: 401, scoreMax: 450, name: "Managed", interpretation: null },
            { id: "5", scoreMin: 451, scoreMax: 500, name: "Optimizing", interpretation: null },
          ];
        }
      } else {
        // Use default levels if no custom scale is defined
        maturityLevels = [
          { id: "1", scoreMin: 100, scoreMax: 200, name: "Initial", interpretation: null },
          { id: "2", scoreMin: 201, scoreMax: 300, name: "Developing", interpretation: null },
          { id: "3", scoreMin: 301, scoreMax: 400, name: "Defined", interpretation: null },
          { id: "4", scoreMin: 401, scoreMax: 450, name: "Managed", interpretation: null },
          { id: "5", scoreMin: 451, scoreMax: 500, name: "Optimizing", interpretation: null },
        ];
      }

      res.json({
        model,
        dimensions,
        questions,
        answers,
        maturityLevels,
      });
    } catch (error) {
      console.error('Failed to fetch content data:', error);
      res.status(500).json({ error: "Failed to fetch content data" });
    }
  });

  app.post("/api/admin/models/seed/:modelSlug", ensureAdminOrModeler, async (req, res) => {
    try {
      const seedDataPath = join(__dirname, `../seed-data/${req.params.modelSlug}.json`);
      const seedData = JSON.parse(readFileSync(seedDataPath, 'utf-8'));

      // Check if model already exists
      const existingModel = await storage.getModelBySlug(seedData.model.slug);
      if (existingModel) {
        return res.status(400).json({ error: "Model already exists" });
      }

      // Create model
      const model = await storage.createModel(seedData.model);

      // Create dimensions
      const dimensionMap: Record<string, string> = {};
      for (const dim of seedData.dimensions) {
        const dimension = await storage.createDimension({
          modelId: model.id,
          key: dim.key,
          label: dim.name,
          description: dim.description,
          order: seedData.dimensions.indexOf(dim) + 1,
        });
        dimensionMap[dim.key] = dimension.id;
      }

      // Create questions and answers
      for (const q of seedData.questions) {
        const question = await storage.createQuestion({
          modelId: model.id,
          dimensionId: q.dimensionKey ? dimensionMap[q.dimensionKey] : null,
          text: q.text,
          order: q.order,
        });

        for (const a of q.answers) {
          await storage.createAnswer({
            questionId: question.id,
            text: a.text,
            score: a.score,
            order: a.order,
          });
        }
      }

      // Create benchmarks
      if (seedData.benchmarks) {
        for (const bench of seedData.benchmarks) {
          // Determine segment type based on which fields are populated
          let segmentType = 'overall';
          if (bench.industry && bench.country) {
            segmentType = 'industry_country';
          } else if (bench.industry) {
            segmentType = 'industry';
          } else if (bench.country) {
            segmentType = 'country';
          }
          
          await storage.createBenchmark({
            modelId: model.id,
            segmentType,
            industry: bench.industry,
            country: bench.country,
            meanScore: bench.averageScore,
            sampleSize: bench.participantCount,
          });
        }
      }

      res.json({ success: true, model });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Failed to seed model data" });
    }
  });

  app.get("/api/admin/models", ensureAdminOrModeler, async (req, res) => {
    try {
      // By default exclude archived models unless explicitly requested
      const includeArchived = req.query.includeArchived === 'true';
      
      // Scope models by tenant access in SQL: global admins see everything,
      // tenant-scoped users (tenant_admin, tenant_modeler) see only public
      // models plus models owned by or shared with their tenant.
      const accessibleTenants = getAccessibleTenantIds(req.user!);
      const models = await storage.getAllModels(undefined, {
        excludeArchived: !includeArchived,
        tenantIds: accessibleTenants,
      });

      if (models.length === 0) {
        return res.json([]);
      }

      // Batch fetch dimension counts for all models in a single query
      const modelIds = models.map(m => m.id);
      const dimensionRows = await db
        .select({
          modelId: schema.dimensions.modelId,
          count: sql<number>`count(*)::int`,
        })
        .from(schema.dimensions)
        .where(inArray(schema.dimensions.modelId, modelIds))
        .groupBy(schema.dimensions.modelId);
      const dimensionCountMap = new Map(dimensionRows.map(r => [r.modelId, r.count]));

      const modelsWithStats = models.map((model) => ({
        ...model,
        dimensionCount: dimensionCountMap.get(model.id) ?? 0,
        // questionCount already provided by getAllModels via SQL aggregate
      }));
      res.json(modelsWithStats);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch models" });
    }
  });

  // AI-assisted content generation endpoints for admin
  
  // Generate score interpretations for a model

  app.patch("/api/admin/models/:id", ensureAdminOrModeler, async (req, res) => {
    try {
      const model = await storage.updateModel(req.params.id, req.body);
      if (!model) {
        return res.status(404).json({ error: "Model not found" });
      }
      res.json(model);
    } catch (error) {
      res.status(500).json({ error: "Failed to update model" });
    }
  });

  app.delete("/api/admin/models/:id", ensureAdminOrModeler, async (req, res) => {
    try {
      await storage.deleteModel(req.params.id);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to delete model" });
    }
  });

  // Settings routes

  app.get("/api/models/:id/export", async (req, res) => {
    try {
      const model = await storage.getModel(req.params.id);
      if (!model) {
        return res.status(404).json({ error: "Model not found" });
      }

      // Only admins and modelers can export draft models
      if ((!req.isAuthenticated() || (req.user?.role !== 'admin' && req.user?.role !== 'modeler')) && model.status !== 'published') {
        return res.status(404).json({ error: "Model not found" });
      }

      const questions = await storage.getQuestionsByModelId(model.id);
      
      // Get all answers for all questions
      const allAnswers: Answer[] = [];
      for (const q of questions) {
        const answers = await storage.getAnswersByQuestionId(q.id);
        allAnswers.push(...answers);
      }

      // Import simplified CSV converter
      const { questionsToSimpleCSV } = await import('../../client/src/utils/csvConverterSimple');
      const csvContent = questionsToSimpleCSV(questions, allAnswers);

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="${model.slug}-questions.csv"`);
      res.send(csvContent);
    } catch (error) {
      console.error('Export error:', error);
      res.status(500).json({ error: "Failed to export model" });
    }
  });

  app.post("/api/models/:id/import-questions", ensureAdminOrModeler, async (req, res) => {
    try {
      const modelId = req.params.id;
      const { csvContent, mode = 'add' } = req.body;
      
      // Check if model exists
      const model = await storage.getModel(modelId);
      if (!model) {
        return res.status(404).json({ error: "Model not found" });
      }
      
      // Import simplified CSV converter
      const { simpleCSVToQuestions } = await import('../../client/src/utils/csvConverterSimple');
      const { questions, answers } = simpleCSVToQuestions(csvContent, modelId);

      // Delete existing questions and answers only if mode is 'replace'
      if (mode === 'replace') {
        const existingQuestions = await storage.getQuestionsByModelId(modelId);
        for (const q of existingQuestions) {
          // Delete answers first
          const existingAnswers = await storage.getAnswersByQuestionId(q.id);
          for (const a of existingAnswers) {
            await storage.deleteAnswer(a.id);
          }
          // Then delete question
          await storage.deleteQuestion(q.id);
        }
      }

      // Create new questions
      const questionMap = new Map<string, string>();
      for (const q of questions) {
        const question = await storage.createQuestion({
          modelId: modelId,
          dimensionId: null, // Not using dimensions in simplified format
          text: q.text || '',
          type: q.type || 'multiple_choice',
          minValue: q.minValue,
          maxValue: q.maxValue,
          unit: q.unit,
          placeholder: q.placeholder,
          order: q.order || 0,
          improvementStatement: q.improvementStatement,
          resourceTitle: q.resourceTitle,
          resourceLink: q.resourceLink,
          resourceDescription: q.resourceDescription,
        });
        questionMap.set(q.id, question.id);
      }
      
      // Create answers
      for (const a of answers) {
        const actualQuestionId = questionMap.get(a.questionId);
        if (actualQuestionId) {
          await storage.createAnswer({
            questionId: actualQuestionId,
            text: a.text || '',
            score: a.score || 0,
            order: a.order || 0,
            improvementStatement: a.improvementStatement,
            resourceTitle: a.resourceTitle,
            resourceLink: a.resourceLink,
            resourceDescription: a.resourceDescription,
          });
        }
      }

      res.json({ success: true, questionsImported: questions.length, answersImported: answers.length });
    } catch (error) {
      console.error('Import error:', error);
      res.status(400).json({ error: "Failed to import questions" });
    }
  });

  // Export complete model definition as .model JSON file

  app.get("/api/models/:id/export-model", ensureAdminOrModeler, async (req, res) => {
    try {
      const { model, exportData } = await exportModelDefinition(req.params.id);
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename="${model.slug}.model"`);
      res.json(exportData);
    } catch (error) {
      sendServiceError(res, error, "Failed to export model");
    }
  });

  // Import complete model definition from .model JSON file

  app.post("/api/models/import-model", ensureAdminOrModeler, async (req, res) => {
    try {
      const { modelData, newName, newSlug } = req.body;
      const result = await importModelDefinition({ modelData, newName, newSlug });
      res.json(result);
    } catch (error) {
      sendServiceError(res, error, "Failed to import model");
    }
  });

  // Export interview guide in markdown format
  app.get("/api/models/:id/export-interview", ensureAdminOrModeler, async (req, res) => {
    try {
      const { model, markdown } = await exportInterviewGuide(req.params.id);
      res.setHeader('Content-Type', 'text/markdown');
      res.setHeader('Content-Disposition', `attachment; filename="${model.slug}-interview-guide.md"`);
      res.send(markdown);
    } catch (error) {
      sendServiceError(res, error, "Failed to export interview guide");
    }
  });

  // Benchmark routes
}
