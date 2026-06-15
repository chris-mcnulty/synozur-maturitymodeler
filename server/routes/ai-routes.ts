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
  import { approveAiReview, rejectAiReview, generateAssessmentInsights, bulkRewriteAnswers } from "../services/ai-content-service";
  import { sendServiceError } from "../services/service-error";
  
export function registerAiRoutes(app: Express) {
  app.delete('/api/admin/ai/cache', ensureAdmin, async (req, res) => {
    try {
      const { modelId } = req.query;
      
      if (modelId) {
        // Get model name to match against cache metadata
        const model = await storage.getModel(modelId as string);
        if (!model) {
          return res.status(404).json({ error: "Model not found" });
        }
        
        // Get all cache entries
        const allCache = await db.select().from(schema.aiGeneratedContent);
        
        // Filter cache entries that contain this model name in their metadata
        const entriesToDelete = allCache.filter(entry => {
          const metadata = entry.metadata as any;
          if (!metadata) return false;
          // Check if the metadata contains this model's name
          // Metadata can be either { modelName: ... } or { context: { modelName: ... } }
          const modelName = metadata.modelName || metadata.context?.modelName;
          return modelName === model.name;
        });
        
        // Delete filtered entries
        let deletedCount = 0;
        for (const entry of entriesToDelete) {
          await db.delete(schema.aiGeneratedContent)
            .where(eq(schema.aiGeneratedContent.id, entry.id));
          deletedCount++;
        }
        
        res.json({ 
          success: true, 
          message: `Cleared ${deletedCount} cache entries for ${model.name}`,
          deletedCount
        });
      } else {
        // Clear all AI cache
        await db.delete(schema.aiGeneratedContent);
        res.json({ 
          success: true, 
          message: 'All AI cache cleared successfully' 
        });
      }
    } catch (error) {
      console.error('Error clearing AI cache:', error);
      res.status(500).json({ error: "Failed to clear AI cache" });
    }
  });

  // Get AI cache statistics

  app.get('/api/admin/ai/cache-stats', ensureAdmin, async (req, res) => {
    try {
      const now = new Date();
      
      // Count total cached items
      const allCache = await db.select().from(schema.aiGeneratedContent);
      const totalCount = allCache.length;
      
      // Count expired items
      const expiredCount = allCache.filter(item => new Date(item.expiresAt) < now).length;
      
      // Count valid items
      const validCount = totalCount - expiredCount;
      
      // Group by type
      const byType: Record<string, number> = {};
      allCache.forEach(item => {
        byType[item.type] = (byType[item.type] || 0) + 1;
      });
      
      res.json({
        total: totalCount,
        valid: validCount,
        expired: expiredCount,
        byType
      });
    } catch (error) {
      console.error('Error getting cache stats:', error);
      res.status(500).json({ error: "Failed to get cache statistics" });
    }
  });

  // Admin manual email verification

  app.post("/api/admin/ai/generate-interpretations", ensureAdminOrModeler, async (req, res) => {
    try {
      const { modelId, maturityLevel, score } = req.body;
      
      // Validate input
      if (!modelId || maturityLevel === undefined || !score) {
        return res.status(400).json({ error: "Model ID, maturity level, and score are required" });
      }

      const model = await storage.getModel(modelId);
      if (!model) {
        return res.status(404).json({ error: "Model not found" });
      }

      // Generate using AI
      const prompt = `Generate a maturity level interpretation for a ${model.name} assessment.

Maturity Level: ${maturityLevel}
Score: ${score}/500

STRICT RULES:
- interpretation: MAXIMUM 30 words (2 lines)
- characteristics: Each MAXIMUM 10 words

Provide:
1. Title (2-3 words)
2. Interpretation (MAXIMUM 30 words explaining this score)
3. 3 characteristics (each MAXIMUM 10 words)

Respond in JSON format:
{
  "title": "Level Title",
  "interpretation": "Brief 30-word max interpretation",
  "characteristics": ["10 words max", "10 words max", "10 words max"]
}`;

      const interpretation = await aiService.generateText(prompt, { outputFormat: 'json' });

      // Save to review queue instead of directly applying
      const review = await storage.createAiContentReview({
        type: 'interpretation',
        contentType: 'maturity_level_interpretation',
        modelId,
        targetId: `${modelId}_level_${maturityLevel}`, // Unique identifier for this interpretation
        generatedContent: interpretation as any,
        metadata: { modelId, maturityLevel, score, modelName: model.name },
        status: 'pending',
        createdBy: req.user!.id
      });

      // Log usage
      await storage.createAiUsageLog({
        userId: req.user!.id,
        modelName: (await providerRegistry.getActiveConfig()).modelId || 'unknown',
        operation: 'generate-interpretation',
        estimatedCost: 3
      });

      res.json({ 
        success: true, 
        message: "Interpretation generated and sent to review queue",
        reviewId: review.id
      });
    } catch (error) {
      console.error('Failed to generate interpretation:', error);
      res.status(500).json({ error: "Failed to generate interpretation" });
    }
  });

  // Generate resource suggestions for a dimension

  app.post("/api/admin/ai/generate-resources", ensureAdminOrModeler, async (req, res) => {
    try {
      const { modelId, dimensionId, scoreLevel } = req.body;
      
      // Validate input
      if (!modelId || !dimensionId || !scoreLevel) {
        return res.status(400).json({ error: "Model ID, dimension ID, and score level are required" });
      }

      const model = await storage.getModel(modelId);
      const dimension = await storage.getDimension(dimensionId);
      
      if (!model || !dimension) {
        return res.status(404).json({ error: "Model or dimension not found" });
      }

      // Generate using AI
      const prompt = `Generate improvement actions for the ${dimension.label} dimension of the ${model.name} assessment.

Current score level: ${scoreLevel} (low/medium/high)

STRICT RULES:
- NO URLs or links (we'll add these manually)
- Each description: MAXIMUM 30 words (2 lines)
- Focus on actionable improvements only

Generate 3 improvement actions:

Respond in JSON format:
{
  "resources": [
    {
      "title": "Action Title",
      "description": "30-word max actionable improvement step",
      "link": "",
      "type": "action"
    }
  ]
}`;

      const resources = await aiService.generateText(prompt, { outputFormat: 'json' });

      // Save to review queue instead of directly applying
      const review = await storage.createAiContentReview({
        type: 'resource',
        contentType: 'dimension_resources',
        modelId,
        targetId: dimensionId,
        generatedContent: resources as any,
        metadata: { modelId, dimensionId, scoreLevel, modelName: model.name, dimensionLabel: dimension.label },
        status: 'pending',
        createdBy: req.user!.id
      });

      // Log usage
      await storage.createAiUsageLog({
        userId: req.user!.id,
        modelName: (await providerRegistry.getActiveConfig()).modelId || 'unknown',
        operation: 'generate-resources',
        estimatedCost: 4
      });

      res.json({
        success: true,
        message: "Resources generated and sent to review queue",
        reviewId: review.id
      });
    } catch (error: any) {
      console.error('Failed to generate resources:', error);
      const errorMessage = error?.message || "Failed to generate resources";
      res.status(500).json({ error: errorMessage });
    }
  });

  // Generate improvement statement for an answer option

  app.post("/api/admin/ai/generate-improvement", ensureAdminOrModeler, async (req, res) => {
    try {
      const { questionText, answerText, answerScore, answerId } = req.body;
      
      // Validate input
      if (!questionText || !answerText || answerScore === undefined) {
        return res.status(400).json({ error: "Question text, answer text, and answer score are required" });
      }

      // Generate using AI
      const prompt = `Generate an improvement statement for an assessment answer option.

Question: "${questionText}"
Selected Answer: "${answerText}"
Answer Score: ${answerScore}/100

STRICT RULES:
- improvementStatement: MAXIMUM 30 words (2 lines)
- quickWin: MAXIMUM 15 words

Generate:
1. Improvement statement (MAXIMUM 30 words)
2. Priority (high/medium/low) based on score
3. Quick win (MAXIMUM 15 words)

Respond in JSON format:
{
  "improvementStatement": "30-word max improvement",
  "priority": "high",
  "quickWin": "15-word max action"
}`;

      const improvement = await aiService.generateText(prompt, { outputFormat: 'json' });

      // Save to review queue instead of directly applying
      const review = await storage.createAiContentReview({
        type: 'improvement',
        contentType: 'answer_improvement',
        modelId: null,
        targetId: answerId || null,
        generatedContent: improvement as any,
        metadata: { questionText, answerText, answerScore },
        status: 'pending',
        createdBy: req.user!.id
      });

      // Log usage
      await storage.createAiUsageLog({
        userId: req.user!.id,
        modelName: (await providerRegistry.getActiveConfig()).modelId || 'unknown',
        operation: 'generate-improvement',
        estimatedCost: 2
      });

      res.json({
        success: true,
        message: "Improvement statement generated and sent to review queue",
        reviewId: review.id
      });
    } catch (error) {
      console.error('Failed to generate improvement statement:', error);
      res.status(500).json({ error: "Failed to generate improvement statement" });
    }
  });

  // Rewrite answer option to be more contextual to the specific question

  app.post("/api/admin/ai/rewrite-answer", ensureAdminOrModeler, async (req, res) => {
    try {
      const { questionText, answerText, answerScore, modelContext, answerId } = req.body;
      
      // Validate input
      if (!questionText || !answerText || answerScore === undefined) {
        return res.status(400).json({ error: "Question text, answer text, and answer score are required" });
      }

      // Generate using AI
      const rewrittenAnswer = await aiService.rewriteAnswer(
        questionText,
        answerText,
        answerScore,
        modelContext
      );

      // Save to review queue instead of directly applying
      const review = await storage.createAiContentReview({
        type: 'answer-rewrite',
        contentType: 'answer_rewrite',
        modelId: null,
        targetId: answerId || null,
        generatedContent: { rewrittenAnswer } as any,
        metadata: { questionText, answerText, answerScore, modelContext },
        status: 'pending',
        createdBy: req.user!.id
      });

      // Log usage
      await storage.createAiUsageLog({
        userId: req.user!.id,
        modelName: (await providerRegistry.getActiveConfig()).modelId || 'unknown',
        operation: 'rewrite-answer',
        estimatedCost: 1
      });

      res.json({
        success: true,
        message: "Answer rewrite generated and sent to review queue",
        reviewId: review.id
      });
    } catch (error) {
      console.error('Failed to rewrite answer:', error);
      res.status(500).json({ error: "Failed to rewrite answer" });
    }
  });

  // Bulk rewrite all answers for a question
  app.post("/api/admin/ai/rewrite-all-answers", ensureAdminOrModeler, async (req, res) => {
    try {
      const { questionId, questionText, answers, modelContext } = req.body;
      const result = await bulkRewriteAnswers({
        questionId,
        questionText,
        answers,
        modelContext,
        userId: req.user!.id,
      });
      res.json(result);
    } catch (error) {
      sendServiceError(res, error, "Failed to bulk rewrite answers");
    }
  });

  // AI Content Review Workflow Endpoints
  
  // Get all pending AI content reviews

  app.get("/api/admin/ai/pending-reviews", ensureAdminOrModeler, async (req, res) => {
    try {
      const { modelId } = req.query;
      const reviews = await storage.getPendingAiReviews(modelId as string | undefined);
      
      // Enhance with creator information
      const reviewsWithUsers = await Promise.all(
        reviews.map(async (review) => {
          const creator = await storage.getUser(review.createdBy);
          return {
            ...review,
            creatorName: creator?.name || creator?.username || 'Unknown'
          };
        })
      );
      
      res.json(reviewsWithUsers);
    } catch (error) {
      console.error('Failed to fetch pending reviews:', error);
      res.status(500).json({ error: "Failed to fetch pending reviews" });
    }
  });

  // Approve an AI content review (supports partial approvals)
  app.post("/api/admin/ai/approve-review/:id", ensureAdminOrModeler, async (req, res) => {
    try {
      const { id } = req.params;
      const { selectedItemIds, editedContent } = req.body;
      const result = await approveAiReview({ id, selectedItemIds, editedContent, userId: req.user!.id });
      res.json(result);
    } catch (error) {
      sendServiceError(res, error, "Failed to approve review");
    }
  });

  // Reject an AI content review (supports partial rejections)
  app.post("/api/admin/ai/reject-review/:id", ensureAdminOrModeler, async (req, res) => {
    try {
      const { id } = req.params;
      const { reason, selectedItemIds } = req.body;
      const result = await rejectAiReview({ id, reason, selectedItemIds, userId: req.user!.id });
      res.json(result);
    } catch (error) {
      sendServiceError(res, error, "Failed to reject review");
    }
  });

  // Generate maturity summary using AI

  app.post("/api/ai/generate-maturity-summary", async (req, res) => {
    try {
      const { overallScore, dimensionScores, modelName, userContext, maxScore, modelId, hideScoreAndNarratives, assessmentMode, archetypeLabel } = req.body;
      
      // Validate input — overallScore of 0 is valid for type/propensity assessments
      if (overallScore === undefined || overallScore === null || !dimensionScores || !modelName) {
        return res.status(400).json({ error: "Missing required fields" });
      }
      
      // Check if model allows anonymous results - if not, require authentication
      let allowAnonymous = false;
      if (modelId) {
        const model = await storage.getModel(modelId);
        allowAnonymous = model?.allowAnonymousResults ?? false;
      }
      
      if (!allowAnonymous && !req.isAuthenticated()) {
        return res.status(401).json({ error: "Authentication required" });
      }

      // Generate cache key (include assessmentMode and archetypeLabel so type results are cached separately)
      const contextHash = createHash('md5')
        .update(JSON.stringify({ overallScore, dimensionScores, modelName, userContext, maxScore, hideScoreAndNarratives: !!hideScoreAndNarratives, assessmentMode, archetypeLabel }))
        .digest('hex');

      // Check cache first
      const cached = await storage.getAiGeneratedContent('maturity-summary', contextHash);
      if (cached && cached.expiresAt && cached.expiresAt > new Date()) {
        return res.json({ summary: cached.content });
      }

      // Generate using AI with correct max score (defaults to 500 for legacy models)
      const summary = await aiService.generateMaturitySummary(
        overallScore,
        dimensionScores,
        modelName,
        userContext,
        maxScore || 500,
        !!hideScoreAndNarratives,
        assessmentMode,
        archetypeLabel
      );

      // Cache the result for 30 days
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 30);
      
      await storage.createAiGeneratedContent({
        type: 'maturity-summary',
        contextHash,
        content: summary as any,
        metadata: { overallScore, modelName, userContext },
        expiresAt
      });

      // Log usage (only if authenticated)
      if (req.user) {
        await storage.createAiUsageLog({
          userId: req.user.id,
          modelName: (await providerRegistry.getActiveConfig()).modelId || 'unknown',
          operation: 'generate-maturity-summary',
          estimatedCost: 3
        });
      }

      res.json({ summary });
    } catch (error) {
      console.error('Failed to generate maturity summary:', error);
      res.status(500).json({ error: "Failed to generate maturity summary" });
    }
  });

  // Generate recommendations summary using AI

  app.post("/api/ai/generate-recommendations-summary", async (req, res) => {
    try {
      const { recommendations, modelName, userContext, modelId } = req.body;
      
      // Validate input
      if (!recommendations || !modelName) {
        return res.status(400).json({ error: "Missing required fields" });
      }
      
      // Check if model allows anonymous results - if not, require authentication
      let allowAnonymous = false;
      if (modelId) {
        const model = await storage.getModel(modelId);
        allowAnonymous = model?.allowAnonymousResults ?? false;
      }
      
      if (!allowAnonymous && !req.isAuthenticated()) {
        return res.status(401).json({ error: "Authentication required" });
      }

      // Generate cache key
      const contextHash = createHash('md5')
        .update(JSON.stringify({ recommendations, modelName, userContext }))
        .digest('hex');

      // Check cache first
      const cached = await storage.getAiGeneratedContent('recommendations-summary', contextHash);
      if (cached && cached.expiresAt && cached.expiresAt > new Date()) {
        return res.json({ summary: cached.content });
      }

      // Generate using AI
      const summary = await aiService.generateRecommendationsSummary(
        recommendations,
        modelName,
        userContext
      );

      // Cache the result for 30 days
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 30);
      
      await storage.createAiGeneratedContent({
        type: 'recommendations-summary',
        contextHash,
        content: summary as any,
        metadata: { modelName, userContext },
        expiresAt
      });

      // Log usage (only if authenticated)
      if (req.user) {
        await storage.createAiUsageLog({
          userId: req.user.id,
          modelName: (await providerRegistry.getActiveConfig()).modelId || 'unknown',
          operation: 'generate-recommendations-summary',
          estimatedCost: 2
        });
      }

      res.json({ summary });
    } catch (error) {
      console.error('Failed to generate recommendations summary:', error);
      res.status(500).json({ error: "Failed to generate recommendations summary" });
    }
  });

  // Clear AI cache for a specific model (admin only)

  app.post("/api/admin/ai/clear-cache/:modelId", ensureAdmin, async (req, res) => {
    try {
      const { modelId } = req.params;
      
      // Delete all cached AI content for this model
      await db.delete(schema.aiGeneratedContent)
        .where(eq(schema.aiGeneratedContent.type, 'recommendations_summary'));
      
      res.json({ success: true, message: 'AI cache cleared successfully' });
    } catch (error) {
      console.error('Failed to clear AI cache:', error);
      res.status(500).json({ error: "Failed to clear AI cache" });
    }
  });
  
  // Get AI usage statistics for admin dashboard

  app.get("/api/admin/ai/usage", ensureAdminOrModeler, async (req, res) => {
    try {
      const logs = await storage.getAiUsageLogs();
      
      // Calculate statistics
      const totalRequests = logs.length;
      const totalEstimatedCost = logs.reduce((sum, log) => sum + (log.estimatedCost || 0), 0);
      const requestsByOperation = logs.reduce((acc, log) => {
        acc[log.operation] = (acc[log.operation] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);
      
      // Get usage over time (last 30 days)
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      
      const recentLogs = logs.filter(log => log.createdAt > thirtyDaysAgo);
      const dailyUsage = recentLogs.reduce((acc, log) => {
        const date = log.createdAt.toISOString().split('T')[0];
        acc[date] = (acc[date] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

      res.json({
        totalRequests,
        totalEstimatedCost: totalEstimatedCost / 100, // Convert cents to dollars
        requestsByOperation,
        dailyUsage,
        recentLogs: logs.slice(0, 20) // Last 20 logs
      });
    } catch (error) {
      console.error('Failed to fetch AI usage:', error);
      res.status(500).json({ error: "Failed to fetch AI usage statistics" });
    }
  });

  // Generate AI insights for a set of filtered assessments
  app.post("/api/admin/ai/generate-insights", ensureAdminOrModeler, async (req, res) => {
    try {
      const { assessmentIds } = req.body;
      const insights = await generateAssessmentInsights({ assessmentIds, userId: req.user!.id });
      res.json(insights);
    } catch (error) {
      sendServiceError(res, error, "Failed to generate assessment insights");
    }
  });

  app.get("/api/ai/providers", ensureAdmin, async (req, res) => {
    try {
      const providers = providerRegistry.getAllProvidersInfo();
      const active = await providerRegistry.getActiveConfig();
      res.json({ providers, active });
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch AI providers" });
    }
  });

  // Import/Export routes (simplified CSV format)

  // Generate the AI portfolio narrative for an Insights view
  app.post("/api/ai/generate-portfolio-narrative", ensureAuthenticated, async (req, res) => {
    try {
      const { scope, models, crossModelDimensions, cohortSize, userContext } = req.body || {};
      if (scope !== 'user' && scope !== 'tenant') {
        return res.status(400).json({ error: 'scope must be "user" or "tenant"' });
      }
      if (!Array.isArray(models)) {
        return res.status(400).json({ error: 'models must be an array' });
      }
      if (!Array.isArray(crossModelDimensions)) {
        return res.status(400).json({ error: 'crossModelDimensions must be an array' });
      }

      if (scope === 'tenant' && !(req.user!.role === 'global_admin' || req.user!.role === 'tenant_admin')) {
        return res.status(403).json({ error: 'Tenant admin access required for tenant narrative' });
      }

      const narrative = await aiService.generatePortfolioNarrative(
        scope,
        {
          models: models.map((m: any) => ({
            modelName: String(m.modelName ?? ''),
            modelClass: String(m.modelClass ?? 'organizational'),
            latestScorePercent: Number(m.latestScorePercent ?? 0),
            assessmentCount: Number(m.assessmentCount ?? 0),
            trendDirection: (m.trendDirection ?? 'flat') as 'up' | 'down' | 'flat' | 'single',
            trendDelta: Number(m.trendDelta ?? 0),
          })),
          crossModelDimensions: crossModelDimensions.map((d: any) => ({
            label: String(d.label ?? ''),
            averagePercent: Number(d.averagePercent ?? 0),
            modelCount: Number(d.modelCount ?? 0),
          })),
          cohortSize: typeof cohortSize === 'number' ? cohortSize : undefined,
        },
        userContext,
      );

      try {
        await storage.createAiUsageLog({
          userId: req.user!.id,
          modelName: (await providerRegistry.getActiveConfig()).modelId || 'unknown',
          operation: 'generate-portfolio-narrative',
          estimatedCost: 3,
        });
      } catch {
        // non-critical
      }

      res.json({ narrative });
    } catch (error) {
      console.error('Failed to generate portfolio narrative:', error);
      res.status(500).json({ error: 'Failed to generate portfolio narrative' });
    }
  });
}
