import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, timestamp, json, boolean, unique, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Users table
export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
  email: text("email").unique(),
  name: text("name"),
  company: text("company"),
  companySize: text("company_size"), // sole_proprietor, very_small, small, lower_mid, upper_mid, mid_enterprise, large_enterprise
  jobTitle: text("job_title"),
  industry: text("industry"),
  country: text("country"),
  role: text("role").notNull().default("user"), // 'user', 'modeler', or 'admin'
  emailVerified: boolean("email_verified").notNull().default(false),
  verificationToken: varchar("verification_token"),
  verificationTokenExpiry: timestamp("verification_token_expiry"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Password reset tokens table
export const passwordResetTokens = pgTable("password_reset_tokens", {
  token: varchar("token").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  expiresAt: timestamp("expires_at").notNull(),
  used: boolean("used").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Models table
export const models = pgTable("models", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  description: text("description").notNull(),
  version: text("version").notNull().default("1.0"),
  estimatedTime: text("estimated_time"),
  status: text("status").notNull().default("draft"), // draft, published, archived
  featured: boolean("featured").notNull().default(false), // Whether model appears in featured section on homepage
  imageUrl: text("image_url"),
  // Maturity scale configuration (JSONB array of levels)
  maturityScale: json("maturity_scale").$type<Array<{
    id: string;
    name: string;
    description: string;
    minScore: number;
    maxScore: number;
  }>>(),
  // General resources displayed at end of results (JSONB array)
  generalResources: json("general_resources").$type<Array<{
    id: string;
    title: string;
    description?: string;
    link?: string;
  }>>(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Dimensions table
export const dimensions = pgTable("dimensions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  modelId: varchar("model_id").notNull().references(() => models.id, { onDelete: "cascade" }),
  key: text("key").notNull(),
  label: text("label").notNull(),
  description: text("description"),
  order: integer("order").notNull(),
});

// Questions table
export const questions = pgTable("questions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  modelId: varchar("model_id").notNull().references(() => models.id, { onDelete: "cascade" }),
  dimensionId: varchar("dimension_id").references(() => dimensions.id, { onDelete: "set null" }),
  text: text("text").notNull(),
  type: text("type").notNull().default("multiple_choice"), // multiple_choice, multi_select, numeric, true_false, text
  // For numeric questions - the valid input range
  minValue: integer("min_value"),
  maxValue: integer("max_value"),
  // For numeric questions - optional unit label (e.g., "points", "%")
  unit: text("unit"),
  // For text questions - optional placeholder text
  placeholder: text("placeholder"),
  order: integer("order").notNull(),
  // Optional improvement guidance for PDF reports
  improvementStatement: text("improvement_statement"),
  resourceTitle: text("resource_title"),
  resourceLink: text("resource_link"),
  resourceDescription: text("resource_description"),
});

// Answers table
export const answers = pgTable("answers", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  questionId: varchar("question_id").notNull().references(() => questions.id, { onDelete: "cascade" }),
  text: text("text").notNull(),
  score: integer("score").notNull(),
  order: integer("order").notNull(),
  // Optional improvement guidance for PDF reports
  improvementStatement: text("improvement_statement"),
  resourceTitle: text("resource_title"),
  resourceLink: text("resource_link"),
  resourceDescription: text("resource_description"),
});

// Assessments table
export const assessments = pgTable("assessments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id, { onDelete: "set null" }),
  modelId: varchar("model_id").notNull().references(() => models.id, { onDelete: "cascade" }),
  status: text("status").notNull().default("in_progress"), // in_progress, completed, abandoned
  startedAt: timestamp("started_at").defaultNow().notNull(),
  completedAt: timestamp("completed_at"),
  sessionId: text("session_id"), // For anonymous users
});

// Assessment responses table
export const assessmentResponses = pgTable("assessment_responses", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  assessmentId: varchar("assessment_id").notNull().references(() => assessments.id, { onDelete: "cascade" }),
  questionId: varchar("question_id").notNull().references(() => questions.id, { onDelete: "cascade" }),
  answerId: varchar("answer_id").references(() => answers.id, { onDelete: "cascade" }), // Nullable for numeric, true/false, text, multi-select questions
  answerIds: text("answer_ids").array(), // For multi-select questions - stores array of answer IDs
  numericValue: integer("numeric_value"), // For numeric questions
  booleanValue: boolean("boolean_value"), // For true/false questions
  textValue: text("text_value"), // For text input questions
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  uniqueAssessmentQuestion: unique().on(table.assessmentId, table.questionId),
}));

