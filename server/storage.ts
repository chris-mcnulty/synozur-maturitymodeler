import { db } from "./db";
import { eq, and, desc } from "drizzle-orm";
import * as schema from "@shared/schema";
import type {
  User, InsertUser,
  Model, InsertModel,
  Dimension, InsertDimension,
  Question, InsertQuestion,
  Answer, InsertAnswer,
  Assessment, InsertAssessment,
  AssessmentResponse, InsertAssessmentResponse,
  Result, InsertResult,
  Benchmark, InsertBenchmark,
  Setting, InsertSetting,
} from "@shared/schema";

export interface IStorage {
  // User methods
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  updateUser(id: string, user: Partial<InsertUser>): Promise<User | undefined>;

  // Model methods
  getModel(id: string): Promise<Model | undefined>;
  getModelBySlug(slug: string): Promise<Model | undefined>;
  getAllModels(status?: string): Promise<Model[]>;
  createModel(model: InsertModel): Promise<Model>;
  updateModel(id: string, model: Partial<InsertModel>): Promise<Model | undefined>;
  deleteModel(id: string): Promise<void>;

  // Dimension methods
  getDimensionsByModelId(modelId: string): Promise<Dimension[]>;
  createDimension(dimension: InsertDimension): Promise<Dimension>;

  // Question methods
  getQuestionsByModelId(modelId: string): Promise<Question[]>;
  getQuestion(id: string): Promise<Question | undefined>;
  createQuestion(question: InsertQuestion): Promise<Question>;

  // Answer methods
  getAnswersByQuestionId(questionId: string): Promise<Answer[]>;
  createAnswer(answer: InsertAnswer): Promise<Answer>;

  // Assessment methods
  getAssessment(id: string): Promise<Assessment | undefined>;
  getAssessmentsByUserId(userId: string): Promise<Assessment[]>;
  createAssessment(assessment: InsertAssessment): Promise<Assessment>;
  updateAssessment(id: string, assessment: Partial<InsertAssessment>): Promise<Assessment | undefined>;

  // Assessment response methods
  getAssessmentResponses(assessmentId: string): Promise<AssessmentResponse[]>;
  createAssessmentResponse(response: InsertAssessmentResponse): Promise<AssessmentResponse>;
  updateAssessmentResponse(id: string, response: Partial<InsertAssessmentResponse>): Promise<AssessmentResponse | undefined>;
  getAssessmentResponse(assessmentId: string, questionId: string): Promise<AssessmentResponse | undefined>;

  // Result methods
  getResult(assessmentId: string): Promise<Result | undefined>;
  getResultsByUserId(userId: string): Promise<Result[]>;
  createResult(result: InsertResult): Promise<Result>;
  updateResult(id: string, result: Partial<InsertResult>): Promise<Result | undefined>;

  // Benchmark methods
  getBenchmarksByModelId(modelId: string): Promise<Benchmark[]>;
  getBenchmark(modelId: string, industry?: string, country?: string): Promise<Benchmark | undefined>;
  createBenchmark(benchmark: InsertBenchmark): Promise<Benchmark>;

  // Settings methods
  getSetting(key: string): Promise<Setting | undefined>;
  setSetting(key: string, value: any): Promise<Setting>;
  getAllSettings(): Promise<Setting[]>;
}

