import { db, pool } from "./db";
import { eq, and, desc, sql } from "drizzle-orm";
import * as schema from "@shared/schema";
import session from "express-session";
import connectPg from "connect-pg-simple";
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
  AiGeneratedContent, InsertAiGeneratedContent,
  AiUsageLog, InsertAiUsageLog,
  AiContentReview, InsertAiContentReview,
} from "@shared/schema";

const PostgresSessionStore = connectPg(session);

export interface IStorage {
  sessionStore: session.Store;
  // User methods
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  getAllUsers(): Promise<User[]>;
  createUser(user: InsertUser): Promise<User>;
  updateUser(id: string, user: Partial<InsertUser>): Promise<User | undefined>;
  deleteUser(id: string): Promise<void>;

  // Model methods
  getModel(id: string): Promise<Model | undefined>;
  getModelBySlug(slug: string): Promise<Model | undefined>;
  getAllModels(status?: string): Promise<(Model & { questionCount: number })[]>;
  createModel(model: InsertModel): Promise<Model>;
  updateModel(id: string, model: Partial<InsertModel>): Promise<Model | undefined>;
  deleteModel(id: string): Promise<void>;

  // Dimension methods
  getDimension(id: string): Promise<Dimension | undefined>;
  getDimensionsByModelId(modelId: string): Promise<Dimension[]>;
  createDimension(dimension: InsertDimension): Promise<Dimension>;
  updateDimension(id: string, dimension: Partial<InsertDimension>): Promise<Dimension | undefined>;
  deleteDimension(id: string): Promise<void>;

  // Question methods
  getQuestionsByModelId(modelId: string): Promise<Question[]>;
  getQuestion(id: string): Promise<Question | undefined>;
  createQuestion(question: InsertQuestion): Promise<Question>;
  deleteQuestion(id: string): Promise<void>;

  // Answer methods
  getAnswersByQuestionId(questionId: string): Promise<Answer[]>;
  createAnswer(answer: InsertAnswer): Promise<Answer>;
  updateAnswer(id: string, answer: Partial<InsertAnswer>): Promise<Answer>;
  deleteAnswer(id: string): Promise<void>;

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
  
  // AI-generated content methods
  getAiGeneratedContent(type: string, contextHash: string): Promise<AiGeneratedContent | undefined>;
  createAiGeneratedContent(content: InsertAiGeneratedContent): Promise<AiGeneratedContent>;
  
  // AI usage log methods
  createAiUsageLog(log: InsertAiUsageLog): Promise<AiUsageLog>;
  getAiUsageLogs(userId?: string): Promise<AiUsageLog[]>;
  
  // AI content review methods
  createAiContentReview(review: InsertAiContentReview): Promise<AiContentReview>;
  getPendingAiReviews(modelId?: string): Promise<AiContentReview[]>;
  getAiReviewById(id: string): Promise<AiContentReview | undefined>;
  approveAiReview(id: string, reviewedBy: string): Promise<AiContentReview | undefined>;
  rejectAiReview(id: string, reviewedBy: string, reason?: string): Promise<AiContentReview | undefined>;
}

export class DatabaseStorage implements IStorage {
  sessionStore: session.Store;
  
  constructor() {
    this.sessionStore = new PostgresSessionStore({
      pool,
      createTableIfMissing: true,
    });
  }
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

  async getAllUsers(): Promise<User[]> {
    return db.select().from(schema.users).orderBy(desc(schema.users.createdAt));
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const [user] = await db.insert(schema.users).values(insertUser).returning();
    return user;
  }

  async updateUser(id: string, userData: Partial<InsertUser>): Promise<User | undefined> {
    const [user] = await db.update(schema.users).set(userData).where(eq(schema.users.id, id)).returning();
    return user;
  }

