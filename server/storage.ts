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

  deleteAssessment(id: string): Promise<void>;

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
  
  // SSO/Tenant methods
  getUserBySsoProvider(provider: string, providerId: string): Promise<User | undefined>;
  getTenant(id: string): Promise<schema.Tenant | undefined>;
  getTenantBySsoTenantId(ssoTenantId: string): Promise<schema.Tenant | undefined>;
  createTenant(tenant: schema.InsertTenant): Promise<schema.Tenant>;
  updateTenant(id: string, tenant: Partial<schema.InsertTenant>): Promise<schema.Tenant | undefined>;
  getTenantDomainByDomain(domain: string): Promise<schema.TenantDomain | undefined>;
  createTenantDomain(domain: schema.InsertTenantDomain): Promise<schema.TenantDomain>;
  
  // SSO Auth State methods (database-backed for production)
  createSsoAuthState(state: schema.InsertSsoAuthState): Promise<schema.SsoAuthState>;
  getSsoAuthState(state: string): Promise<schema.SsoAuthState | undefined>;
  deleteSsoAuthState(state: string): Promise<void>;
  cleanupExpiredSsoAuthStates(): Promise<number>;

  // Model Access Request methods
  createModelAccessRequest(req: schema.InsertModelAccessRequest): Promise<schema.ModelAccessRequest>;
  getModelAccessRequest(id: string): Promise<schema.ModelAccessRequest | undefined>;
  getModelAccessRequestsByModel(modelId: string, status?: string): Promise<schema.ModelAccessRequest[]>;
  getModelAccessRequestByEmail(modelId: string, email: string): Promise<schema.ModelAccessRequest | undefined>;
  getModelAccessRequestsByTenant(tenantId: string): Promise<schema.ModelAccessRequest[]>;
  getAllModelAccessRequests(status?: string): Promise<(schema.ModelAccessRequest & { modelName: string })[]>;
  updateModelAccessRequest(id: string, data: Partial<schema.ModelAccessRequest>): Promise<schema.ModelAccessRequest | undefined>;
  countPendingAccessRequests(): Promise<number>;

  // Support Ticket methods
  createSupportTicket(ticket: schema.InsertSupportTicket & { ticketNumber: number }): Promise<schema.SupportTicket>;
  getSupportTicket(id: string): Promise<schema.SupportTicket | undefined>;
  getSupportTicketsByUser(userId: string): Promise<schema.SupportTicket[]>;
  getSupportTicketsByTenant(tenantId: string): Promise<schema.SupportTicket[]>;
  getAllSupportTickets(): Promise<schema.SupportTicket[]>;
  updateSupportTicket(id: string, data: Partial<schema.SupportTicket>): Promise<schema.SupportTicket | undefined>;
  getNextTicketNumber(): Promise<number>;

  // Support Ticket Reply methods
  createSupportTicketReply(reply: schema.InsertSupportTicketReply): Promise<schema.SupportTicketReply>;
  getSupportTicketReplies(ticketId: string): Promise<schema.SupportTicketReply[]>;

  // Support Ticket Planner Sync methods
  createSupportTicketPlannerSync(sync: schema.InsertSupportTicketPlannerSync): Promise<schema.SupportTicketPlannerSync>;
  getSupportTicketPlannerSync(ticketId: string): Promise<schema.SupportTicketPlannerSync | undefined>;
  getUnsyncedTickets(tenantId?: string): Promise<schema.SupportTicket[]>;
  updateSupportTicketPlannerSync(id: string, data: Partial<schema.SupportTicketPlannerSync>): Promise<schema.SupportTicketPlannerSync | undefined>;
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

  async deleteAssessment(id: string): Promise<void> {
    await db.delete(schema.assessments).where(eq(schema.assessments.id, id));
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

  // SSO/Tenant methods
  async getUserBySsoProvider(provider: string, providerId: string): Promise<User | undefined> {
    const [user] = await db.select()
      .from(schema.users)
      .where(and(
        eq(schema.users.ssoProvider, provider),
        eq(schema.users.ssoProviderId, providerId)
      ))
      .limit(1);
    return user;
  }

  async getTenant(id: string): Promise<schema.Tenant | undefined> {
    const [tenant] = await db.select()
      .from(schema.tenants)
      .where(eq(schema.tenants.id, id))
      .limit(1);
    return tenant;
  }

  async getTenantBySsoTenantId(ssoTenantId: string): Promise<schema.Tenant | undefined> {
    const [tenant] = await db.select()
      .from(schema.tenants)
      .where(eq(schema.tenants.ssoTenantId, ssoTenantId))
      .limit(1);
    return tenant;
  }

  async createTenant(tenant: schema.InsertTenant): Promise<schema.Tenant> {
    const [created] = await db.insert(schema.tenants)
      .values(tenant)
      .returning();
    return created;
  }

  async updateTenant(id: string, tenantData: Partial<schema.InsertTenant>): Promise<schema.Tenant | undefined> {
    const [updated] = await db.update(schema.tenants)
      .set({ ...tenantData, updatedAt: new Date() })
      .where(eq(schema.tenants.id, id))
      .returning();
    return updated;
  }

  async getTenantDomainByDomain(domain: string): Promise<schema.TenantDomain | undefined> {
    const [tenantDomain] = await db.select()
      .from(schema.tenantDomains)
      .where(eq(schema.tenantDomains.domain, domain.toLowerCase()))
      .limit(1);
    return tenantDomain;
  }

  async createTenantDomain(domainData: schema.InsertTenantDomain): Promise<schema.TenantDomain> {
    const [created] = await db.insert(schema.tenantDomains)
      .values({ ...domainData, domain: domainData.domain.toLowerCase() })
      .returning();
    return created;
  }

  // SSO Auth State methods (database-backed for production)
  async createSsoAuthState(stateData: schema.InsertSsoAuthState): Promise<schema.SsoAuthState> {
    const [created] = await db.insert(schema.ssoAuthStates)
      .values(stateData)
      .returning();
    return created;
  }

  async getSsoAuthState(state: string): Promise<schema.SsoAuthState | undefined> {
    const [authState] = await db.select()
      .from(schema.ssoAuthStates)
      .where(eq(schema.ssoAuthStates.state, state))
      .limit(1);
    return authState;
  }

  async deleteSsoAuthState(state: string): Promise<void> {
    await db.delete(schema.ssoAuthStates)
      .where(eq(schema.ssoAuthStates.state, state));
  }

  async cleanupExpiredSsoAuthStates(): Promise<number> {
    const result = await db.delete(schema.ssoAuthStates)
      .where(sql`${schema.ssoAuthStates.expiresAt} < NOW()`)
      .returning();
    return result.length;
  }

  // Model Access Request methods
  async createModelAccessRequest(reqData: schema.InsertModelAccessRequest): Promise<schema.ModelAccessRequest> {
    const [created] = await db.insert(schema.modelAccessRequests)
      .values(reqData)
      .returning();
    return created;
  }

  async getModelAccessRequest(id: string): Promise<schema.ModelAccessRequest | undefined> {
    const [req] = await db.select()
      .from(schema.modelAccessRequests)
      .where(eq(schema.modelAccessRequests.id, id))
      .limit(1);
    return req;
  }

  async getModelAccessRequestsByModel(modelId: string, status?: string): Promise<schema.ModelAccessRequest[]> {
    const conditions = [eq(schema.modelAccessRequests.modelId, modelId)];
    if (status) {
      conditions.push(eq(schema.modelAccessRequests.status, status));
    }
    return db.select()
      .from(schema.modelAccessRequests)
      .where(and(...conditions))
      .orderBy(desc(schema.modelAccessRequests.requestedAt));
  }

  async getModelAccessRequestByEmail(modelId: string, email: string): Promise<schema.ModelAccessRequest | undefined> {
    const [req] = await db.select()
      .from(schema.modelAccessRequests)
      .where(and(
        eq(schema.modelAccessRequests.modelId, modelId),
        eq(schema.modelAccessRequests.requestorEmail, email.toLowerCase())
      ))
      .orderBy(desc(schema.modelAccessRequests.requestedAt))
      .limit(1);
    return req;
  }

  async getModelAccessRequestsByTenant(tenantId: string): Promise<schema.ModelAccessRequest[]> {
    return db.select()
      .from(schema.modelAccessRequests)
      .where(eq(schema.modelAccessRequests.tenantId, tenantId))
      .orderBy(desc(schema.modelAccessRequests.requestedAt));
  }

  async getAllModelAccessRequests(status?: string): Promise<(schema.ModelAccessRequest & { modelName: string })[]> {
    const conditions = status ? [eq(schema.modelAccessRequests.status, status)] : [];
    const rows = await db
      .select({
        id: schema.modelAccessRequests.id,
        modelId: schema.modelAccessRequests.modelId,
        requestorName: schema.modelAccessRequests.requestorName,
        requestorEmail: schema.modelAccessRequests.requestorEmail,
        organizationName: schema.modelAccessRequests.organizationName,
        organizationDomain: schema.modelAccessRequests.organizationDomain,
        tenantId: schema.modelAccessRequests.tenantId,
        ssoTenantId: schema.modelAccessRequests.ssoTenantId,
        adminConsentGranted: schema.modelAccessRequests.adminConsentGranted,
        message: schema.modelAccessRequests.message,
        status: schema.modelAccessRequests.status,
        requestedAt: schema.modelAccessRequests.requestedAt,
        reviewedAt: schema.modelAccessRequests.reviewedAt,
        reviewedBy: schema.modelAccessRequests.reviewedBy,
        denialReason: schema.modelAccessRequests.denialReason,
        modelName: schema.models.name,
      })
      .from(schema.modelAccessRequests)
      .leftJoin(schema.models, eq(schema.modelAccessRequests.modelId, schema.models.id))
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(schema.modelAccessRequests.requestedAt));
    return rows.map(r => ({ ...r, modelName: r.modelName ?? 'Unknown Model' }));
  }

  async updateModelAccessRequest(id: string, data: Partial<schema.ModelAccessRequest>): Promise<schema.ModelAccessRequest | undefined> {
    const [updated] = await db.update(schema.modelAccessRequests)
      .set(data)
      .where(eq(schema.modelAccessRequests.id, id))
      .returning();
    return updated;
  }

  async countPendingAccessRequests(): Promise<number> {
    const [{ count }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(schema.modelAccessRequests)
      .where(eq(schema.modelAccessRequests.status, 'pending'));
    return count;
  }

  async createSupportTicket(ticket: schema.InsertSupportTicket & { ticketNumber: number }): Promise<schema.SupportTicket> {
    const [created] = await db.insert(schema.supportTickets).values(ticket).returning();
    return created;
  }

  async getSupportTicket(id: string): Promise<schema.SupportTicket | undefined> {
    const [ticket] = await db.select().from(schema.supportTickets).where(eq(schema.supportTickets.id, id)).limit(1);
    return ticket;
  }

  async getSupportTicketsByUser(userId: string): Promise<schema.SupportTicket[]> {
    return db.select().from(schema.supportTickets).where(eq(schema.supportTickets.userId, userId)).orderBy(desc(schema.supportTickets.createdAt));
  }

  async getSupportTicketsByTenant(tenantId: string): Promise<schema.SupportTicket[]> {
    return db.select().from(schema.supportTickets).where(eq(schema.supportTickets.tenantId, tenantId)).orderBy(desc(schema.supportTickets.createdAt));
  }

  async getAllSupportTickets(): Promise<schema.SupportTicket[]> {
    return db.select().from(schema.supportTickets).orderBy(desc(schema.supportTickets.createdAt));
  }

  async updateSupportTicket(id: string, data: Partial<schema.SupportTicket>): Promise<schema.SupportTicket | undefined> {
    const [updated] = await db.update(schema.supportTickets).set({ ...data, updatedAt: new Date() }).where(eq(schema.supportTickets.id, id)).returning();
    return updated;
  }

  async getNextTicketNumber(): Promise<number> {
    const [result] = await db.select({ max: sql<number>`COALESCE(MAX(ticket_number), 0)` }).from(schema.supportTickets);
    return (result?.max || 0) + 1;
  }

  async createSupportTicketReply(reply: schema.InsertSupportTicketReply): Promise<schema.SupportTicketReply> {
    const [created] = await db.insert(schema.supportTicketReplies).values(reply).returning();
    return created;
  }

  async getSupportTicketReplies(ticketId: string): Promise<schema.SupportTicketReply[]> {
    return db.select().from(schema.supportTicketReplies).where(eq(schema.supportTicketReplies.ticketId, ticketId)).orderBy(schema.supportTicketReplies.createdAt);
  }

  async createSupportTicketPlannerSync(sync: schema.InsertSupportTicketPlannerSync): Promise<schema.SupportTicketPlannerSync> {
    const [created] = await db.insert(schema.supportTicketPlannerSync).values(sync).returning();
    return created;
  }

  async getSupportTicketPlannerSync(ticketId: string): Promise<schema.SupportTicketPlannerSync | undefined> {
    const [sync] = await db.select().from(schema.supportTicketPlannerSync).where(eq(schema.supportTicketPlannerSync.ticketId, ticketId)).limit(1);
    return sync;
  }

  async getUnsyncedTickets(tenantId?: string): Promise<schema.SupportTicket[]> {
    const conditions = [];
    if (tenantId) {
      const syncedTicketIds = db.select({ ticketId: schema.supportTicketPlannerSync.ticketId }).from(schema.supportTicketPlannerSync).where(eq(schema.supportTicketPlannerSync.tenantId, tenantId));
      conditions.push(eq(schema.supportTickets.tenantId, tenantId));
      conditions.push(sql`${schema.supportTickets.id} NOT IN (${syncedTicketIds})`);
    } else {
      const allSyncedTicketIds = db.select({ ticketId: schema.supportTicketPlannerSync.ticketId }).from(schema.supportTicketPlannerSync);
      conditions.push(sql`${schema.supportTickets.id} NOT IN (${allSyncedTicketIds})`);
    }
    conditions.push(sql`${schema.supportTickets.status} IN ('open', 'in_progress')`);
    return db.select().from(schema.supportTickets)
      .where(and(...conditions))
      .orderBy(schema.supportTickets.createdAt);
  }

  async updateSupportTicketPlannerSync(id: string, data: Partial<schema.SupportTicketPlannerSync>): Promise<schema.SupportTicketPlannerSync | undefined> {
    const [updated] = await db.update(schema.supportTicketPlannerSync).set(data).where(eq(schema.supportTicketPlannerSync.id, id)).returning();
    return updated;
  }
}

export const storage = new DatabaseStorage();