export class DatabaseStorage implements IStorage {
  // User methods
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(schema.users).where(eq(schema.users.id, id)).limit(1);
    return user;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(schema.users).where(eq(schema.users.username, username)).limit(1);
    return user;
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await db.select().from(schema.users).where(eq(schema.users.email, email)).limit(1);
    return user;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const [user] = await db.insert(schema.users).values(insertUser).returning();
    return user;
  }

  async updateUser(id: string, userData: Partial<InsertUser>): Promise<User | undefined> {
    const [user] = await db.update(schema.users).set(userData).where(eq(schema.users.id, id)).returning();
    return user;
  }

  // Model methods
  async getModel(id: string): Promise<Model | undefined> {
    const [model] = await db.select().from(schema.models).where(eq(schema.models.id, id)).limit(1);
    return model;
  }

  async getModelBySlug(slug: string): Promise<Model | undefined> {
    const [model] = await db.select().from(schema.models).where(eq(schema.models.slug, slug)).limit(1);
    return model;
  }

  async getAllModels(status?: string): Promise<Model[]> {
    if (status) {
      return db.select().from(schema.models).where(eq(schema.models.status, status));
    }
    return db.select().from(schema.models);
  }

  async createModel(insertModel: InsertModel): Promise<Model> {
    const [model] = await db.insert(schema.models).values(insertModel).returning();
    return model;
  }

  async updateModel(id: string, modelData: Partial<InsertModel>): Promise<Model | undefined> {
    const [model] = await db.update(schema.models).set({ ...modelData, updatedAt: new Date() }).where(eq(schema.models.id, id)).returning();
    return model;
  }

  async deleteModel(id: string): Promise<void> {
    await db.delete(schema.models).where(eq(schema.models.id, id));
  }

  // Dimension methods
  async getDimensionsByModelId(modelId: string): Promise<Dimension[]> {
    return db.select().from(schema.dimensions).where(eq(schema.dimensions.modelId, modelId)).orderBy(schema.dimensions.order);
  }

  async createDimension(insertDimension: InsertDimension): Promise<Dimension> {
    const [dimension] = await db.insert(schema.dimensions).values(insertDimension).returning();
    return dimension;
  }

  // Question methods
  async getQuestionsByModelId(modelId: string): Promise<Question[]> {
    return db.select().from(schema.questions).where(eq(schema.questions.modelId, modelId)).orderBy(schema.questions.order);
  }

  async getQuestion(id: string): Promise<Question | undefined> {
    const [question] = await db.select().from(schema.questions).where(eq(schema.questions.id, id)).limit(1);
    return question;
  }

  async createQuestion(insertQuestion: InsertQuestion): Promise<Question> {
    const [question] = await db.insert(schema.questions).values(insertQuestion).returning();
    return question;
  }

  // Answer methods
  async getAnswersByQuestionId(questionId: string): Promise<Answer[]> {
    return db.select().from(schema.answers).where(eq(schema.answers.questionId, questionId)).orderBy(schema.answers.order);
  }

  async createAnswer(insertAnswer: InsertAnswer): Promise<Answer> {
    const [answer] = await db.insert(schema.answers).values(insertAnswer).returning();
    return answer;
  }

  // Assessment methods
  async getAssessment(id: string): Promise<Assessment | undefined> {
    const [assessment] = await db.select().from(schema.assessments).where(eq(schema.assessments.id, id)).limit(1);
    return assessment;
  }

  async getAssessmentsByUserId(userId: string): Promise<Assessment[]> {
    return db.select().from(schema.assessments).where(eq(schema.assessments.userId, userId)).orderBy(desc(schema.assessments.startedAt));
  }

  async createAssessment(insertAssessment: InsertAssessment): Promise<Assessment> {
    const [assessment] = await db.insert(schema.assessments).values(insertAssessment).returning();
    return assessment;
  }

  async updateAssessment(id: string, assessmentData: Partial<InsertAssessment>): Promise<Assessment | undefined> {
    const [assessment] = await db.update(schema.assessments).set(assessmentData).where(eq(schema.assessments.id, id)).returning();
    return assessment;
  }

  // Assessment response methods
  async getAssessmentResponses(assessmentId: string): Promise<AssessmentResponse[]> {
    return db.select().from(schema.assessmentResponses).where(eq(schema.assessmentResponses.assessmentId, assessmentId));
  }

  async createAssessmentResponse(insertResponse: InsertAssessmentResponse): Promise<AssessmentResponse> {
    const [response] = await db.insert(schema.assessmentResponses).values(insertResponse).returning();
    return response;
  }

  async updateAssessmentResponse(id: string, responseData: Partial<InsertAssessmentResponse>): Promise<AssessmentResponse | undefined> {
    const [response] = await db.update(schema.assessmentResponses).set(responseData).where(eq(schema.assessmentResponses.id, id)).returning();
    return response;
  }

  async getAssessmentResponse(assessmentId: string, questionId: string): Promise<AssessmentResponse | undefined> {
    const [response] = await db.select().from(schema.assessmentResponses)
      .where(and(
        eq(schema.assessmentResponses.assessmentId, assessmentId),
        eq(schema.assessmentResponses.questionId, questionId)
      ))
      .limit(1);
    return response;
  }

  // Result methods
  async getResult(assessmentId: string): Promise<Result | undefined> {
    const [result] = await db.select().from(schema.results).where(eq(schema.results.assessmentId, assessmentId)).limit(1);
    return result;
  }

  async getResultsByUserId(userId: string): Promise<Result[]> {
    const results = await db.select({
      id: schema.results.id,
      assessmentId: schema.results.assessmentId,
      overallScore: schema.results.overallScore,
      label: schema.results.label,
      dimensionScores: schema.results.dimensionScores,
      pdfUrl: schema.results.pdfUrl,
      emailSent: schema.results.emailSent,
      createdAt: schema.results.createdAt,
    })
    .from(schema.results)
    .innerJoin(schema.assessments, eq(schema.results.assessmentId, schema.assessments.id))
    .where(eq(schema.assessments.userId, userId))
    .orderBy(desc(schema.results.createdAt));
    
    return results;
  }

  async createResult(insertResult: InsertResult): Promise<Result> {
    const [result] = await db.insert(schema.results).values(insertResult).returning();
    return result;
  }

  async updateResult(id: string, resultData: Partial<InsertResult>): Promise<Result | undefined> {
    const [result] = await db.update(schema.results).set(resultData).where(eq(schema.results.id, id)).returning();
    return result;
  }

  // Benchmark methods
  async getBenchmarksByModelId(modelId: string): Promise<Benchmark[]> {
    return db.select().from(schema.benchmarks).where(eq(schema.benchmarks.modelId, modelId));
  }

  async getBenchmark(modelId: string, industry?: string, country?: string): Promise<Benchmark | undefined> {
    const conditions = [eq(schema.benchmarks.modelId, modelId)];
    
    if (industry) {
      conditions.push(eq(schema.benchmarks.industry, industry));
    }
    if (country) {
      conditions.push(eq(schema.benchmarks.country, country));
    }

    const [benchmark] = await db.select().from(schema.benchmarks).where(and(...conditions)).limit(1);
    return benchmark;
  }

  async createBenchmark(insertBenchmark: InsertBenchmark): Promise<Benchmark> {
    const [benchmark] = await db.insert(schema.benchmarks).values(insertBenchmark).returning();
    return benchmark;
  }

  // Settings methods
  async getSetting(key: string): Promise<Setting | undefined> {
    const [setting] = await db.select().from(schema.settings).where(eq(schema.settings.key, key)).limit(1);
    return setting;
  }

  async setSetting(key: string, value: any): Promise<Setting> {
    const [existing] = await db.select().from(schema.settings).where(eq(schema.settings.key, key)).limit(1);
    
    if (existing) {
      const [updated] = await db.update(schema.settings)
        .set({ value, updatedAt: new Date() })
        .where(eq(schema.settings.key, key))
        .returning();
      return updated;
    } else {
      const [created] = await db.insert(schema.settings)
        .values({ key, value })
        .returning();
      return created;
    }
  }

  async getAllSettings(): Promise<Setting[]> {
    return db.select().from(schema.settings);
  }
}

export const storage = new DatabaseStorage();
