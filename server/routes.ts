import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertAssessmentSchema, insertAssessmentResponseSchema, insertResultSchema } from "@shared/schema";

export async function registerRoutes(app: Express): Promise<Server> {
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
      const { questionId, answerId } = req.body;
      
      // Check if response already exists
      const existing = await storage.getAssessmentResponse(req.params.id, questionId);
      
      let response;
      if (existing) {
        // Update existing response
        response = await storage.updateAssessmentResponse(existing.id, {
          answerId,
        });
      } else {
        // Create new response
        const validatedData = insertAssessmentResponseSchema.parse({
          assessmentId: req.params.id,
          questionId,
          answerId,
        });
        response = await storage.createAssessmentResponse(validatedData);
      }
      
      res.json(response);
    } catch (error) {
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

      for (const response of responses) {
        const question = questions.find(q => q.id === response.questionId);
        if (!question) continue;

        const answers = await storage.getAnswersByQuestionId(question.id);
        const answer = answers.find(a => a.id === response.answerId);
        if (!answer) continue;

        totalScore += answer.score;

        if (question.dimensionId) {
          const dimension = dimensions.find(d => d.id === question.dimensionId);
          if (dimension) {
            if (!dimensionScores[dimension.key]) {
              dimensionScores[dimension.key] = [];
            }
            dimensionScores[dimension.key].push(answer.score);
          }
        }
      }

      // Calculate averages per dimension
      const dimensionAverages: Record<string, number> = {};
      for (const [key, scores] of Object.entries(dimensionScores)) {
        dimensionAverages[key] = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
      }

      // Calculate overall score
      const overallScore = Math.round(totalScore / responses.length);

      // Determine label based on score
      let label = "Initial";
      if (overallScore >= 450) label = "Leading";
      else if (overallScore >= 400) label = "Strategic";
      else if (overallScore >= 300) label = "Operational";
      else if (overallScore >= 200) label = "Developing";

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
        completedAt: new Date() as any,
      });

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

  const httpServer = createServer(app);
  return httpServer;
}
