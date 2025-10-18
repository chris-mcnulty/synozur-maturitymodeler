import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { db } from "./db";
import { eq, inArray, desc } from "drizzle-orm";
import * as schema from "@shared/schema";
import { insertAssessmentSchema, insertAssessmentResponseSchema, insertResultSchema, insertModelSchema, insertDimensionSchema, insertQuestionSchema, insertAnswerSchema, Answer } from "@shared/schema";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { setupAuth, ensureAuthenticated, ensureAdmin, ensureAdminOrModeler } from "./auth";
import { ObjectStorageService, ObjectNotFoundError } from "./objectStorage";
import { aiService } from "./services/ai-service";
import { validateImportData, executeImport, type ImportExportData } from "./services/import-service";
import { z } from "zod";
import { scrypt, randomBytes, createHash } from "crypto";
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

  // Serve email header image
  app.get('/email-header.jpg', (req, res) => {
    const imagePath = join(__dirname, '../attached_assets/SA_EmailHeader_short_1760554032055.jpg');
    res.sendFile(imagePath);
  });

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

  // Admin manual email verification
  app.put('/api/admin/users/:id/verify-email', ensureAdmin, async (req, res) => {
    try {
      const { id } = req.params;
      const user = await storage.updateUser(id, { 
        emailVerified: true,
        verificationToken: null,
        verificationTokenExpiry: null,
      });
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
      // Remove password from response
      const { password: _, ...safeUser } = user;
      res.json({ success: true, user: safeUser });
    } catch (error) {
      console.error('Manual verification error:', error);
      res.status(400).json({ error: "Failed to verify user email" });
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

  app.post("/api/questions", ensureAdminOrModeler, async (req, res) => {
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

  app.post("/api/models", ensureAdminOrModeler, async (req, res) => {
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

  app.put("/api/models/:id", ensureAdminOrModeler, async (req, res) => {
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

  // Get all assessments with user data (admin only)
  app.get("/api/admin/assessments", ensureAdmin, async (req, res) => {
    try {
      // Fetch all assessments
      const allAssessments = await db.select().from(schema.assessments);
      
      // Fetch user data for each assessment
      const assessmentsWithUsers = await Promise.all(
        allAssessments.map(async (assessment) => {
          if (!assessment.userId) {
            return {
              ...assessment,
              user: null,
            };
          }
          
          const userResult = await db
            .select({
              id: schema.users.id,
              name: schema.users.name,
              company: schema.users.company,
            })
            .from(schema.users)
            .where(eq(schema.users.id, assessment.userId))
            .limit(1);
          
          return {
            ...assessment,
            user: userResult[0] || null,
          };
        })
      );
      
      res.json(assessmentsWithUsers);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch all assessments" });
    }
  });

  // Get all content data for a model (for content management)
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
      
      // Get maturity levels (simple structure for now)
      const maturityLevels = [
        { id: "1", scoreMin: 100, scoreMax: 200, name: "Initial", interpretation: null },
        { id: "2", scoreMin: 201, scoreMax: 300, name: "Developing", interpretation: null },
        { id: "3", scoreMin: 301, scoreMax: 400, name: "Defined", interpretation: null },
        { id: "4", scoreMin: 401, scoreMax: 450, name: "Managed", interpretation: null },
        { id: "5", scoreMin: 451, scoreMax: 500, name: "Optimizing", interpretation: null },
      ];

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
  app.post("/api/admin/models/seed/:modelSlug", ensureAdminOrModeler, async (req, res) => {
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

  app.get("/api/admin/models", ensureAdminOrModeler, async (req, res) => {
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

  // AI-assisted content generation endpoints for admin
  
  // Generate score interpretations for a model
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
        modelName: 'gpt-5-mini-2025-08-07',
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
        modelName: 'gpt-5-mini-2025-08-07',
        operation: 'generate-resources',
        estimatedCost: 4
      });

      res.json({
        success: true,
        message: "Resources generated and sent to review queue",
        reviewId: review.id
      });
    } catch (error) {
      console.error('Failed to generate resources:', error);
      res.status(500).json({ error: "Failed to generate resources" });
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
        modelName: 'gpt-5-mini',
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
        modelName: 'gpt-5-mini',
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
      
      // Validate input
      if (!questionId || !questionText || !Array.isArray(answers) || answers.length === 0) {
        return res.status(400).json({ error: "Question ID, question text, and answers array are required" });
      }

      const reviewIds: string[] = [];

      // Generate rewrites for each answer
      for (const answer of answers) {
        if (!answer.text || answer.score === undefined) {
          continue;
        }

        try {
          const rewrittenAnswer = await aiService.rewriteAnswer(
            questionText,
            answer.text,
            answer.score,
            modelContext
          );

          // Store in review queue
          const review = await storage.createAiContentReview({
            type: 'answer-rewrite',
            contentType: 'answer_rewrite',
            targetId: answer.id,
            generatedContent: { rewrittenAnswer } as any,
            metadata: { questionText, answerText: answer.text, answerScore: answer.score, modelContext },
            status: 'pending',
            createdBy: req.user!.id
          });

          reviewIds.push(review.id);

          // Log usage for each rewrite
          await storage.createAiUsageLog({
            userId: req.user!.id,
            modelName: 'gpt-5-mini',
            operation: 'rewrite-answer',
            estimatedCost: 1
          });
        } catch (answerError) {
          console.error(`Failed to rewrite answer ${answer.id}:`, answerError);
          // Continue with other answers even if one fails
        }
      }

      res.json({
        success: true,
        message: `${reviewIds.length} answer rewrites generated and sent to review queue`,
        reviewIds,
        count: reviewIds.length
      });
    } catch (error) {
      console.error('Failed to bulk rewrite answers:', error);
      res.status(500).json({ error: "Failed to bulk rewrite answers" });
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
      
      const review = await storage.getAiReviewById(id);
      if (!review) {
        return res.status(404).json({ error: "Review not found" });
      }
      
      if (review.status !== 'pending') {
        return res.status(400).json({ error: "Review has already been processed" });
      }

      // Use edited content if provided, otherwise use original generated content
      const contentToApprove = editedContent || review.generatedContent;

      // If selectedItemIds are provided, filter content to only selected items
      let partialContent = contentToApprove;
      
      if (selectedItemIds && selectedItemIds.length > 0) {
        // Apply partial approval based on content type
        switch (review.contentType) {
          case 'dimension_resources':
            // Filter resources to only selected ones
            const resourceIndices = selectedItemIds
              .filter((id: string) => id.startsWith('resource-'))
              .map((id: string) => parseInt(id.replace('resource-', '')));
            
            if (contentToApprove.resources) {
              partialContent = {
                ...contentToApprove,
                resources: contentToApprove.resources.filter((_: any, idx: number) => 
                  resourceIndices.includes(idx)
                )
              };
            }
            break;
            
          case 'maturity_level_interpretation':
            partialContent = { ...contentToApprove };
            
            // Filter characteristics if not all are selected
            const charIndices = selectedItemIds
              .filter((id: string) => id.startsWith('characteristic-'))
              .map((id: string) => parseInt(id.replace('characteristic-', '')));
            
            if (charIndices.length > 0 && contentToApprove.characteristics) {
              partialContent = {
                ...partialContent,
                characteristics: contentToApprove.characteristics.filter((_: string, idx: number) =>
                  charIndices.includes(idx)
                )
              };
            }
            
            // Remove interpretation if not selected
            if (!selectedItemIds.includes('interpretation')) {
              delete (partialContent as any).interpretation;
              delete (partialContent as any).title;
            }
            break;
            
          case 'answer_improvement':
          case 'answer_rewrite':
            // Only approve if main content is selected
            if (!selectedItemIds.includes('main-content')) {
              return res.status(400).json({ error: "No content selected for approval" });
            }
            break;
        }
      }

      // Store the filtered content in review before approving
      review.generatedContent = partialContent;

      // Approve the review
      const approved = await storage.approveAiReview(id, req.user!.id);
      
      // Apply the approved content to the actual database tables
      try {
        switch (review.contentType) {
          case 'answer_rewrite':
            if (review.targetId && partialContent.rewrittenAnswer) {
              await db.update(schema.answers)
                .set({ text: partialContent.rewrittenAnswer })
                .where(eq(schema.answers.id, review.targetId));
            }
            break;
            
          case 'answer_improvement':
            if (review.targetId && partialContent.improvementStatement) {
              await db.update(schema.answers)
                .set({ improvementStatement: partialContent.improvementStatement })
                .where(eq(schema.answers.id, review.targetId));
            }
            break;
            
          // TODO: Implement other content types when needed
          // case 'maturity_level_interpretation':
          // case 'dimension_resources':
        }
      } catch (applyError) {
        console.error('Failed to apply approved content:', applyError);
        // Continue anyway - review is approved even if apply fails
      }
      
      res.json({ 
        success: true, 
        message: selectedItemIds ? "Selected content approved and applied successfully" : "Content approved and applied successfully",
        review: approved 
      });
    } catch (error) {
      console.error('Failed to approve review:', error);
      res.status(500).json({ error: "Failed to approve review" });
    }
  });

  // Reject an AI content review (supports partial rejections)
  app.post("/api/admin/ai/reject-review/:id", ensureAdminOrModeler, async (req, res) => {
    try {
      const { id } = req.params;
      const { reason, selectedItemIds } = req.body;
      
      const review = await storage.getAiReviewById(id);
      if (!review) {
        return res.status(404).json({ error: "Review not found" });
      }
      
      if (review.status !== 'pending') {
        return res.status(400).json({ error: "Review has already been processed" });
      }

      // If selectedItemIds are provided, we're doing a partial rejection
      if (selectedItemIds && selectedItemIds.length > 0) {
        // For partial rejections, we need to keep the review pending
        // and only remove the rejected items from the generated content
        let remainingContent = { ...(review.generatedContent || {}) };
        
        switch (review.contentType) {
          case 'dimension_resources':
            // Remove rejected resources
            const rejectedResourceIndices = selectedItemIds
              .filter((id: string) => id.startsWith('resource-'))
              .map((id: string) => parseInt(id.replace('resource-', '')));
            
            if (remainingContent.resources) {
              remainingContent = {
                ...remainingContent,
                resources: remainingContent.resources.filter((_: any, idx: number) => 
                  !rejectedResourceIndices.includes(idx)
                )
              };
            }
            break;
            
          case 'maturity_level_interpretation':
            // Remove rejected characteristics
            const rejectedCharIndices = selectedItemIds
              .filter((id: string) => id.startsWith('characteristic-'))
              .map((id: string) => parseInt(id.replace('characteristic-', '')));
            
            if (rejectedCharIndices.length > 0 && remainingContent.characteristics) {
              remainingContent = {
                ...remainingContent,
                characteristics: remainingContent.characteristics.filter((_: string, idx: number) =>
                  !rejectedCharIndices.includes(idx)
                )
              };
            }
            
            // Remove interpretation if rejected
            if (selectedItemIds.includes('interpretation')) {
              delete (remainingContent as any).interpretation;
              delete (remainingContent as any).title;
            }
            break;
            
          case 'answer_improvement':
          case 'answer_rewrite':
            // If main content is rejected, reject the entire review
            if (selectedItemIds.includes('main-content')) {
              const rejected = await storage.rejectAiReview(id, req.user!.id, reason);
              return res.json({
                success: true,
                message: "Content rejected successfully",
                review: rejected
              });
            }
            break;
        }
        
        // Update the review with remaining content
        // Note: We keep it pending so remaining items can still be approved
        review.generatedContent = remainingContent;
        
        // Check if any content remains
        const hasRemainingContent = 
          (review.contentType === 'dimension_resources' && remainingContent.resources?.length > 0) ||
          (review.contentType === 'maturity_level_interpretation' && 
            (remainingContent.interpretation || remainingContent.characteristics?.length > 0)) ||
          (review.contentType === 'answer_improvement' && remainingContent.improvementStatement) ||
          (review.contentType === 'answer_rewrite' && remainingContent.rewrittenAnswer);
        
        if (!hasRemainingContent) {
          // No content remains, reject the entire review
          const rejected = await storage.rejectAiReview(id, req.user!.id, reason);
          return res.json({
            success: true,
            message: "All content rejected",
            review: rejected
          });
        }
        
        return res.json({
          success: true,
          message: "Selected items rejected, remaining items still pending",
          review
        });
      } else {
        // Full rejection
        const rejected = await storage.rejectAiReview(id, req.user!.id, reason);
        
        res.json({ 
          success: true, 
          message: "Content rejected successfully",
          review: rejected 
        });
      }
    } catch (error) {
      console.error('Failed to reject review:', error);
      res.status(500).json({ error: "Failed to reject review" });
    }
  });

  // Generate maturity summary using AI
  app.post("/api/ai/generate-maturity-summary", ensureAuthenticated, async (req, res) => {
    try {
      const { overallScore, dimensionScores, modelName, userContext } = req.body;
      
      // Validate input
      if (!overallScore || !dimensionScores || !modelName) {
        return res.status(400).json({ error: "Missing required fields" });
      }

      // Generate cache key
      const contextHash = createHash('md5')
        .update(JSON.stringify({ overallScore, dimensionScores, modelName, userContext }))
        .digest('hex');

      // Check cache first
      const cached = await storage.getAiGeneratedContent('maturity-summary', contextHash);
      if (cached && cached.expiresAt && cached.expiresAt > new Date()) {
        return res.json({ summary: cached.content });
      }

      // Generate using AI
      const summary = await aiService.generateMaturitySummary(
        overallScore,
        dimensionScores,
        modelName,
        userContext
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

      // Log usage
      await storage.createAiUsageLog({
        userId: req.user!.id,
        modelName: 'gpt-5-mini',
        operation: 'generate-maturity-summary',
        estimatedCost: 3
      });

      res.json({ summary });
    } catch (error) {
      console.error('Failed to generate maturity summary:', error);
      res.status(500).json({ error: "Failed to generate maturity summary" });
    }
  });

  // Generate recommendations summary using AI
  app.post("/api/ai/generate-recommendations-summary", ensureAuthenticated, async (req, res) => {
    try {
      const { recommendations, modelName, userContext } = req.body;
      
      // Validate input
      if (!recommendations || !modelName) {
        return res.status(400).json({ error: "Missing required fields" });
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

      // Log usage
      await storage.createAiUsageLog({
        userId: req.user!.id,
        modelName: 'gpt-5-mini',
        operation: 'generate-recommendations-summary',
        estimatedCost: 2
      });

      res.json({ summary });
    } catch (error) {
      console.error('Failed to generate recommendations summary:', error);
      res.status(500).json({ error: "Failed to generate recommendations summary" });
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

      // Check if user's email is verified
      if (!req.user?.emailVerified) {
        return res.status(403).json({ 
          error: "Email not verified", 
          message: "Please verify your email address before downloading PDF reports. Check your inbox for a verification link or request a new one from your profile." 
        });
      }

      // Import SendGrid client
      const { getUncachableSendGridClient } = await import('./sendgrid.js');
      const { client: sgMail, fromEmail } = await getUncachableSendGridClient();

      // Generate dynamic email header URL
      const emailHeaderUrl = `${req.protocol}://${req.get('host')}/email-header.jpg`;

      const msg = {
        to: recipientEmail,
        from: fromEmail,
        subject: `Your ${modelName || 'Maturity Assessment'} Report`,
        text: `Dear ${recipientName || 'Valued User'},

Thank you for completing the ${modelName || 'assessment'}. Your comprehensive report is attached, including:

• Your overall maturity score and level
• Dimension-specific insights
• Personalized recommendations
• Resources to guide your next steps

If you have any questions, we're here to help you navigate your journey.

Best regards,
The Synozur Team`,
        html: `
          <!DOCTYPE html>
          <html>
          <head>
            <style>
              body { font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; }
              .container { max-width: 600px; margin: 0 auto; background: #ffffff; }
              .header-image { width: 100%; height: auto; display: block; }
              .content { padding: 40px 30px; background: #ffffff; }
              .footer { text-align: center; padding: 30px; background: #f9f9f9; color: #666; font-size: 14px; }
              ul { padding-left: 20px; }
              ul li { margin: 8px 0; }
            </style>
          </head>
          <body>
            <div class="container">
              <img src="${emailHeaderUrl}" alt="Synozur Alliance" class="header-image" />
              <div class="content">
                <h2 style="color: #810FFB; margin-top: 0;">Your Assessment Report is Ready</h2>
                <p>Dear ${recipientName || 'Valued User'},</p>
                <p>Thank you for completing the <strong>${modelName || 'assessment'}</strong>. Your comprehensive report is attached, including:</p>
                <ul>
                  <li>Your overall maturity score and level</li>
                  <li>Dimension-specific insights</li>
                  <li>Personalized recommendations</li>
                  <li>Resources to guide your next steps</li>
                </ul>
                <p>If you have any questions, we're here to help you navigate your journey.</p>
              </div>
              <div class="footer">
                <p><strong>Best regards,</strong><br>The Synozur Team</p>
                <p>© ${new Date().getFullYear()} The Synozur Alliance LLC</p>
              </div>
            </div>
          </body>
          </html>
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
        const emailHeaderUrl = `${req.protocol}://${req.get('host')}/email-header.jpg`;

        const msg = {
          to: email,
          from: fromEmail,
          subject: 'Reset Your Password – Synozur Maturity Modeler',
          text: `You requested a password reset for your Synozur Maturity Modeler account.

To continue your journey, click the link below to reset your password:

${resetUrl}

This link will expire in 1 hour.

If you didn't request this, please ignore this email—your password will remain unchanged.
— The Synozur Team`,
          html: `
            <!DOCTYPE html>
            <html>
            <head>
              <style>
                body { font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; }
                .container { max-width: 600px; margin: 0 auto; background: #ffffff; }
                .header-image { width: 100%; height: auto; display: block; }
                .content { padding: 40px 30px; background: #ffffff; }
                .button { display: inline-block; background: #810FFB; color: white !important; padding: 14px 28px; text-decoration: none; border-radius: 6px; font-weight: 600; margin: 25px 0; }
                .footer { text-align: center; padding: 30px; background: #f9f9f9; color: #666; font-size: 14px; }
                .link-text { color: #810FFB; word-break: break-all; }
              </style>
            </head>
            <body>
              <div class="container">
                <img src="${emailHeaderUrl}" alt="Synozur Alliance" class="header-image" />
                <div class="content">
                  <h2 style="color: #810FFB; margin-top: 0;">Reset Your Password</h2>
                  <p>You requested a password reset for your Synozur Maturity Modeler account.</p>
                  <p>To continue your journey, click the button below to reset your password:</p>
                  <p style="text-align: center;">
                    <a href="${resetUrl}" class="button">Reset Password</a>
                  </p>
                  <p style="font-size: 14px; color: #666;">
                    Or copy and paste this link into your browser:<br>
                    <span class="link-text">${resetUrl}</span>
                  </p>
                  <p style="font-size: 14px; color: #666;">This link will expire in <strong>1 hour</strong>.</p>
                  <p style="font-size: 14px; color: #666;">If you didn't request this password reset, please ignore this email—your password will remain unchanged.</p>
                </div>
                <div class="footer">
                  <p>— The Synozur Team</p>
                  <p>© ${new Date().getFullYear()} The Synozur Alliance LLC</p>
                </div>
              </div>
            </body>
            </html>
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

  // ===== IMPORT ENDPOINTS =====
  
  // Preview import data - validate and show question mappings
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

  // Export analytical data for a specific model (for external analysis tools)
  app.get("/api/admin/export/model/:modelSlug/analysis", ensureAdminOrModeler, async (req, res) => {
    try {
      const { modelSlug } = req.params;
      
      // Get model
      const modelResult = await db
        .select()
        .from(schema.models)
        .where(eq(schema.models.slug, modelSlug))
        .limit(1);
      
      const model = modelResult[0];
      if (!model) {
        return res.status(404).json({ error: "Model not found" });
      }
      
      // Get dimensions
      const dimensions = await db
        .select()
        .from(schema.dimensions)
        .where(eq(schema.dimensions.modelId, model.id))
        .orderBy(schema.dimensions.order);
      
      // Get questions
      const questions = await db
        .select()
        .from(schema.questions)
        .where(eq(schema.questions.modelId, model.id))
        .orderBy(schema.questions.order);
      
      // Get all answers for these questions
      const questionIds = questions.map(q => q.id);
      const allAnswers = questionIds.length > 0 ? await db
        .select()
        .from(schema.answers)
        .where(inArray(schema.answers.questionId, questionIds))
        .orderBy(schema.answers.order) : [];
      
      // Get all assessments for this model
      const assessments = await db
        .select()
        .from(schema.assessments)
        .where(eq(schema.assessments.modelId, model.id));
      
      // Build comprehensive export data
      const exportData = {
        model: {
          id: model.id,
          name: model.name,
          slug: model.slug,
          description: model.description,
          scoringMethod: model.scoringMethod,
          maturityScale: model.maturityScale,
        },
        dimensions: dimensions.map(d => ({
          id: d.id,
          key: d.key,
          label: d.label,
          description: d.description,
          order: d.order,
        })),
        questions: questions.map(q => {
          const questionAnswers = allAnswers.filter(a => a.questionId === q.id);
          const dimension = dimensions.find(d => d.id === q.dimensionId);
          
          return {
            id: q.id,
            text: q.text,
            type: q.type,
            dimension: dimension ? {
              key: dimension.key,
              label: dimension.label,
            } : null,
            order: q.order,
            minValue: q.minValue,
            maxValue: q.maxValue,
            unit: q.unit,
            placeholder: q.placeholder,
            answers: questionAnswers.map(a => ({
              id: a.id,
              text: a.text,
              score: a.score,
              order: a.order,
            })),
          };
        }),
        assessments: [],
      };
      
      // For each assessment, get responses, results, and user data
      for (const assessment of assessments) {
        // Get user data
        let userData = null;
        if (assessment.userId) {
          const userResult = await db
            .select({
              name: schema.users.name,
              company: schema.users.company,
              jobTitle: schema.users.jobTitle,
              industry: schema.users.industry,
              companySize: schema.users.companySize,
              country: schema.users.country,
            })
            .from(schema.users)
            .where(eq(schema.users.id, assessment.userId))
            .limit(1);
          
          userData = userResult[0] || null;
        }
        
        // Get results
        const resultResult = await db
          .select()
          .from(schema.results)
          .where(eq(schema.results.assessmentId, assessment.id))
          .limit(1);
        
        const result = resultResult[0];
        if (!result) continue; // Skip assessments without results
        
        // Get responses
        const responses = await db
          .select()
          .from(schema.assessmentResponses)
          .where(eq(schema.assessmentResponses.assessmentId, assessment.id));
        
        // Build response details with full context
        const responseDetails = responses.map(r => {
          const question = questions.find(q => q.id === r.questionId);
          if (!question) return null;
          
          let selectedAnswers = [];
          
          // Handle different question types
          if (r.answerIds && r.answerIds.length > 0) {
            // Multi-select
            selectedAnswers = allAnswers
              .filter(a => r.answerIds!.includes(a.id))
              .map(a => ({
                id: a.id,
                text: a.text,
                score: a.score,
              }));
          } else if (r.answerId) {
            // Single answer
            const answer = allAnswers.find(a => a.id === r.answerId);
            if (answer) {
              selectedAnswers = [{
                id: answer.id,
                text: answer.text,
                score: answer.score,
              }];
            }
          }
          
          return {
            questionId: r.questionId,
            questionText: question.text,
            questionType: question.type,
            selectedAnswers,
            numericValue: r.numericValue,
            booleanValue: r.booleanValue,
            textValue: r.textValue,
          };
        }).filter(Boolean);
        
        exportData.assessments.push({
          id: assessment.id,
          completedAt: assessment.completedAt,
          user: userData,
          isImported: !!assessment.importBatchId,
          results: {
            overallScore: result.overallScore,
            label: result.label,
            dimensionScores: result.dimensionScores,
          },
          responses: responseDetails,
        });
      }
      
      // Set response headers for JSON download
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename="${modelSlug}-analysis-${new Date().toISOString().split('T')[0]}.json"`);
      res.json(exportData);
    } catch (error) {
      console.error('Export error:', error);
      res.status(500).json({ error: "Failed to generate export" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
