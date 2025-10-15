import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { db } from "./db";
import { eq } from "drizzle-orm";
import * as schema from "@shared/schema";
import { insertAssessmentSchema, insertAssessmentResponseSchema, insertResultSchema, insertModelSchema, insertDimensionSchema, insertQuestionSchema, insertAnswerSchema, Answer } from "@shared/schema";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { setupAuth, ensureAuthenticated, ensureAdmin } from "./auth";
import { ObjectStorageService, ObjectNotFoundError } from "./objectStorage";
import { z } from "zod";
import { scrypt, randomBytes } from "crypto";
import { promisify } from "util";

const scryptAsync = promisify(scrypt);

async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const buf = (await scryptAsync(password, salt, 64)) as Buffer;
  return `${buf.toString("hex")}.${salt}`;
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export async function registerRoutes(app: Express): Promise<Server> {
  // Set up authentication routes
  setupAuth(app);

  // Get current user
  app.get('/api/user', (req, res) => {
    if (!req.user) {
      return res.status(401).json({ error: "Not authenticated" });
    }
    // Remove password from response
    const { password, ...safeUser } = req.user;
    res.json(safeUser);
  });

  // Update current user's profile
  app.put('/api/profile', ensureAuthenticated, async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      
      // Validate all required profile fields
      const validationResult = schema.updateProfileSchema.safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({ 
          error: "Validation failed", 
          details: validationResult.error.issues.map(i => i.message).join(", ")
        });
      }
      
      const updateData = validationResult.data;
      
      const user = await storage.updateUser(req.user.id, updateData);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
      
      // Remove password from response
      const { password, ...safeUser } = user;
      res.json(safeUser);
    } catch (error) {
      res.status(400).json({ error: "Failed to update profile" });
    }
  });

  // User management routes (admin only)
  app.get('/api/users', ensureAdmin, async (req, res) => {
    try {
      const users = await storage.getAllUsers();
      // Remove password from response
      const safeUsers = users.map(({ password, ...user }) => user);
      res.json(safeUsers);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch users" });
    }
  });

  app.put('/api/users/:id', ensureAdmin, async (req, res) => {
    try {
      const { id } = req.params;
      const { password, ...updateData } = req.body; // Don't allow password update through this route
      const user = await storage.updateUser(id, updateData);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
      // Remove password from response
      const { password: _, ...safeUser } = user;
      res.json(safeUser);
    } catch (error) {
      res.status(400).json({ error: "Failed to update user" });
    }
  });

  app.delete('/api/users/:id', ensureAdmin, async (req, res) => {
    try {
      const { id } = req.params;
      // Prevent deleting yourself
      if (req.user?.id === id) {
        return res.status(400).json({ error: "Cannot delete your own account" });
      }
      await storage.deleteUser(id);
      res.json({ success: true });
    } catch (error) {
      res.status(400).json({ error: "Failed to delete user" });
    }
  });

  // Answer routes
  app.get('/api/answers/:questionId', async (req, res) => {
    try {
      const { questionId } = req.params;
      const answers = await storage.getAnswersByQuestionId(questionId);
      res.json(answers);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch answers" });
    }
  });

  app.post('/api/answers', ensureAdmin, async (req, res) => {
    try {
      const insertAnswerSchema = schema.insertAnswerSchema;
      const parsed = insertAnswerSchema.parse(req.body);
      const answer = await storage.createAnswer(parsed);
      res.json(answer);
    } catch (error) {
      res.status(400).json({ error: "Failed to create answer" });
    }
  });

  app.put('/api/answers/:id', ensureAdmin, async (req, res) => {
    try {
      const { id } = req.params;
      const answer = await storage.updateAnswer(id, req.body);
      res.json(answer);
    } catch (error) {
      res.status(400).json({ error: "Failed to update answer" });
    }
  });

  app.delete('/api/answers/:id', ensureAdmin, async (req, res) => {
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
      
      // Non-admin users can only access questions for published models
      const model = await storage.getModel(modelId);
      if (!model) {
        return res.status(404).json({ error: "Model not found" });
      }
      if ((!req.isAuthenticated() || req.user?.role !== 'admin') && model.status !== 'published') {
        return res.status(404).json({ error: "Model not found" });
      }
      
      const questions = await storage.getQuestionsByModelId(modelId);
      res.json(questions);
    } catch (error) {
      console.error('Error fetching questions:', error);
      res.status(500).json({ error: "Failed to fetch questions" });
    }
  });

  app.post("/api/questions", ensureAdmin, async (req, res) => {
    try {
      // Get existing questions to determine the order
      const existingQuestions = await storage.getQuestionsByModelId(req.body.modelId);
      const maxOrder = existingQuestions.reduce((max, q) => Math.max(max, q.order || 0), 0);
      
      // Add order to the question data
      const questionData = {
        ...req.body,
        order: maxOrder + 1,
      };
      
      const validatedData = insertQuestionSchema.parse(questionData);
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
    } catch (error) {
      console.error('Error creating question:', error);
      res.status(400).json({ error: "Invalid question data" });
    }
  });

  app.put("/api/questions/:id", ensureAdmin, async (req, res) => {
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

  app.delete("/api/questions/:id", ensureAdmin, async (req, res) => {
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
      let status = req.query.status as string | undefined;
      
      // Non-admin users can only see published models
      if (!req.isAuthenticated() || req.user?.role !== 'admin') {
        status = 'published';
      }
      
      const models = await storage.getAllModels(status);
      res.json(models);
    } catch (error) {
      console.error("Error fetching models:", error);
      res.status(500).json({ error: "Failed to fetch models" });
    }
  });

  app.post("/api/models", ensureAdmin, async (req, res) => {
    try {
      const validatedData = insertModelSchema.parse(req.body);
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

  app.put("/api/models/:id", ensureAdmin, async (req, res) => {
    try {
      const model = await storage.updateModel(req.params.id, req.body);
      if (!model) {
        return res.status(404).json({ error: "Model not found" });
      }
      res.json(model);
    } catch (error) {
      res.status(400).json({ error: "Failed to update model" });
    }
  });

  app.put("/api/models/:id/maturity-scale", ensureAdmin, async (req, res) => {
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

  app.put("/api/models/:id/general-resources", ensureAdmin, async (req, res) => {
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

  app.delete("/api/models/:id", ensureAdmin, async (req, res) => {
    try {
      await storage.deleteModel(req.params.id);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to delete model" });
    }
  });

  // Object Storage routes for model images
  app.post("/api/objects/upload", ensureAdmin, async (req, res) => {
    try {
      const objectStorageService = new ObjectStorageService();
      const uploadURL = await objectStorageService.getObjectEntityUploadURL();
      res.json({ uploadURL });
    } catch (error) {
      console.error("Error getting upload URL:", error);
      res.status(500).json({ error: "Failed to get upload URL" });
    }
  });

  app.put("/api/models/:id/image", ensureAdmin, async (req, res) => {
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

      // Non-admin users can only access published models
      if ((!req.isAuthenticated() || req.user?.role !== 'admin') && model.status !== 'published') {
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

      // Non-admin users can only access published models
      if ((!req.isAuthenticated() || req.user?.role !== 'admin') && model.status !== 'published') {
        return res.status(404).json({ error: "Model not found" });
      }

      const dimensions = await storage.getDimensionsByModelId(model.id);
      res.json({ ...model, dimensions });
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch model" });
    }
  });

  // Dimension routes
  app.get("/api/dimensions/:modelId", async (req, res) => {
    try {
      // Non-admin users can only access dimensions for published models
      const model = await storage.getModel(req.params.modelId);
      if (!model) {
        return res.status(404).json({ error: "Model not found" });
      }
      if ((!req.isAuthenticated() || req.user?.role !== 'admin') && model.status !== 'published') {
        return res.status(404).json({ error: "Model not found" });
      }
      
      const dimensions = await storage.getDimensionsByModelId(req.params.modelId);
      res.json(dimensions);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch dimensions" });
    }
  });

  app.post("/api/dimensions", ensureAdmin, async (req, res) => {
    try {
      const validatedData = insertDimensionSchema.parse(req.body);
      const dimension = await storage.createDimension(validatedData);
      res.json(dimension);
    } catch (error) {
      console.error('Error creating dimension:', error);
      res.status(400).json({ error: "Invalid dimension data" });
    }
  });

  app.put("/api/dimensions/:id", ensureAdmin, async (req, res) => {
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

  app.delete("/api/dimensions/:id", ensureAdmin, async (req, res) => {
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

      // Non-admin users can only access questions for published models
      if ((!req.isAuthenticated() || req.user?.role !== 'admin') && model.status !== 'published') {
        return res.status(404).json({ error: "Model not found" });
      }

      const questions = await storage.getQuestionsByModelId(model.id);
      const questionsWithAnswers = await Promise.all(
        questions.map(async (question) => {
          const answers = await storage.getAnswersByQuestionId(question.id);
          return { ...question, answers };
        })
      );

      res.json(questionsWithAnswers);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch questions" });
    }
  });

  // Assessment routes
  app.post("/api/assessments", async (req, res) => {
    try {
      const validatedData = insertAssessmentSchema.parse(req.body);
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

  // Get all assessments (admin only)
  app.get("/api/admin/assessments", ensureAdmin, async (req, res) => {
    try {
      // Fetch all assessments from storage
      const allAssessments = await db.select().from(schema.assessments);
      res.json(allAssessments);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch all assessments" });
    }
  });

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
      const assessment = await storage.getAssessment(req.params.id);
      if (!assessment) {
        return res.status(404).json({ error: "Assessment not found" });
      }

      // Get all responses for this assessment
      const responses = await storage.getAssessmentResponses(req.params.id);
      
      // Guard against empty responses
      if (responses.length === 0) {
        return res.status(400).json({ error: "No responses found for this assessment" });
      }

      // Get model and dimensions
      const model = await storage.getModel(assessment.modelId);
      if (!model) {
        return res.status(404).json({ error: "Model not found" });
      }

      const dimensions = await storage.getDimensionsByModelId(model.id);
      const questions = await storage.getQuestionsByModelId(model.id);
      
      // Calculate scores
      let totalScore = 0;
      const dimensionScores: Record<string, number[]> = {};
      let questionCount = 0;

      for (const response of responses) {
        const question = questions.find(q => q.id === response.questionId);
        if (!question) continue;

        let score = 0;
        
        if (question.type === 'numeric' && response.numericValue !== undefined && response.numericValue !== null) {
          // For numeric questions, scale the value to 100-500 range
          const minValue = question.minValue || 0;
          const maxValue = question.maxValue || 100;
          const numericValue = response.numericValue;
          
          // Scale the numeric value to 100-500 range
          // Formula: ((value - min) / (max - min)) * 400 + 100
          const normalizedValue = (numericValue - minValue) / (maxValue - minValue);
          score = Math.round(normalizedValue * 400 + 100);
          
          // Ensure score is within bounds
          score = Math.max(100, Math.min(500, score));
        } else if (question.type === 'multi_select') {
          // For multi-select questions, proportional scoring based on selections
          const answers = await storage.getAnswersByQuestionId(question.id);
          const totalOptions = answers.length;
          const selectedCount = response.answerIds ? response.answerIds.length : 0;
          
          // Guard against division by zero
          if (totalOptions > 0) {
            // Formula: (selectedCount / totalOptions) * 400 + 100
            // 0 selections = 100, max selections = 500
            score = Math.round((selectedCount / totalOptions) * 400 + 100);
            score = Math.max(100, Math.min(500, score));
          } else {
            score = 100; // Default if no options exist
          }
        } else {
          // For multiple choice questions, use the answer's score
          const answers = await storage.getAnswersByQuestionId(question.id);
          const answer = answers.find(a => a.id === response.answerId);
          if (!answer) continue;
          score = answer.score;
        }

        totalScore += score;
        questionCount++;

        if (question.dimensionId) {
          const dimension = dimensions.find(d => d.id === question.dimensionId);
          if (dimension) {
            if (!dimensionScores[dimension.key]) {
              dimensionScores[dimension.key] = [];
            }
            dimensionScores[dimension.key].push(score);
          }
        }
      }

      // Calculate averages per dimension
      const dimensionAverages: Record<string, number> = {};
      for (const [key, scores] of Object.entries(dimensionScores)) {
        dimensionAverages[key] = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
      }

      // Calculate overall score
      const overallScore = questionCount > 0 ? Math.round(totalScore / questionCount) : 0;

      // Determine label based on score using model's maturity scale
      // Default scale if not configured
      const defaultScale = [
        { id: '1', name: 'Nascent', description: 'Beginning AI journey', minScore: 100, maxScore: 199 },
        { id: '2', name: 'Experimental', description: 'Experimenting with AI', minScore: 200, maxScore: 299 },
        { id: '3', name: 'Operational', description: 'Operational AI processes', minScore: 300, maxScore: 399 },
        { id: '4', name: 'Strategic', description: 'Strategic AI foundations', minScore: 400, maxScore: 449 },
        { id: '5', name: 'Transformational', description: 'Leading AI transformation', minScore: 450, maxScore: 500 },
      ];
      
      const maturityScale = model.maturityScale || defaultScale;
      let label = maturityScale[0]?.name || "Nascent";
      
      // Find the appropriate maturity level based on score
      for (const level of maturityScale) {
        if (overallScore >= level.minScore && overallScore <= level.maxScore) {
          label = level.name;
          break;
        }
      }

      // Create result
      const result = await storage.createResult({
        assessmentId: req.params.id,
        overallScore,
        label,
        dimensionScores: dimensionAverages,
      });

      // Update assessment status
      await storage.updateAssessment(req.params.id, {
        status: "completed",
      } as any);

      res.json(result);
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Failed to calculate results" });
    }
  });

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
      const { aiService } = await import('./services/ai-service.js');
      const crypto = await import('crypto');
      
      // Get assessment details
      const assessment = await storage.getAssessment(req.params.id);
      if (!assessment || assessment.status !== 'completed') {
        return res.status(404).json({ error: "Completed assessment not found" });
      }

      // Get related data
      const [model, dimensions, result, user] = await Promise.all([
        storage.getModel(assessment.modelId),
        storage.getDimensionsByModelId(assessment.modelId),
        storage.getResult(req.params.id),
        assessment.userId ? storage.getUser(assessment.userId) : null
      ]);

      if (!model || !result) {
        return res.status(404).json({ error: "Required data not found" });
      }

      // Build context for recommendations
      const context = {
        assessment,
        model,
        dimensions,
        user: user || undefined,  // Convert null to undefined for type compatibility
        scores: result.dimensionScores as Record<string, number>
      };

      // Create cache key from context
      const contextString = JSON.stringify({
        modelId: model.id,
        scores: result.dimensionScores,
        industry: user?.industry,
        companySize: user?.companySize
      });
      const contextHash = crypto.createHash('sha256').update(contextString).digest('hex');

      // Check cache first
      const cached = await storage.getAiGeneratedContent('recommendation', contextHash);
      if (cached && new Date(cached.expiresAt) > new Date()) {
        return res.json(cached.content);
      }

      // Generate new recommendations
      const recommendations = await aiService.generateRecommendations(context);

      // Cache the recommendations (7 days)
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 7);
      
      await storage.createAiGeneratedContent({
        type: 'recommendation',
        contextHash,
        content: recommendations as any,
        metadata: { assessmentId: assessment.id, modelId: model.id },
        expiresAt
      });

      // Log AI usage if user is authenticated
      if (assessment.userId) {
        await storage.createAiUsageLog({
          userId: assessment.userId,
          modelName: 'gpt-5-mini-2025-08-07',
          operation: 'recommendation',
          estimatedCost: 5 // Rough estimate: 5 cents per recommendation generation
        });
      }

      res.json(recommendations);
    } catch (error) {
      console.error('Failed to generate recommendations:', error);
      res.status(500).json({ error: "Failed to generate recommendations" });
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

  // Benchmark routes
  app.get("/api/benchmarks/:modelId", async (req, res) => {
    try {
      // Non-admin users can only access benchmarks for published models
      const model = await storage.getModel(req.params.modelId);
      if (!model) {
        return res.status(404).json({ error: "Model not found" });
      }
      if ((!req.isAuthenticated() || req.user?.role !== 'admin') && model.status !== 'published') {
        return res.status(404).json({ error: "Model not found" });
      }
      
      const { industry, country } = req.query;
      const benchmark = await storage.getBenchmark(
        req.params.modelId,
        industry as string | undefined,
        country as string | undefined
      );
      
      if (!benchmark) {
        return res.status(404).json({ error: "Benchmark not found" });
      }
      
      res.json(benchmark);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch benchmark" });
    }
  });

  // Admin routes for model management
  app.post("/api/admin/models/seed/:modelSlug", ensureAdmin, async (req, res) => {
    try {
      const seedDataPath = join(__dirname, `seed-data/${req.params.modelSlug}.json`);
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
          await storage.createBenchmark({
            modelId: model.id,
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

  app.get("/api/admin/models", ensureAdmin, async (req, res) => {
    try {
      const models = await storage.getAllModels();
      const modelsWithStats = await Promise.all(
        models.map(async (model) => {
          const dimensions = await storage.getDimensionsByModelId(model.id);
          const questions = await storage.getQuestionsByModelId(model.id);
          return {
            ...model,
            dimensionCount: dimensions.length,
            questionCount: questions.length,
          };
        })
      );
      res.json(modelsWithStats);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch models" });
    }
  });

  app.patch("/api/admin/models/:id", ensureAdmin, async (req, res) => {
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

  app.delete("/api/admin/models/:id", ensureAdmin, async (req, res) => {
    try {
      await storage.deleteModel(req.params.id);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to delete model" });
    }
  });

  // Settings routes
  app.get("/api/settings/:key", async (req, res) => {
    try {
      const setting = await storage.getSetting(req.params.key);
      if (!setting) {
        return res.status(404).json({ error: "Setting not found" });
      }
      res.json(setting);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch setting" });
    }
  });

  app.get("/api/settings", async (req, res) => {
    try {
      const settings = await storage.getAllSettings();
      res.json(settings);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch settings" });
    }
  });

  app.post("/api/settings/:key", ensureAdmin, async (req, res) => {
    try {
      const setting = await storage.setSetting(req.params.key, req.body.value);
      res.json(setting);
    } catch (error) {
      res.status(500).json({ error: "Failed to update setting" });
    }
  });

  // Import/Export routes (simplified CSV format)
  app.get("/api/models/:id/export", async (req, res) => {
    try {
      const model = await storage.getModel(req.params.id);
      if (!model) {
        return res.status(404).json({ error: "Model not found" });
      }

      // Non-admin users can only export published models
      if ((!req.isAuthenticated() || req.user?.role !== 'admin') && model.status !== 'published') {
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
      const { questionsToSimpleCSV } = await import('../client/src/utils/csvConverterSimple');
      const csvContent = questionsToSimpleCSV(questions, allAnswers);

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="${model.slug}-questions.csv"`);
      res.send(csvContent);
    } catch (error) {
      console.error('Export error:', error);
      res.status(500).json({ error: "Failed to export model" });
    }
  });

  app.post("/api/models/:id/import-questions", ensureAdmin, async (req, res) => {
    try {
      const modelId = req.params.id;
      const { csvContent, mode = 'add' } = req.body;
      
      // Check if model exists
      const model = await storage.getModel(modelId);
      if (!model) {
        return res.status(404).json({ error: "Model not found" });
      }
      
      // Import simplified CSV converter
      const { simpleCSVToQuestions } = await import('../client/src/utils/csvConverterSimple');
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

  // Export assessment results
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

  // Send PDF via email
  app.post('/api/send-pdf-email', ensureAuthenticated, async (req, res) => {
    try {
      // Validate payload with Zod
      const emailPayloadSchema = z.object({
        pdfBase64: z.string().min(1).max(10 * 1024 * 1024), // Max ~10MB base64
        fileName: z.string().min(1).max(255),
        recipientEmail: z.string().email(),
        recipientName: z.string().optional(),
        modelName: z.string().optional(),
      });

      const validationResult = emailPayloadSchema.safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({ 
          error: "Invalid payload", 
          details: validationResult.error.issues.map((i: any) => i.message).join(", ")
        });
      }

      const { pdfBase64, fileName, recipientEmail, recipientName, modelName } = validationResult.data;

      // Import SendGrid client
      const { getUncachableSendGridClient } = await import('./sendgrid.js');
      const { client: sgMail, fromEmail } = await getUncachableSendGridClient();

      const msg = {
        to: recipientEmail,
        from: fromEmail,
        subject: `Your ${modelName || 'Maturity Assessment'} Report`,
        text: `Dear ${recipientName || 'Valued User'},\n\nThank you for completing the ${modelName || 'maturity assessment'}. Please find your comprehensive assessment report attached.\n\nBest regards,\nThe Synozur Team`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #810FFB;">Your Assessment Report is Ready</h2>
            <p>Dear ${recipientName || 'Valued User'},</p>
            <p>Thank you for completing the <strong>${modelName || 'maturity assessment'}</strong>.</p>
            <p>Your comprehensive assessment report is attached to this email. This report includes:</p>
            <ul>
              <li>Overall maturity score and level</li>
              <li>Dimension-specific insights</li>
              <li>Personalized recommendations</li>
              <li>Improvement resources</li>
            </ul>
            <p>If you have any questions about your results, please don't hesitate to reach out.</p>
            <p style="margin-top: 30px;">Best regards,<br><strong>The Synozur Team</strong></p>
            <hr style="margin: 30px 0; border: none; border-top: 1px solid #eee;">
            <p style="font-size: 12px; color: #666;">
              Visit us at <a href="https://www.synozur.com" style="color: #810FFB;">www.synozur.com</a>
            </p>
          </div>
        `,
        attachments: [
          {
            content: pdfBase64,
            filename: fileName || 'assessment-report.pdf',
            type: 'application/pdf',
            disposition: 'attachment',
          },
        ],
      };

      await sgMail.send(msg);

      res.json({ success: true, message: 'Email sent successfully' });
    } catch (error) {
      console.error('Email sending error:', error);
      res.status(500).json({ 
        error: "Failed to send email", 
        details: error instanceof Error ? error.message : 'Unknown error' 
      });
    }
  });

  // Password reset request endpoint
  app.post('/api/password-reset/request', async (req, res) => {
    try {
      const requestSchema = z.object({
        email: z.string().email(),
      });

      const validationResult = requestSchema.safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({ 
          error: "Invalid email", 
          details: validationResult.error.issues.map((i: any) => i.message).join(", ")
        });
      }

      const { email } = validationResult.data;

      // Find user by email
      const users = await db.select().from(schema.users).where(eq(schema.users.email, email));
      
      if (users.length === 0) {
        // Don't reveal if email exists - return success anyway for security
        return res.json({ success: true, message: 'If an account with that email exists, a password reset link has been sent.' });
      }

      const user = users[0];

      // Create reset token (expires in 1 hour)
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000);
      const [resetToken] = await db.insert(schema.passwordResetTokens).values({
        userId: user.id,
        expiresAt,
        used: false,
      }).returning();

      // Send email with reset link (with defensive error handling)
      try {
        const { getUncachableSendGridClient } = await import('./sendgrid.js');
        const { client: sgMail, fromEmail } = await getUncachableSendGridClient();

        const resetUrl = `${req.protocol}://${req.get('host')}/reset-password?token=${resetToken.token}`;

        const msg = {
          to: email,
          from: fromEmail,
          subject: 'Reset Your Password - Synozur Maturity Modeler',
          text: `You requested a password reset. Click the link below to reset your password:\n\n${resetUrl}\n\nThis link will expire in 1 hour.\n\nIf you didn't request this, please ignore this email.`,
          html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
              <h2 style="color: #810FFB;">Reset Your Password</h2>
              <p>You requested a password reset for your Synozur Maturity Modeler account.</p>
              <p>Click the button below to reset your password:</p>
              <div style="margin: 30px 0;">
                <a href="${resetUrl}" style="background-color: #810FFB; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">Reset Password</a>
              </div>
              <p style="color: #666; font-size: 14px;">Or copy and paste this link into your browser:</p>
              <p style="color: #810FFB; word-break: break-all;">${resetUrl}</p>
              <p style="margin-top: 30px; color: #666;">This link will expire in <strong>1 hour</strong>.</p>
              <p style="color: #666;">If you didn't request this password reset, please ignore this email. Your password will remain unchanged.</p>
              <hr style="margin: 30px 0; border: none; border-top: 1px solid #eee;">
              <p style="font-size: 12px; color: #666;">
                Visit us at <a href="https://www.synozur.com" style="color: #810FFB;">www.synozur.com</a>
              </p>
            </div>
          `,
        };

        await sgMail.send(msg);
      } catch (emailError) {
        // Log email delivery failure but don't block the user
        console.error('Failed to send password reset email:', emailError);
        // Token is still created and valid - user can contact support if needed
      }

      // Always return success to avoid revealing if email exists
      res.json({ success: true, message: 'If an account with that email exists, a password reset link has been sent.' });
    } catch (error) {
      console.error('Password reset request error:', error);
      res.status(500).json({ 
        error: "Failed to process password reset request", 
        details: error instanceof Error ? error.message : 'Unknown error' 
      });
    }
  });

  // Password reset confirmation endpoint
  app.post('/api/password-reset/reset', async (req, res) => {
    try {
      const resetSchema = z.object({
        token: z.string().uuid(),
        newPassword: z.string().min(6, "Password must be at least 6 characters"),
      });

      const validationResult = resetSchema.safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({ 
          error: "Invalid request", 
          details: validationResult.error.issues.map((i: any) => i.message).join(", ")
        });
      }

      const { token, newPassword } = validationResult.data;

      // Find the reset token
      const tokens = await db.select().from(schema.passwordResetTokens).where(eq(schema.passwordResetTokens.token, token));
      
      if (tokens.length === 0) {
        return res.status(400).json({ error: "Invalid or expired reset token" });
      }

      const resetToken = tokens[0];

      // Check if token is expired or used
      if (resetToken.used) {
        return res.status(400).json({ error: "This reset token has already been used" });
      }

      if (new Date() > resetToken.expiresAt) {
        return res.status(400).json({ error: "Reset token has expired. Please request a new one." });
      }

      // Hash the new password
      const hashedPassword = await hashPassword(newPassword);

      // Update user password
      await db.update(schema.users)
        .set({ password: hashedPassword })
        .where(eq(schema.users.id, resetToken.userId));

      // Mark token as used
      await db.update(schema.passwordResetTokens)
        .set({ used: true })
        .where(eq(schema.passwordResetTokens.token, token));

      res.json({ success: true, message: 'Password reset successfully' });
    } catch (error) {
      console.error('Password reset error:', error);
      res.status(500).json({ 
        error: "Failed to reset password", 
        details: error instanceof Error ? error.message : 'Unknown error' 
      });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
