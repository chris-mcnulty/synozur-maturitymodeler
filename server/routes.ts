import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertAssessmentSchema, insertAssessmentResponseSchema, insertResultSchema, insertModelSchema, insertDimensionSchema, insertQuestionSchema, insertAnswerSchema } from "@shared/schema";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export async function registerRoutes(app: Express): Promise<Server> {
  // Question routes
  app.get("/api/questions", async (req, res) => {
    try {
      const { modelId } = req.query;
      if (!modelId || typeof modelId !== 'string') {
        return res.status(400).json({ error: "Model ID is required" });
      }
      
      const questions = await storage.getQuestionsByModelId(modelId);
      res.json(questions);
    } catch (error) {
      console.error('Error fetching questions:', error);
      res.status(500).json({ error: "Failed to fetch questions" });
    }
  });

  app.post("/api/questions", async (req, res) => {
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

  app.delete("/api/questions/:id", async (req, res) => {
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
      const status = req.query.status as string | undefined;
      const models = await storage.getAllModels(status);
      res.json(models);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch models" });
    }
  });

  app.post("/api/models", async (req, res) => {
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

  app.put("/api/models/:id", async (req, res) => {
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

  app.delete("/api/models/:id", async (req, res) => {
    try {
      await storage.deleteModel(req.params.id);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to delete model" });
    }
  });

  app.get("/api/models/by-id/:id", async (req, res) => {
    try {
      const model = await storage.getModel(req.params.id);
      if (!model) {
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

      const dimensions = await storage.getDimensionsByModelId(model.id);
      res.json({ ...model, dimensions });
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch model" });
    }
  });

  // Questions routes
  app.get("/api/models/:slug/questions", async (req, res) => {
    try {
      const model = await storage.getModelBySlug(req.params.slug);
      if (!model) {
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
      const assessment = await storage.createAssessment(validatedData);
      res.json(assessment);
    } catch (error) {
      res.status(400).json({ error: "Invalid assessment data" });
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
      const { questionId, answerId, numericValue, booleanValue, textValue } = req.body;
      
      // Check if response already exists
      const existing = await storage.getAssessmentResponse(req.params.id, questionId);
      
      let response;
      if (existing) {
        // Update existing response
        const updateData: any = {};
        
        // Clear all fields first
        updateData.answerId = null;
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
        } else if (answerId !== undefined) {
          responseData.answerId = answerId;
        }
        
        const validatedData = insertAssessmentResponseSchema.parse(responseData);
        response = await storage.createAssessmentResponse(validatedData);
      }
      
      res.json(response);
    } catch (error) {
      console.error(error);
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

      // Determine label based on score (matching prototype)
      let label = "Nascent";
      if (overallScore >= 450) label = "Transformational";
      else if (overallScore >= 400) label = "Strategic";
      else if (overallScore >= 300) label = "Operational";
      else if (overallScore >= 200) label = "Experimental";

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
  app.post("/api/admin/models/seed/:modelSlug", async (req, res) => {
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

  app.get("/api/admin/models", async (req, res) => {
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

  app.patch("/api/admin/models/:id", async (req, res) => {
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

  app.delete("/api/admin/models/:id", async (req, res) => {
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

  app.post("/api/settings/:key", async (req, res) => {
    try {
      const setting = await storage.setSetting(req.params.key, req.body.value);
      res.json(setting);
    } catch (error) {
      res.status(500).json({ error: "Failed to update setting" });
    }
  });

  // Import/Export routes
  app.get("/api/models/:id/export", async (req, res) => {
    try {
      const model = await storage.getModel(req.params.id);
      if (!model) {
        return res.status(404).json({ error: "Model not found" });
      }

      const dimensions = await storage.getDimensionsByModelId(model.id);
      const questions = await storage.getQuestionsByModelId(model.id);
      
      // Get all answers for all questions
      const allAnswers: Answer[] = [];
      for (const q of questions) {
        const answers = await storage.getAnswersByQuestionId(q.id);
        allAnswers.push(...answers);
      }

      // Import CSV converter
      const { modelToCSV } = await import('../client/src/utils/csvConverter');
      
      // Define default scoring levels
      const scoringLevels = [
        { id: '1', label: 'Initial', minScore: 100, maxScore: 199, color: '#ef4444' },
        { id: '2', label: 'Developing', minScore: 200, maxScore: 299, color: '#f59e0b' },
        { id: '3', label: 'Defined', minScore: 300, maxScore: 399, color: '#10b981' },
        { id: '4', label: 'Optimized', minScore: 400, maxScore: 500, color: '#3b82f6' },
      ];
      
      const csvContent = modelToCSV(model, dimensions, questions, allAnswers, scoringLevels);

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="${model.slug}-export.csv"`);
      res.send(csvContent);
    } catch (error) {
      console.error('Export error:', error);
      res.status(500).json({ error: "Failed to export model" });
    }
  });

  app.post("/api/models/import", async (req, res) => {
    try {
      const { csvContent } = req.body;
      
      // Import CSV converter
      const { csvToModel } = await import('../client/src/utils/csvConverter');
      const { model: modelData, dimensions, questions, answers: csvAnswers, scoringLevels } = csvToModel(csvContent);

      // Create the model
      const model = await storage.createModel({
        name: modelData.name || '',
        slug: modelData.slug || '',
        description: modelData.description,
        version: modelData.version || "1.0",
        estimatedTime: modelData.estimatedTime,
        status: modelData.status || "draft",
      });

      // Create dimensions
      const dimensionMap = new Map<string, string>();
      if (dimensions && Array.isArray(dimensions)) {
        for (const dim of dimensions) {
          const newDim = await storage.createDimension({
            modelId: model.id,
            key: dim.key || '',
            label: dim.label || '',
            description: dim.description,
            order: dim.order || 0,
          });
          dimensionMap.set(dim.id || dim.key || '', newDim.id);
        }
      }

      // Create questions
      const questionMap = new Map<string, string>();
      if (questions && Array.isArray(questions)) {
        for (const q of questions) {
          const question = await storage.createQuestion({
            modelId: model.id,
            dimensionId: q.dimensionId ? dimensionMap.get(q.dimensionId) : null,
            text: q.text || '',
            type: q.type || 'multiple_choice',
            minValue: q.minValue,
            maxValue: q.maxValue,
            unit: q.unit,
            placeholder: q.placeholder,
            order: q.order || 0,
            improvementStatement: q.improvementStatement,
            resourceLink: q.resourceLink,
          });
          questionMap.set(q.id || '', question.id);
        }
      }
      
      // Create answers from CSV answers array
      if (csvAnswers && Array.isArray(csvAnswers)) {
        for (const a of csvAnswers) {
          if (a.questionId && questionMap.has(a.questionId)) {
            await storage.createAnswer({
              questionId: questionMap.get(a.questionId) || '',
              text: a.text || '',
              score: a.score || 0,
              order: a.order || 0,
              improvementStatement: a.improvementStatement,
              resourceLink: a.resourceLink,
            });
          }
        }
      }

      res.json({ success: true, model });
    } catch (error) {
      console.error('Import error:', error);
      res.status(400).json({ error: "Failed to import model" });
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

  const httpServer = createServer(app);
  return httpServer;
}
