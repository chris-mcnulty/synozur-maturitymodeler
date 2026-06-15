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
  import { z } from "zod";
  import { randomBytes, createHash } from "crypto";
  import bcrypt from "bcryptjs";
  import { generateAdminConsentUrl, isSsoConfigured, extractDomain } from "../services/sso-service";
  import { hashPassword, comparePasswords } from "../utils/password";
import { calculateAssessmentScore, type ScoringQuestion } from "../services/scoring";
import { getAssessmentReview } from "../services/assessment-review-service";
import { calculateAssessmentResults, bulkAssignDemographics, exportModelAnalysis } from "../services/assessment-analytics-service";
import { generateAssessmentRecommendations } from "../services/ai-content-service";
import { sendServiceError } from "../services/service-error";
  
export function registerAssessmentRoutes(app: Express) {
  app.post("/api/assessments", async (req, res) => {
    try {
      const validatedData = insertAssessmentSchema.parse(req.body);
      
      // Check if user has access to the model before creating assessment
      const model = await storage.getModel(validatedData.modelId);
      if (!model) {
        return res.status(404).json({ error: "Model not found" });
      }

      if (!(await canAccessModel(req.user, model))) {
        return res.status(404).json({ error: "Model not found" }); // 404 to hide existence
      }

      // Add userId from authenticated user if available
      const assessmentData = {
        ...validatedData,
        userId: req.isAuthenticated() ? req.user!.id : null,
      };
      const assessment = await storage.createAssessment(assessmentData);
      res.json(assessment);
    } catch (error) {
      res.status(400).json({ error: "Invalid assessment data" });
    }
  });

  // Create proxy assessment (admin/modeler only)

  app.post("/api/admin/assessments/proxy", ensureAdminOrModeler, async (req, res) => {
    try {
      const { modelId, proxyName, proxyCompany, proxyJobTitle, proxyIndustry, proxyCompanySize, proxyCountry } = req.body;
      
      // Validate required fields
      if (!modelId || !proxyName || !proxyCompany) {
        return res.status(400).json({ error: "Model, name, and company are required" });
      }

      // Create assessment with proxy profile
      const assessment = await storage.createAssessment({
        modelId,
        userId: req.user!.id, // The admin/modeler creating the assessment
        status: "in_progress",
        isProxy: true,
        proxyName,
        proxyCompany,
        proxyJobTitle: proxyJobTitle || null,
        proxyIndustry: proxyIndustry || null,
        proxyCompanySize: proxyCompanySize || null,
        proxyCountry: proxyCountry || null,
      });

      res.json(assessment);
    } catch (error) {
      console.error('Failed to create proxy assessment:', error);
      res.status(500).json({ error: "Failed to create proxy assessment" });
    }
  });

  // Get all assessments for current user

  app.get("/api/assessments", async (req, res) => {
    try {
      if (!req.isAuthenticated()) {
        return res.json([]); // Return empty array for unauthenticated users
      }
      
      const assessments = await storage.getAssessmentsByUserId(req.user!.id);
      res.json(assessments);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch assessments" });
    }
  });

  // Get user's assessment history with model names and results (for profile page)

  app.get("/api/user/assessment-history", ensureAuthenticated, async (req, res) => {
    try {
      const userId = req.user!.id;
      console.log('[assessment-history] Fetching for user:', userId);
      const historyData = await db
        .select({
          assessmentId: schema.assessments.id,
          modelId: schema.assessments.modelId,
          modelName: schema.models.name,
          modelSlug: schema.models.slug,
          status: schema.assessments.status,
          startedAt: schema.assessments.startedAt,
          completedAt: schema.assessments.completedAt,
          isProxy: schema.assessments.isProxy,
          resultId: schema.results.id,
          overallScore: schema.results.overallScore,
          maturityLevel: schema.results.label,
          resultCreatedAt: schema.results.createdAt,
          maturityScale: schema.models.maturityScale,
          assessmentMode: schema.models.assessmentMode,
        })
        .from(schema.assessments)
        .innerJoin(schema.models, eq(schema.assessments.modelId, schema.models.id))
        .leftJoin(schema.results, eq(schema.results.assessmentId, schema.assessments.id))
        .where(eq(schema.assessments.userId, userId))
        .orderBy(sql`COALESCE(${schema.assessments.completedAt}, ${schema.assessments.startedAt}) DESC`);

      const formatted = historyData.map(r => {
        const maturityScale = (r.maturityScale as any[]) || [];
        const maxScore = maturityScale.length > 0
          ? Math.max(...maturityScale.map((s: any) => s.maxScore || 100))
          : 100;
        return {
          assessmentId: r.assessmentId,
          modelId: r.modelId,
          modelName: r.modelName,
          modelSlug: r.modelSlug,
          status: r.status,
          startedAt: r.startedAt,
          completedAt: r.completedAt,
          isProxy: r.isProxy,
          resultId: r.resultId,
          overallScore: r.overallScore,
          maturityLevel: r.maturityLevel,
          resultCreatedAt: r.resultCreatedAt,
          maxScore,
          assessmentMode: r.assessmentMode,
        };
      });

      console.log('[assessment-history] Returning', formatted.length, 'items for user', userId);
      res.json(formatted);
    } catch (error) {
      console.error('Failed to fetch user assessment history:', error);
      res.status(500).json({ error: "Failed to fetch assessment history" });
    }
  });

  // Delete an assessment (owner or admin only)

  app.delete("/api/assessments/:id", ensureAuthenticated, async (req, res) => {
    try {
      const assessment = await storage.getAssessment(req.params.id);
      if (!assessment) {
        return res.status(404).json({ error: "Assessment not found" });
      }
      const isOwner = assessment.userId === req.user!.id;
      const isGlobalAdmin = req.user!.role === 'global_admin';
      const isTenantAdmin = req.user!.role === 'tenant_admin';
      let isScopedTenantAdmin = false;
      if (isTenantAdmin && assessment.userId) {
        const assessmentUser = await storage.getUser(assessment.userId);
        isScopedTenantAdmin = !!assessmentUser && assessmentUser.tenantId === req.user!.tenantId;
      }
      if (!isOwner && !isGlobalAdmin && !isScopedTenantAdmin) {
        return res.status(403).json({ error: "Not authorized to delete this assessment" });
      }
      await storage.deleteAssessment(req.params.id);
      res.json({ success: true });
    } catch (error) {
      console.error('Failed to delete assessment:', error);
      res.status(500).json({ error: "Failed to delete assessment" });
    }
  });

  // Get all assessments with user data (admin only)

  app.get("/api/admin/assessments", ensureAdmin, async (req, res) => {
    try {
      const { startDate, endDate, status, modelId, isProxy, tagId } = req.query;
      
      // Build query conditions
      let query = db.select().from(schema.assessments);
      let conditions = [];
      
      // Apply date range filter
      if (startDate) {
        conditions.push(gte(schema.assessments.startedAt, new Date(startDate as string)));
      }
      if (endDate) {
        // Include the entire end date by adding one day
        const endDateTime = new Date(endDate as string);
        endDateTime.setDate(endDateTime.getDate() + 1);
        conditions.push(lt(schema.assessments.startedAt, endDateTime));
      }
      
      // Apply status filter
      if (status && status !== 'all') {
        conditions.push(eq(schema.assessments.status, status as string));
      }
      
      // Apply model filter
      if (modelId && modelId !== 'all') {
        conditions.push(eq(schema.assessments.modelId, modelId as string));
      }
      
      // Apply proxy filter
      if (isProxy === 'true') {
        conditions.push(eq(schema.assessments.isProxy, true));
      } else if (isProxy === 'false') {
        conditions.push(eq(schema.assessments.isProxy, false));
      }
      
      // Push tag filter into SQL via subquery so we never load the full
      // assessments table just to filter it in memory.
      if (tagId && tagId !== 'all') {
        conditions.push(
          inArray(
            schema.assessments.id,
            db.select({ id: schema.assessmentTagAssignments.assessmentId })
              .from(schema.assessmentTagAssignments)
              .where(eq(schema.assessmentTagAssignments.tagId, tagId as string))
          )
        );
      }
      
      // Fetch assessments + user data in a single LEFT JOIN (avoids per-row user lookup)
      const baseQuery = db
        .select({
          assessment: schema.assessments,
          user: {
            id: schema.users.id,
            name: schema.users.name,
            company: schema.users.company,
          },
        })
        .from(schema.assessments)
        .leftJoin(schema.users, eq(schema.assessments.userId, schema.users.id));
      
      const rows = conditions.length > 0
        ? await baseQuery.where(and(...conditions))
        : await baseQuery;
      
      const assessmentsWithUsers = rows.map(r => ({
        ...r.assessment,
        user: r.user?.id ? r.user : null,
      }));
      
      res.json(assessmentsWithUsers);
    } catch (error) {
      console.error('Failed to fetch assessments:', error);
      res.status(500).json({ error: "Failed to fetch all assessments" });
    }
  });

  // Optimized endpoint for admin results - fetches everything in one query

  app.get("/api/admin/results", ensureAdmin, async (req, res) => {
    try {
      const { startDate, endDate, status, modelId, isProxy, tagId } = req.query;
      console.log('Admin results query params:', { startDate, endDate, status, modelId, isProxy, tagId });
      
      // Build conditions array
      let conditions: any[] = [];
      
      // Only get completed assessments with results
      conditions.push(eq(schema.assessments.status, 'completed'));
      conditions.push(isNotNull(schema.results.id));
      
      // Apply date range filter using COALESCE(completed_at, started_at) to handle legacy NULLs
      if (startDate) {
        conditions.push(sql`COALESCE(${schema.assessments.completedAt}, ${schema.assessments.startedAt}) >= ${new Date(startDate as string)}`);
      }
      if (endDate) {
        const endDateTime = new Date(endDate as string);
        endDateTime.setDate(endDateTime.getDate() + 1);
        conditions.push(sql`COALESCE(${schema.assessments.completedAt}, ${schema.assessments.startedAt}) < ${endDateTime}`);
      }
      
      // Apply status filter (for results, we mainly care about completed)
      if (status && status !== 'all' && status !== 'completed') {
        conditions.push(eq(schema.assessments.status, status as string));
      }
      
      // Apply model filter
      if (modelId && modelId !== 'all') {
        conditions.push(eq(schema.assessments.modelId, modelId as string));
      }
      
      // Apply proxy filter
      if (isProxy === 'true') {
        conditions.push(eq(schema.assessments.isProxy, true));
      } else if (isProxy === 'false') {
        conditions.push(eq(schema.assessments.isProxy, false));
      }
      
      // Single query with JOINs to get all data at once
      const resultsData = await db
        .select({
          // Result fields
          resultId: schema.results.id,
          overallScore: schema.results.overallScore,
          dimensionScores: schema.results.dimensionScores,
          maturityLevel: schema.results.label,
          resultCreatedAt: schema.results.createdAt,
          // Assessment fields
          assessmentId: schema.assessments.id,
          modelId: schema.assessments.modelId,
          assessmentStatus: schema.assessments.status,
          startedAt: schema.assessments.startedAt,
          completedAt: schema.assessments.completedAt,
          isProxy: schema.assessments.isProxy,
          proxyName: schema.assessments.proxyName,
          proxyCompany: schema.assessments.proxyCompany,
          proxyJobTitle: schema.assessments.proxyJobTitle,
          proxyIndustry: schema.assessments.proxyIndustry,
          proxyCompanySize: schema.assessments.proxyCompanySize,
          proxyCountry: schema.assessments.proxyCountry,
          userId: schema.assessments.userId,
          // User fields (may be null for anonymous)
          userName: schema.users.name,
          userEmail: schema.users.email,
          userCompany: schema.users.company,
          // Model fields
          modelName: schema.models.name,
          modelSlug: schema.models.slug,
          maturityScale: schema.models.maturityScale,
          assessmentMode: schema.models.assessmentMode,
        })
        .from(schema.results)
        .innerJoin(schema.assessments, eq(schema.results.assessmentId, schema.assessments.id))
        .innerJoin(schema.models, eq(schema.assessments.modelId, schema.models.id))
        .leftJoin(schema.users, eq(schema.assessments.userId, schema.users.id))
        .where(and(...conditions))
        .orderBy(sql`COALESCE(${schema.assessments.completedAt}, ${schema.assessments.startedAt}) DESC`);
      
      console.log('Admin results query returned:', resultsData.length, 'results');
      
      // Apply tag filter if specified (requires separate query due to many-to-many)
      let filteredResults = resultsData;
      if (tagId && tagId !== 'all') {
        const tagAssignments = await db.select()
          .from(schema.assessmentTagAssignments)
          .where(eq(schema.assessmentTagAssignments.tagId, tagId as string));
        const assessmentIdsWithTag = new Set(tagAssignments.map(ta => ta.assessmentId));
        filteredResults = resultsData.filter(r => assessmentIdsWithTag.has(r.assessmentId));
      }
      
      // Transform to expected format
      const formattedResults = filteredResults.map(r => {
        const maturityScale = (r.maturityScale as any[]) || [];
        const maxScore = maturityScale.length > 0 
          ? Math.max(...maturityScale.map((s: any) => s.maxScore || 100))
          : 100;
        
        // Build proxy profile object if this is a proxy assessment
        const proxyProfile = r.isProxy ? {
          name: r.proxyName,
          company: r.proxyCompany,
          jobTitle: r.proxyJobTitle,
          industry: r.proxyIndustry,
          companySize: r.proxyCompanySize,
          country: r.proxyCountry,
        } : null;
        
        return {
          id: r.resultId,
          assessmentId: r.assessmentId,
          modelId: r.modelId,
          overallScore: r.overallScore,
          dimensionScores: r.dimensionScores,
          label: r.maturityLevel,
          createdAt: r.resultCreatedAt,
          status: r.assessmentStatus,
          modelName: r.modelName,
          modelSlug: r.modelSlug,
          assessmentMode: r.assessmentMode,
          userName: r.userName,
          userEmail: r.userEmail,
          userCompany: r.userCompany,
          isProxy: r.isProxy,
          proxyProfile,
          completedAt: r.completedAt,
          startedAt: r.startedAt,
          maxScore,
        };
      });
      
      res.json(formattedResults);
    } catch (error) {
      console.error('Failed to fetch admin results:', error);
      res.status(500).json({ error: "Failed to fetch results" });
    }
  });

  // Get all content data for a model (for content management)

  app.get("/api/assessments/:id", async (req, res) => {
    try {
      const assessment = await storage.getAssessment(req.params.id);
      if (!assessment) {
        return res.status(404).json({ error: "Assessment not found" });
      }
      res.json(assessment);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch assessment" });
    }
  });

  app.patch("/api/assessments/:id", async (req, res) => {
    try {
      const assessment = await storage.updateAssessment(req.params.id, req.body);
      if (!assessment) {
        return res.status(404).json({ error: "Assessment not found" });
      }
      res.json(assessment);
    } catch (error) {
      res.status(500).json({ error: "Failed to update assessment" });
    }
  });

  // Claim an anonymous assessment after authentication

  app.post("/api/assessments/:id/claim", ensureAuthenticated, async (req, res) => {
    try {
      const assessment = await storage.getAssessment(req.params.id);
      
      if (!assessment) {
        return res.status(404).json({ error: "Assessment not found" });
      }
      
      // If assessment already has a user, check if it's the current user
      if (assessment.userId) {
        if (assessment.userId === req.user!.id) {
          // Already owned by this user, return success (idempotent)
          return res.json(assessment);
        } else {
          // Owned by different user, cannot claim
          return res.status(403).json({ error: "Assessment belongs to another user" });
        }
      }
      
      // Claim the anonymous assessment for the current user
      const updatedAssessment = await storage.updateAssessment(req.params.id, {
        userId: req.user!.id
      });
      
      res.json(updatedAssessment);
    } catch (error) {
      console.error("Error claiming assessment:", error);
      res.status(500).json({ error: "Failed to claim assessment" });
    }
  });

  // Assessment response routes

  app.post("/api/assessments/:id/responses", async (req, res) => {
    try {
      const { questionId, answerId, answerIds, numericValue, booleanValue, textValue } = req.body;
      
      console.log("Saving response:", { 
        assessmentId: req.params.id, 
        questionId, 
        answerId,
        answerIds, 
        numericValue, 
        booleanValue, 
        textValue 
      });
      
      // Check if response already exists
      const existing = await storage.getAssessmentResponse(req.params.id, questionId);
      
      let response;
      if (existing) {
        // Update existing response
        const updateData: any = {};
        
        // Clear all fields first
        updateData.answerId = null;
        updateData.answerIds = null;
        updateData.numericValue = null;
        updateData.booleanValue = null;
        updateData.textValue = null;
        
        // Set the appropriate field based on what was provided
        if (numericValue !== undefined) {
          updateData.numericValue = numericValue;
        } else if (booleanValue !== undefined) {
          updateData.booleanValue = booleanValue;
        } else if (textValue !== undefined) {
          updateData.textValue = textValue;
        } else if (answerIds !== undefined) {
          updateData.answerIds = answerIds; // For multi-select questions
        } else if (answerId !== undefined) {
          updateData.answerId = answerId;
        }
        
        response = await storage.updateAssessmentResponse(existing.id, updateData);
      } else {
        // Create new response
        const responseData: any = {
          assessmentId: req.params.id,
          questionId,
        };
        
        // Set the appropriate field based on what was provided
        if (numericValue !== undefined) {
          responseData.numericValue = numericValue;
        } else if (booleanValue !== undefined) {
          responseData.booleanValue = booleanValue;
        } else if (textValue !== undefined) {
          responseData.textValue = textValue;
        } else if (answerIds !== undefined) {
          responseData.answerIds = answerIds; // For multi-select questions
        } else if (answerId !== undefined) {
          responseData.answerId = answerId;
        }
        
        const validatedData = insertAssessmentResponseSchema.parse(responseData);
        response = await storage.createAssessmentResponse(validatedData);
      }
      
      res.json(response);
    } catch (error) {
      console.error("Error saving response:", error);
      res.status(400).json({ error: "Invalid response data" });
    }
  });

  app.get("/api/assessments/:id/responses", async (req, res) => {
    try {
      const responses = await storage.getAssessmentResponses(req.params.id);
      res.json(responses);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch responses" });
    }
  });

  // Results routes

  app.post("/api/assessments/:id/calculate", async (req, res) => {
    try {
      const result = await calculateAssessmentResults(req.params.id);
      res.json(result);
    } catch (error) {
      sendServiceError(res, error, "Failed to calculate results");
    }
  });

  // === legacy inline scoring removed; replaced by scoring service above ===

  app.get("/api/results/:assessmentId", async (req, res) => {
    try {
      const result = await storage.getResult(req.params.assessmentId);
      if (!result) {
        return res.status(404).json({ error: "Result not found" });
      }
      res.json(result);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch result" });
    }
  });

  // Generate AI recommendations for completed assessment
  app.post("/api/assessments/:id/recommendations", async (req, res) => {
    try {
      const recommendations = await generateAssessmentRecommendations(req.params.id);
      res.json(recommendations);
    } catch (error) {
      sendServiceError(res, error, "Failed to generate recommendations");
    }
  });

  // User results

  app.get("/api/users/:userId/results", async (req, res) => {
    try {
      const results = await storage.getResultsByUserId(req.params.userId);
      res.json(results);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch user results" });
    }
  });

  // Admin routes for model management

  app.get("/api/assessments/:id/export", async (req, res) => {
    try {
      const assessment = await storage.getAssessment(req.params.id);
      if (!assessment) {
        return res.status(404).json({ error: "Assessment not found" });
      }

      const responses = await storage.getAssessmentResponses(assessment.id);
      const result = await storage.getResult(assessment.id);
      const model = await storage.getModel(assessment.modelId);
      
      const exportData = {
        assessment: {
          id: assessment.id,
          modelName: model?.name,
          modelSlug: model?.slug,
          status: assessment.status,
          startedAt: assessment.startedAt,
          completedAt: assessment.completedAt,
        },
        responses,
        result,
      };

      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename="assessment-${assessment.id}-export.json"`);
      res.json(exportData);
    } catch (error) {
      console.error('Export error:', error);
      res.status(500).json({ error: "Failed to export assessment results" });
    }
  });

  // Assessment review — returns fully-resolved Q&A for admin/modeler review
  app.get("/api/admin/assessments/:id/review", ensureAdminOrModeler, async (req, res) => {
    try {
      const review = await getAssessmentReview(req.params.id);
      res.json(review);
    } catch (error) {
      sendServiceError(res, error, "Failed to load assessment review");
    }
  });

  // Send PDF via email

  app.post('/api/admin/import/preview', ensureAdminOrModeler, async (req, res) => {
    try {
      const { importData, modelSlug } = req.body;
      
      if (!importData || !modelSlug) {
        return res.status(400).json({ error: "Missing required fields: importData and modelSlug" });
      }
      
      const validation = await validateImportData(importData as ImportExportData, modelSlug);
      
      res.json(validation);
    } catch (error) {
      console.error('Import preview error:', error);
      res.status(500).json({ 
        error: "Failed to preview import", 
        details: error instanceof Error ? error.message : 'Unknown error' 
      });
    }
  });
  
  // Execute import

  app.post('/api/admin/import/execute', ensureAdminOrModeler, async (req, res) => {
    try {
      const { importData, modelSlug, filename } = req.body;
      
      if (!importData || !modelSlug) {
        return res.status(400).json({ error: "Missing required fields: importData and modelSlug" });
      }
      
      if (!req.user) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      
      const result = await executeImport(
        importData as ImportExportData,
        modelSlug,
        req.user.id,
        filename || null
      );
      
      res.json({ 
        success: true,
        message: `Successfully imported ${result.importedCount} assessments`,
        ...result
      });
    } catch (error) {
      console.error('Import execution error:', error);
      res.status(500).json({ 
        error: "Failed to execute import", 
        details: error instanceof Error ? error.message : 'Unknown error' 
      });
    }
  });
  
  // List all import batches

  app.get('/api/admin/import/batches', ensureAdminOrModeler, async (req, res) => {
    try {
      const batches = await db
        .select()
        .from(schema.importBatches)
        .orderBy(desc(schema.importBatches.createdAt));
      
      // Fetch user info separately for each batch
      const batchesWithUsers = await Promise.all(
        batches.map(async (batch) => {
          const userResult = await db
            .select({
              id: schema.users.id,
              username: schema.users.username,
              name: schema.users.name,
            })
            .from(schema.users)
            .where(eq(schema.users.id, batch.importedBy))
            .limit(1);
          
          return {
            ...batch,
            importedBy: userResult[0],
          };
        })
      );
      
      res.json(batchesWithUsers);
    } catch (error) {
      console.error('Failed to fetch import batches:', error);
      res.status(500).json({ error: "Failed to fetch import batches" });
    }
  });
  
  // Delete an import batch (and all its assessments)

  app.delete('/api/admin/import/batches/:id', ensureAdminOrModeler, async (req, res) => {
    try {
      const { id } = req.params;
      
      // Get batch info before deletion
      const batchResult = await db
        .select()
        .from(schema.importBatches)
        .where(eq(schema.importBatches.id, id))
        .limit(1);
      
      const batch = batchResult[0];
      
      if (!batch) {
        return res.status(404).json({ error: "Import batch not found" });
      }
      
      // Delete the batch (cascades to assessments, responses, results)
      await db.delete(schema.importBatches)
        .where(eq(schema.importBatches.id, id));
      
      res.json({ 
        success: true, 
        message: `Successfully deleted import batch and ${batch.assessmentCount} assessments` 
      });
    } catch (error) {
      console.error('Failed to delete import batch:', error);
      res.status(500).json({ error: "Failed to delete import batch" });
    }
  });

  // ========== ASSESSMENT TAG ROUTES ==========
  
  // Get all tags

  app.get("/api/admin/tags", ensureAdminOrModeler, async (req, res) => {
    try {
      const tags = await db
        .select()
        .from(schema.assessmentTags)
        .orderBy(schema.assessmentTags.name);
      res.json(tags);
    } catch (error) {
      console.error('Error fetching tags:', error);
      res.status(500).json({ error: "Failed to fetch tags" });
    }
  });
  
  // Create a new tag

  app.post("/api/admin/tags", ensureAdminOrModeler, async (req, res) => {
    try {
      const { name, color, description } = req.body;
      
      if (!name || name.trim().length === 0) {
        return res.status(400).json({ error: "Tag name is required" });
      }
      
      const [newTag] = await db
        .insert(schema.assessmentTags)
        .values({
          name: name.trim(),
          color: color || "#6366f1",
          description: description || null,
          createdBy: req.user?.id || null,
        })
        .returning();
      
      res.status(201).json(newTag);
    } catch (error: any) {
      if (error.code === '23505') {
        return res.status(400).json({ error: "A tag with this name already exists" });
      }
      console.error('Error creating tag:', error);
      res.status(500).json({ error: "Failed to create tag" });
    }
  });
  
  // Update a tag

  app.patch("/api/admin/tags/:id", ensureAdminOrModeler, async (req, res) => {
    try {
      const { id } = req.params;
      const { name, color, description } = req.body;
      
      const updates: any = {};
      if (name !== undefined) updates.name = name.trim();
      if (color !== undefined) updates.color = color;
      if (description !== undefined) updates.description = description;
      
      if (Object.keys(updates).length === 0) {
        return res.status(400).json({ error: "No updates provided" });
      }
      
      const [updatedTag] = await db
        .update(schema.assessmentTags)
        .set(updates)
        .where(eq(schema.assessmentTags.id, id))
        .returning();
      
      if (!updatedTag) {
        return res.status(404).json({ error: "Tag not found" });
      }
      
      res.json(updatedTag);
    } catch (error: any) {
      if (error.code === '23505') {
        return res.status(400).json({ error: "A tag with this name already exists" });
      }
      console.error('Error updating tag:', error);
      res.status(500).json({ error: "Failed to update tag" });
    }
  });
  
  // Delete a tag

  app.delete("/api/admin/tags/:id", ensureAdminOrModeler, async (req, res) => {
    try {
      const { id } = req.params;
      
      const [deleted] = await db
        .delete(schema.assessmentTags)
        .where(eq(schema.assessmentTags.id, id))
        .returning();
      
      if (!deleted) {
        return res.status(404).json({ error: "Tag not found" });
      }
      
      res.json({ success: true, message: "Tag deleted successfully" });
    } catch (error) {
      console.error('Error deleting tag:', error);
      res.status(500).json({ error: "Failed to delete tag" });
    }
  });
  
  // Get tags for a specific assessment

  app.get("/api/admin/assessments/:assessmentId/tags", ensureAdminOrModeler, async (req, res) => {
    try {
      const { assessmentId } = req.params;
      
      const assignments = await db
        .select({
          tag: schema.assessmentTags,
          assignedAt: schema.assessmentTagAssignments.assignedAt,
        })
        .from(schema.assessmentTagAssignments)
        .innerJoin(schema.assessmentTags, eq(schema.assessmentTagAssignments.tagId, schema.assessmentTags.id))
        .where(eq(schema.assessmentTagAssignments.assessmentId, assessmentId));
      
      res.json(assignments.map(a => ({
        ...a.tag,
        assignedAt: a.assignedAt,
      })));
    } catch (error) {
      console.error('Error fetching assessment tags:', error);
      res.status(500).json({ error: "Failed to fetch assessment tags" });
    }
  });
  
  // Assign tags to an assessment (bulk update)

  app.put("/api/admin/assessments/:assessmentId/tags", ensureAdminOrModeler, async (req, res) => {
    try {
      const { assessmentId } = req.params;
      const { tagIds } = req.body;
      
      if (!Array.isArray(tagIds)) {
        return res.status(400).json({ error: "tagIds must be an array" });
      }
      
      // Remove existing tags for this assessment
      await db
        .delete(schema.assessmentTagAssignments)
        .where(eq(schema.assessmentTagAssignments.assessmentId, assessmentId));
      
      // Add new tag assignments
      if (tagIds.length > 0) {
        await db
          .insert(schema.assessmentTagAssignments)
          .values(tagIds.map((tagId: string) => ({
            assessmentId,
            tagId,
            assignedBy: req.user?.id || null,
          })));
      }
      
      // Return updated tags
      const assignments = await db
        .select({
          tag: schema.assessmentTags,
        })
        .from(schema.assessmentTagAssignments)
        .innerJoin(schema.assessmentTags, eq(schema.assessmentTagAssignments.tagId, schema.assessmentTags.id))
        .where(eq(schema.assessmentTagAssignments.assessmentId, assessmentId));
      
      res.json(assignments.map(a => a.tag));
    } catch (error) {
      console.error('Error updating assessment tags:', error);
      res.status(500).json({ error: "Failed to update assessment tags" });
    }
  });
  
  // Add a single tag to an assessment

  app.post("/api/admin/assessments/:assessmentId/tags/:tagId", ensureAdminOrModeler, async (req, res) => {
    try {
      const { assessmentId, tagId } = req.params;
      
      await db
        .insert(schema.assessmentTagAssignments)
        .values({
          assessmentId,
          tagId,
          assignedBy: req.user?.id || null,
        })
        .onConflictDoNothing();
      
      res.json({ success: true });
    } catch (error) {
      console.error('Error adding tag to assessment:', error);
      res.status(500).json({ error: "Failed to add tag to assessment" });
    }
  });
  
  // Remove a single tag from an assessment

  app.delete("/api/admin/assessments/:assessmentId/tags/:tagId", ensureAdminOrModeler, async (req, res) => {
    try {
      const { assessmentId, tagId } = req.params;
      
      await db
        .delete(schema.assessmentTagAssignments)
        .where(
          and(
            eq(schema.assessmentTagAssignments.assessmentId, assessmentId),
            eq(schema.assessmentTagAssignments.tagId, tagId)
          )
        );
      
      res.json({ success: true });
    } catch (error) {
      console.error('Error removing tag from assessment:', error);
      res.status(500).json({ error: "Failed to remove tag from assessment" });
    }
  });

  // Bulk assign demographics to all assessments with a specific tag
  app.post("/api/admin/assessments/bulk-demographics", ensureAdminOrModeler, async (req, res) => {
    try {
      const { tagId, industry, companySize, country } = req.body;
      const result = await bulkAssignDemographics({ tagId, industry, companySize, country });
      res.json(result);
    } catch (error) {
      sendServiceError(res, error, "Failed to bulk assign demographics");
    }
  });

  // Export analytical data for a specific model (for external analysis tools)
  app.get("/api/admin/export/model/:modelSlug/analysis", ensureAdminOrModeler, async (req, res) => {
    try {
      const { modelSlug, exportData } = await exportModelAnalysis(req.params.modelSlug);
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename="${modelSlug}-analysis-${new Date().toISOString().split('T')[0]}.json"`);
      res.json(exportData);
    } catch (error) {
      sendServiceError(res, error, "Failed to generate export");
    }
  });

  // Traffic Analytics Routes
  
  // Track page visits (public endpoint - no auth required)
}