// Results table
export const results = pgTable("results", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  assessmentId: varchar("assessment_id").notNull().unique().references(() => assessments.id, { onDelete: "cascade" }),
  overallScore: integer("overall_score").notNull(),
  label: text("label").notNull(), // e.g., "Operational", "Strategic"
  dimensionScores: json("dimension_scores").notNull(), // { dimensionKey: score }
  pdfUrl: text("pdf_url"),
  emailSent: boolean("email_sent").default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Benchmarks table
export const benchmarks = pgTable("benchmarks", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  modelId: varchar("model_id").notNull().references(() => models.id, { onDelete: "cascade" }),
  industry: text("industry"),
  country: text("country"),
  meanScore: integer("mean_score").notNull(),
  sampleSize: integer("sample_size").notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Settings table for admin configurations
export const settings = pgTable("settings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  key: text("key").notNull().unique(),
  value: json("value").notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Insert schemas
export const insertUserSchema = createInsertSchema(users).omit({
  id: true,
  createdAt: true,
});

// Profile update schema with all fields required
export const updateProfileSchema = z.object({
  email: z.string().email("Valid email is required"),
  name: z.string().min(1, "Name is required"),
  company: z.string().min(1, "Company is required"),
  companySize: z.string().min(1, "Company size is required"),
  jobTitle: z.string().min(1, "Job title is required"),
  industry: z.string().min(1, "Industry is required"),
  country: z.string().min(1, "Country is required"),
});

export const insertModelSchema = createInsertSchema(models).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertDimensionSchema = createInsertSchema(dimensions).omit({
  id: true,
});

export const insertQuestionSchema = createInsertSchema(questions).omit({
  id: true,
});

export const insertAnswerSchema = createInsertSchema(answers).omit({
  id: true,
});

export const insertAssessmentSchema = createInsertSchema(assessments).omit({
  id: true,
  startedAt: true,
  completedAt: true,
});

export const insertAssessmentResponseSchema = createInsertSchema(assessmentResponses).omit({
  id: true,
  createdAt: true,
});

export const insertResultSchema = createInsertSchema(results).omit({
  id: true,
  createdAt: true,
});

export const insertBenchmarkSchema = createInsertSchema(benchmarks).omit({
  id: true,
  updatedAt: true,
});

export const insertSettingSchema = createInsertSchema(settings).omit({
  id: true,
  updatedAt: true,
});

// AI-generated content cache table
export const aiGeneratedContent = pgTable("ai_generated_content", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  type: text("type").notNull(), // 'recommendation', 'interpretation', 'resource'
  contextHash: varchar("context_hash", { length: 64 }).notNull(), // SHA256 hash of context for cache key
  content: json("content").notNull(), // The generated content
  metadata: json("metadata"), // Sources, confidence scores, etc.
  createdAt: timestamp("created_at").defaultNow().notNull(),
  expiresAt: timestamp("expires_at").notNull(), // Cache expiration
}, (table) => ({
  contextHashIdx: index("idx_ai_content_hash").on(table.contextHash),
  typeIdx: index("idx_ai_content_type").on(table.type),
  expiresIdx: index("idx_ai_content_expires").on(table.expiresAt),
}));

// Content embeddings for RAG system
export const contentEmbeddings = pgTable("content_embeddings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  sourceUrl: text("source_url").notNull(),
  title: text("title"),
  content: text("content").notNull(),
  embedding: text("embedding"), // Will store vector as JSON array for now (pgvector requires extension)
  metadata: json("metadata"), // Additional metadata about the content
  indexedAt: timestamp("indexed_at").defaultNow().notNull(),
}, (table) => ({
  sourceUrlIdx: index("idx_embeddings_source").on(table.sourceUrl),
}));

// AI usage tracking table
export const aiUsageLog = pgTable("ai_usage_log", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id, { onDelete: "set null" }),
  modelName: text("model_name").notNull(), // GPT model used
  operation: text("operation").notNull(), // 'recommendation', 'interpretation', etc.
  promptTokens: integer("prompt_tokens"),
  completionTokens: integer("completion_tokens"),
  totalTokens: integer("total_tokens"),
  estimatedCost: integer("estimated_cost"), // In cents
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  userIdx: index("idx_ai_usage_user").on(table.userId),
  createdIdx: index("idx_ai_usage_created").on(table.createdAt),
}));

// Session table for connect-pg-simple
// This table is managed by express-session and connect-pg-simple
export const session = pgTable("session", {
  sid: varchar("sid").primaryKey(),
  sess: json("sess").notNull(),
  expire: timestamp("expire", { withTimezone: true }).notNull(),
}, (table) => ({
  expireIdx: index("IDX_session_expire").on(table.expire),
}));

// Insert schemas for AI tables
export const insertAiGeneratedContentSchema = createInsertSchema(aiGeneratedContent).omit({
  id: true,
  createdAt: true,
});

export const insertContentEmbeddingSchema = createInsertSchema(contentEmbeddings).omit({
  id: true,
  indexedAt: true,
});

export const insertAiUsageLogSchema = createInsertSchema(aiUsageLog).omit({
  id: true,
  createdAt: true,
});

// Types
export type UserRole = 'user' | 'modeler' | 'admin';

export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;

export type Model = typeof models.$inferSelect;
export type InsertModel = z.infer<typeof insertModelSchema>;

export type Dimension = typeof dimensions.$inferSelect;
export type InsertDimension = z.infer<typeof insertDimensionSchema>;

export type Question = typeof questions.$inferSelect;
export type InsertQuestion = z.infer<typeof insertQuestionSchema>;

export type Answer = typeof answers.$inferSelect;
export type InsertAnswer = z.infer<typeof insertAnswerSchema>;

export type Assessment = typeof assessments.$inferSelect;
export type InsertAssessment = z.infer<typeof insertAssessmentSchema>;

export type AssessmentResponse = typeof assessmentResponses.$inferSelect;
export type InsertAssessmentResponse = z.infer<typeof insertAssessmentResponseSchema>;

export type Result = typeof results.$inferSelect;
export type InsertResult = z.infer<typeof insertResultSchema>;

export type Benchmark = typeof benchmarks.$inferSelect;
export type InsertBenchmark = z.infer<typeof insertBenchmarkSchema>;

export type Setting = typeof settings.$inferSelect;
export type InsertSetting = z.infer<typeof insertSettingSchema>;

export type AiGeneratedContent = typeof aiGeneratedContent.$inferSelect;
export type InsertAiGeneratedContent = z.infer<typeof insertAiGeneratedContentSchema>;

export type ContentEmbedding = typeof contentEmbeddings.$inferSelect;
export type InsertContentEmbedding = z.infer<typeof insertContentEmbeddingSchema>;

export type AiUsageLog = typeof aiUsageLog.$inferSelect;
export type InsertAiUsageLog = z.infer<typeof insertAiUsageLogSchema>;