  async deleteUser(id: string): Promise<void> {
    await db.delete(schema.users).where(eq(schema.users.id, id));
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

  async getAllModels(status?: string): Promise<(Model & { questionCount: number })[]> {
    const statusFilter = status ? sql`WHERE m.status = ${status}` : sql``;
    
    const result = await db.execute(sql`
      SELECT 
        m.id,
        m.slug,
        m.name,
        m.description,
        m.version,
        m.estimated_time,
        m.status,
        m.featured,
        m.image_url,
        m.maturity_scale,
        m.general_resources,
        m.visibility,
        m.owner_tenant_id,
        m.model_class,
        m.created_at,
        m.updated_at,
        COALESCE(COUNT(q.id), 0)::integer as question_count
      FROM models m
      LEFT JOIN questions q ON m.id = q.model_id
      ${statusFilter}
      GROUP BY m.id, m.slug, m.name, m.description, m.version, m.estimated_time, m.status, m.featured, m.image_url, m.maturity_scale::text, m.general_resources::text, m.visibility, m.owner_tenant_id, m.model_class, m.created_at, m.updated_at
      ORDER BY m.created_at DESC
    `);

    return result.rows.map((row: any) => ({
      id: row.id,
      slug: row.slug,
      name: row.name,
      description: row.description,
      version: row.version,
      estimatedTime: row.estimated_time,
      status: row.status,
      featured: row.featured,
      imageUrl: row.image_url,
      maturityScale: row.maturity_scale,
      generalResources: row.general_resources,
      visibility: row.visibility,
      ownerTenantId: row.owner_tenant_id,
      modelClass: row.model_class,
      createdAt: new Date(row.created_at.replace(' ', 'T') + 'Z'),
      updatedAt: new Date(row.updated_at.replace(' ', 'T') + 'Z'),
      questionCount: row.question_count,
    })) as (Model & { questionCount: number })[];
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
  async getDimension(id: string): Promise<Dimension | undefined> {
    const [dimension] = await db.select().from(schema.dimensions).where(eq(schema.dimensions.id, id)).limit(1);
    return dimension;
  }

  async getDimensionsByModelId(modelId: string): Promise<Dimension[]> {
    return db.select().from(schema.dimensions).where(eq(schema.dimensions.modelId, modelId)).orderBy(schema.dimensions.order);
  }

  async createDimension(insertDimension: InsertDimension): Promise<Dimension> {
    const [dimension] = await db.insert(schema.dimensions).values(insertDimension).returning();
    return dimension;
  }

  async updateDimension(id: string, dimensionData: Partial<InsertDimension>): Promise<Dimension | undefined> {
    const [dimension] = await db.update(schema.dimensions).set(dimensionData).where(eq(schema.dimensions.id, id)).returning();
    return dimension;
  }

  async deleteDimension(id: string): Promise<void> {
    await db.delete(schema.dimensions).where(eq(schema.dimensions.id, id));
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

  async updateQuestion(questionData: Question): Promise<Question> {
    const { id, ...updateData } = questionData;
    const [updatedQuestion] = await db.update(schema.questions)
      .set(updateData)
      .where(eq(schema.questions.id, id))
      .returning();
    return updatedQuestion;
  }

  async deleteQuestion(id: string): Promise<void> {
    // First delete all answers associated with this question
    await db.delete(schema.answers).where(eq(schema.answers.questionId, id));
    // Then delete the question itself
    await db.delete(schema.questions).where(eq(schema.questions.id, id));
  }

  async deleteAnswer(id: string): Promise<void> {
    await db.delete(schema.answers).where(eq(schema.answers.id, id));
  }

  // Answer methods
  async getAnswersByQuestionId(questionId: string): Promise<Answer[]> {
    return db.select().from(schema.answers).where(eq(schema.answers.questionId, questionId)).orderBy(schema.answers.order);
  }

  async createAnswer(insertAnswer: InsertAnswer): Promise<Answer> {
    const [answer] = await db.insert(schema.answers).values(insertAnswer).returning();
    return answer;
  }

  async updateAnswer(id: string, answer: Partial<InsertAnswer>): Promise<Answer> {
    const [updated] = await db.update(schema.answers).set(answer).where(eq(schema.answers.id, id)).returning();
    return updated;
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

  // AI-generated content methods
  async getAiGeneratedContent(type: string, contextHash: string): Promise<AiGeneratedContent | undefined> {
    const [content] = await db.select()
      .from(schema.aiGeneratedContent)
      .where(and(
        eq(schema.aiGeneratedContent.type, type),
        eq(schema.aiGeneratedContent.contextHash, contextHash)
      ))
      .limit(1);
    return content;
  }

  async createAiGeneratedContent(content: InsertAiGeneratedContent): Promise<AiGeneratedContent> {
    const [created] = await db.insert(schema.aiGeneratedContent).values(content).returning();
    return created;
  }

  // AI usage log methods
  async createAiUsageLog(log: InsertAiUsageLog): Promise<AiUsageLog> {
    const [created] = await db.insert(schema.aiUsageLog).values(log).returning();
    return created;
  }

  async getAiUsageLogs(userId?: string): Promise<AiUsageLog[]> {
    if (userId) {
      return db.select()
        .from(schema.aiUsageLog)
        .where(eq(schema.aiUsageLog.userId, userId))
        .orderBy(desc(schema.aiUsageLog.createdAt));
    }
    return db.select()
      .from(schema.aiUsageLog)
      .orderBy(desc(schema.aiUsageLog.createdAt));
  }

  // AI content review methods
  async createAiContentReview(review: InsertAiContentReview): Promise<AiContentReview> {
    const [created] = await db.insert(schema.aiContentReviews).values(review).returning();
    return created;
  }

  async getPendingAiReviews(modelId?: string): Promise<AiContentReview[]> {
    const conditions = [eq(schema.aiContentReviews.status, 'pending')];
    if (modelId) {
      conditions.push(eq(schema.aiContentReviews.modelId, modelId));
    }
    return db.select()
      .from(schema.aiContentReviews)
      .where(and(...conditions))
      .orderBy(desc(schema.aiContentReviews.createdAt));
  }

  async getAiReviewById(id: string): Promise<AiContentReview | undefined> {
    const [review] = await db.select()
      .from(schema.aiContentReviews)
      .where(eq(schema.aiContentReviews.id, id))
      .limit(1);
    return review;
  }

  async approveAiReview(id: string, reviewedBy: string): Promise<AiContentReview | undefined> {
    const [updated] = await db.update(schema.aiContentReviews)
      .set({
        status: 'approved',
        reviewedBy,
        reviewedAt: new Date()
      })
      .where(eq(schema.aiContentReviews.id, id))
      .returning();
    return updated;
  }

  async rejectAiReview(id: string, reviewedBy: string, reason?: string): Promise<AiContentReview | undefined> {
    const [updated] = await db.update(schema.aiContentReviews)
      .set({
        status: 'rejected',
        reviewedBy,
        reviewedAt: new Date(),
        rejectionReason: reason
      })
      .where(eq(schema.aiContentReviews.id, id))
      .returning();
    return updated;
  }
}

export const storage = new DatabaseStorage();
