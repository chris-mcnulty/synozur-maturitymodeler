import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, timestamp, json, boolean, unique } from "drizzle-orm/pg-core";
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
  jobTitle: text("job_title"),
  industry: text("industry"),
  country: text("country"),
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
  imageUrl: text("image_url"),
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
  order: integer("order").notNull(),
});

// Answers table
export const answers = pgTable("answers", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  questionId: varchar("question_id").notNull().references(() => questions.id, { onDelete: "cascade" }),
  text: text("text").notNull(),
  score: integer("score").notNull(),
  order: integer("order").notNull(),
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
  answerId: varchar("answer_id").notNull().references(() => answers.id, { onDelete: "cascade" }),
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

// Types
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
