import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, timestamp, json, boolean, unique, index, date } from "drizzle-orm/pg-core";
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
  role: text("role").notNull().default("user"), // 'user', 'tenant_modeler', 'tenant_admin', 'global_admin'
  emailVerified: boolean("email_verified").notNull().default(false),
  verificationToken: varchar("verification_token"),
  verificationTokenExpiry: timestamp("verification_token_expiry"),
  // Multi-tenant fields (nullable for backward compatibility)
  tenantId: varchar("tenant_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  tenantIdx: index("idx_users_tenant").on(table.tenantId),
}));

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
  // Multi-tenant fields (nullable for backward compatibility)
  ownerTenantId: varchar("owner_tenant_id"), // Tenant that owns this model (if private)
  visibility: text("visibility").notNull().default("public"), // 'public', 'private', 'individual'
  modelClass: text("model_class").notNull().default("organizational"), // 'organizational', 'individual'
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  ownerTenantIdx: index("idx_models_owner_tenant").on(table.ownerTenantId),
  visibilityIdx: index("idx_models_visibility").on(table.visibility),
  statusVisibilityIdx: index("idx_models_status_visibility").on(table.status, table.visibility),
}));

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

// Import batches table for tracking data imports
export const importBatches = pgTable("import_batches", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  source: text("source").notNull(), // e.g., "legacy_ai_maturity"
  filename: text("filename"),
  importedBy: varchar("imported_by").notNull().references(() => users.id, { onDelete: "cascade" }),
  assessmentCount: integer("assessment_count").notNull(),
  questionMappings: json("question_mappings").$type<Record<string, string>>(), // External question ID -> internal question UUID
  metadata: json("metadata"), // Additional import context
  createdAt: timestamp("created_at").defaultNow().notNull(),
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
  importBatchId: varchar("import_batch_id").references(() => importBatches.id, { onDelete: "cascade" }), // Null for non-imported data
  // Proxy assessment fields - for admins/modelers to create assessments on behalf of prospects
  isProxy: boolean("is_proxy").notNull().default(false),
  proxyName: text("proxy_name"), // Full name of the prospect
  proxyCompany: text("proxy_company"),
  proxyJobTitle: text("proxy_job_title"),
  proxyIndustry: text("proxy_industry"),
  proxyCompanySize: text("proxy_company_size"),
  proxyCountry: text("proxy_country"),
  // Multi-tenant field (nullable for backward compatibility)
  tenantId: varchar("tenant_id"), // Tenant context for this assessment
}, (table) => ({
  tenantStatusIdx: index("idx_assessments_tenant_status").on(table.tenantId, table.status),
}));

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
  segmentType: text("segment_type").notNull(), // 'overall', 'industry', 'company_size', 'country', 'industry_company_size'
  industry: text("industry"),
  companySize: text("company_size"),
  country: text("country"),
  meanScore: integer("mean_score").notNull(),
  dimensionScores: json("dimension_scores").$type<Record<string, number>>(), // { dimensionKey: avgScore }
  sampleSize: integer("sample_size").notNull(),
  calculatedAt: timestamp("calculated_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  modelSegmentIdx: index("idx_benchmark_model_segment").on(table.modelId, table.segmentType),
}));

// Settings table for admin configurations
export const settings = pgTable("settings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  key: text("key").notNull().unique(),
  value: json("value").notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// ========== MULTI-TENANT TABLES (Phase 1) ==========

// Tenants table
export const tenants = pgTable("tenants", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  logoUrl: text("logo_url"),
  primaryColor: varchar("primary_color", { length: 7 }), // Hex color #RRGGBB
  secondaryColor: varchar("secondary_color", { length: 7 }), // Hex color #RRGGBB
  autoCreateUsers: boolean("auto_create_users").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Tenant domains table - supports multiple domains per tenant
export const tenantDomains = pgTable("tenant_domains", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  domain: text("domain").notNull().unique(), // e.g., 'acme.com'
  verified: boolean("verified").notNull().default(false), // Domain ownership verification
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  tenantDomainIdx: index("idx_tenant_domains_tenant").on(table.tenantId),
  domainIdx: index("idx_tenant_domains_domain").on(table.domain),
}));

// Applications registry (Orion, Nebula, Vega, etc.)
export const applications = pgTable("applications", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  clientKey: text("client_key").notNull().unique(), // e.g., 'nebula', 'orion', 'vega'
  displayName: text("display_name").notNull(),
  description: text("description"),
  logoUrl: text("logo_url"),
  homepageUrl: text("homepage_url"),
  environment: text("environment").notNull().$type<'development' | 'staging' | 'production'>().default('development'),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  clientKeyIdx: index("idx_applications_client_key").on(table.clientKey),
  environmentIdx: index("idx_applications_environment").on(table.environment),
}));

// Application-specific roles (e.g., facilitator for Nebula, modeler for Orion)
export const applicationRoles = pgTable("application_roles", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  applicationId: varchar("application_id").notNull().references(() => applications.id, { onDelete: "cascade" }),
  roleKey: text("role_key").notNull(), // e.g., 'facilitator', 'company_admin'
  scope: text("scope").notNull().$type<'global' | 'tenant'>().default('tenant'),
  displayName: text("display_name").notNull(),
  description: text("description"),
  precedence: integer("precedence").notNull().default(0), // Higher number = higher privilege
  permissions: json("permissions").$type<string[]>(), // Array of permission strings
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  appRoleUnique: unique().on(table.applicationId, table.roleKey),
  applicationIdx: index("idx_application_roles_app").on(table.applicationId),
}));

// Tenant application enablement (replaces/extends tenantEntitlements)
export const tenantApplications = pgTable("tenant_applications", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  applicationId: varchar("application_id").notNull().references(() => applications.id, { onDelete: "cascade" }),
  status: text("status").notNull().$type<'active' | 'suspended' | 'trial'>().default('active'),
  planTier: text("plan_tier").default('basic'), // 'basic', 'pro', 'enterprise'
  seatsLimit: integer("seats_limit"),
  billingAnchorDate: date("billing_anchor_date"),
  expiresAt: timestamp("expires_at"),
  config: json("config").$type<Record<string, any>>(), // App-specific configuration
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  tenantAppUnique: unique().on(table.tenantId, table.applicationId),
  tenantIdx: index("idx_tenant_applications_tenant").on(table.tenantId),
  applicationIdx: index("idx_tenant_applications_app").on(table.applicationId),
}));

// User role assignments per application
export const userApplicationRoles = pgTable("user_application_roles", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  tenantId: varchar("tenant_id").references(() => tenants.id, { onDelete: "cascade" }), // Nullable for global roles
  applicationRoleId: varchar("application_role_id").notNull().references(() => applicationRoles.id, { onDelete: "cascade" }),
  assignedBy: varchar("assigned_by").references(() => users.id, { onDelete: "set null" }),
  assignedAt: timestamp("assigned_at").defaultNow().notNull(),
  expiresAt: timestamp("expires_at"),
}, (table) => ({
  userRoleUnique: unique().on(table.userId, table.applicationRoleId, table.tenantId),
  userIdx: index("idx_user_application_roles_user").on(table.userId),
  tenantIdx: index("idx_user_application_roles_tenant").on(table.tenantId),
  roleIdx: index("idx_user_application_roles_role").on(table.applicationRoleId),
}));

// Keep the original tenantEntitlements for backward compatibility (will migrate data later)
export const tenantEntitlements = pgTable("tenant_entitlements", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  application: text("application").notNull(), // 'orion', 'nebula', 'vega'
  enabled: boolean("enabled").notNull().default(true),
  features: json("features").$type<Record<string, boolean>>(), // Feature flags
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  tenantAppUnique: unique().on(table.tenantId, table.application),
  tenantIdx: index("idx_tenant_entitlements_tenant").on(table.tenantId),
}));

// Model tenant visibility - junction table
export const modelTenants = pgTable("model_tenants", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  modelId: varchar("model_id").notNull().references(() => models.id, { onDelete: "cascade" }),
  tenantId: varchar("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  modelTenantUnique: unique().on(table.modelId, table.tenantId),
  modelIdx: index("idx_model_tenants_model").on(table.modelId),
  tenantIdx: index("idx_model_tenants_tenant").on(table.tenantId),
}));

// OAuth clients for external applications (environment-specific)
export const oauthClients = pgTable("oauth_clients", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  applicationId: varchar("application_id").references(() => applications.id, { onDelete: "cascade" }),
  clientId: varchar("client_id", { length: 255 }).notNull().unique(),
  clientSecretHash: text("client_secret_hash"), // Hashed with bcrypt - null for public clients
  name: text("name").notNull(),
  environment: text("environment").notNull().$type<'development' | 'staging' | 'production'>().default('development'),
  redirectUris: text("redirect_uris").array().notNull(),
  postLogoutRedirectUris: text("post_logout_redirect_uris").array(),
  grantTypes: text("grant_types").array().notNull().default(sql`ARRAY['authorization_code']`),
  pkceRequired: boolean("pkce_required").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  clientIdIdx: index("idx_oauth_clients_client_id").on(table.clientId),
  environmentIdx: index("idx_oauth_clients_environment").on(table.environment),
  applicationIdx: index("idx_oauth_clients_application").on(table.applicationId),
}));

// OAuth authorization codes (temporary codes exchanged for tokens)
export const oauthAuthorizationCodes = pgTable("oauth_authorization_codes", {
  code: text("code").primaryKey(),
  clientId: text("client_id").notNull(),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  redirectUri: text("redirect_uri").notNull(),
  scope: text("scope"),
  codeChallenge: text("code_challenge"), // For PKCE
  codeChallengeMethod: text("code_challenge_method").default('S256'),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  userIdx: index("idx_oauth_codes_user").on(table.userId),
  expiresIdx: index("idx_oauth_codes_expires").on(table.expiresAt),
}));

// OAuth tokens for authentication
export const oauthTokens = pgTable("oauth_tokens", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  clientId: varchar("client_id").notNull().references(() => oauthClients.id, { onDelete: "cascade" }),
  accessTokenHash: text("access_token_hash").notNull(), // Hashed with bcrypt
  refreshTokenHash: text("refresh_token_hash"), // Hashed with bcrypt
  tokenType: text("token_type").notNull().default("Bearer"),
  scopes: text("scopes").array(),
  expiresAt: timestamp("expires_at").notNull(),
  revokedAt: timestamp("revoked_at"),
  rotatedAt: timestamp("rotated_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  userIdx: index("idx_oauth_tokens_user").on(table.userId),
  clientIdx: index("idx_oauth_tokens_client").on(table.clientId),
  expiresIdx: index("idx_oauth_tokens_expires").on(table.expiresAt),
}));

// OAuth User Consents table - stores user consent decisions for OAuth clients
export const oauthUserConsents = pgTable("oauth_user_consents", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  clientId: varchar("client_id").notNull().references(() => oauthClients.id, { onDelete: "cascade" }),
  scopes: text("scopes").array().notNull(), // Normalized, sorted array of approved scopes
  scopesHash: text("scopes_hash").notNull(), // Hash of normalized scopes for quick lookup
  consentedAt: timestamp("consented_at").defaultNow().notNull(),
  lastUsedAt: timestamp("last_used_at").defaultNow().notNull(),
  revokedAt: timestamp("revoked_at"),
}, (table) => ({
  userClientIdx: index("idx_user_consent_user_client").on(table.userId, table.clientId),
  scopesHashIdx: index("idx_user_consent_scopes_hash").on(table.scopesHash),
  userClientScopesUnique: unique("unique_user_client_scopes").on(table.userId, table.clientId, table.scopesHash),
}));

// Tenant audit log for compliance
export const tenantAuditLog = pgTable("tenant_audit_log", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  actorUserId: varchar("actor_user_id").references(() => users.id, { onDelete: "set null" }),
  action: text("action").notNull(), // 'create_user', 'update_model', 'delete_assessment', etc.
  targetType: text("target_type"), // 'user', 'model', 'assessment', etc.
  targetId: varchar("target_id"),
  metadata: json("metadata").$type<Record<string, any>>(), // Additional context
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  tenantIdx: index("idx_tenant_audit_tenant").on(table.tenantId),
  actorIdx: index("idx_tenant_audit_actor").on(table.actorUserId),
  createdIdx: index("idx_tenant_audit_created").on(table.createdAt),
}));

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

export const insertImportBatchSchema = createInsertSchema(importBatches).omit({
  id: true,
  createdAt: true,
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

// AI content review queue table
export const aiContentReviews = pgTable("ai_content_reviews", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  type: text("type").notNull(), // 'interpretation', 'resource', 'improvement', 'answer-rewrite'
  contentType: text("content_type").notNull(), // specific type like 'answer_improvement', 'dimension_resource', etc.
  modelId: varchar("model_id").references(() => models.id, { onDelete: "cascade" }),
  targetId: varchar("target_id"), // ID of the answer/question/dimension this applies to
  generatedContent: json("generated_content").notNull(), // The actual AI-generated content
  metadata: json("metadata"), // Additional context (question text, answer text, etc.)
  status: text("status").notNull().default("pending"), // 'pending', 'approved', 'rejected'
  createdBy: varchar("created_by").notNull().references(() => users.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  reviewedBy: varchar("reviewed_by").references(() => users.id, { onDelete: "set null" }),
  reviewedAt: timestamp("reviewed_at"),
  rejectionReason: text("rejection_reason"),
}, (table) => ({
  statusIdx: index("idx_ai_review_status").on(table.status),
  createdByIdx: index("idx_ai_review_creator").on(table.createdBy),
  modelIdx: index("idx_ai_review_model").on(table.modelId),
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

export const insertAiContentReviewSchema = createInsertSchema(aiContentReviews).omit({
  id: true,
  createdAt: true,
  reviewedAt: true,
});

// Knowledge documents table for company-wide and model-specific reference materials
export const knowledgeDocuments = pgTable("knowledge_documents", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  fileUrl: text("file_url").notNull(),
  fileSize: integer("file_size").notNull(), // in bytes
  fileType: text("file_type").notNull(), // pdf, docx, doc, txt, md
  scope: text("scope").notNull(), // company-wide, model-specific
  modelId: varchar("model_id").references(() => models.id, { onDelete: "cascade" }), // null for company-wide docs
  description: text("description"),
  uploadedBy: varchar("uploaded_by").notNull().references(() => users.id, { onDelete: "cascade" }),
  uploadedAt: timestamp("uploaded_at").defaultNow().notNull(),
});

export const insertKnowledgeDocumentSchema = createInsertSchema(knowledgeDocuments).omit({
  id: true,
  uploadedAt: true,
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

export type AiContentReview = typeof aiContentReviews.$inferSelect;
export type InsertAiContentReview = z.infer<typeof insertAiContentReviewSchema>;

export type ImportBatch = typeof importBatches.$inferSelect;
export type InsertImportBatch = z.infer<typeof insertImportBatchSchema>;

export type KnowledgeDocument = typeof knowledgeDocuments.$inferSelect;
export type InsertKnowledgeDocument = z.infer<typeof insertKnowledgeDocumentSchema>;

// Model export/import file format (.model files)
export const modelExportFormatSchema = z.object({
  formatVersion: z.union([z.string(), z.number()]).transform(v => String(v)),
  exportedAt: z.string().optional(),
  model: z.object({
    name: z.string(),
    slug: z.string(),
    description: z.string(),
    version: z.string(),
    estimatedTime: z.string().nullable().optional(),
    status: z.string(),
    featured: z.boolean().optional().default(false),
    imageUrl: z.string().nullable().optional(),
    maturityScale: z.array(z.object({
      id: z.union([z.string(), z.number()]).transform(v => String(v)),
      name: z.string(),
      description: z.string(),
      minScore: z.number(),
      maxScore: z.number(),
    })).nullable().optional(),
    generalResources: z.array(z.object({
      id: z.union([z.string(), z.number()]).transform(v => String(v)),
      title: z.string(),
      description: z.string().optional(),
      link: z.string().optional(),
    })).nullable().optional(),
  }),
  dimensions: z.array(z.object({
    key: z.string(),
    label: z.string(),
    description: z.string().nullable().optional(),
    order: z.number(),
  })),
  questions: z.array(z.object({
    dimensionKey: z.string().nullable().optional(),
    text: z.string(),
    type: z.string(),
    order: z.number(),
    minValue: z.number().nullable().optional(),
    maxValue: z.number().nullable().optional(),
    unit: z.string().nullable().optional(),
    placeholder: z.string().nullable().optional(),
    improvementStatement: z.string().nullable().optional(),
    resourceTitle: z.string().nullable().optional(),
    resourceLink: z.string().nullable().optional(),
    resourceDescription: z.string().nullable().optional(),
    answers: z.array(z.object({
      text: z.string(),
      score: z.number(),
      order: z.number(),
      improvementStatement: z.string().nullable().optional(),
      resourceTitle: z.string().nullable().optional(),
      resourceLink: z.string().nullable().optional(),
      resourceDescription: z.string().nullable().optional(),
    })),
  })),
});

export type ModelExportFormat = z.infer<typeof modelExportFormatSchema>;

// ========== OAUTH IDENTITY PROVIDER INSERT SCHEMAS ==========

export const insertApplicationSchema = createInsertSchema(applications).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertApplicationRoleSchema = createInsertSchema(applicationRoles).omit({
  id: true,
  createdAt: true,
});

export const insertTenantApplicationSchema = createInsertSchema(tenantApplications).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertUserApplicationRoleSchema = createInsertSchema(userApplicationRoles).omit({
  id: true,
  assignedAt: true,
});

export const insertOauthAuthorizationCodeSchema = createInsertSchema(oauthAuthorizationCodes).omit({
  createdAt: true,
});

// ========== MULTI-TENANT INSERT SCHEMAS ==========

// Hex color regex: #RRGGBB or #RGB
const hexColorRegex = /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/;

export const insertTenantSchema = createInsertSchema(tenants).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  name: z.string().min(1, "Tenant name is required").max(255),
  logoUrl: z.string().url("Invalid URL format").max(500).nullable().or(z.literal('')).transform(val => val === '' ? null : val),
  primaryColor: z.string().regex(hexColorRegex, "Invalid hex color format (e.g., #810FFB)").nullable().or(z.literal('')).transform(val => val === '' ? null : val),
  secondaryColor: z.string().regex(hexColorRegex, "Invalid hex color format (e.g., #E60CB3)").nullable().or(z.literal('')).transform(val => val === '' ? null : val),
});

export const insertTenantDomainSchema = createInsertSchema(tenantDomains).omit({
  id: true,
  createdAt: true,
}).extend({
  domain: z.string().min(1, "Domain is required").max(255).regex(/^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/, "Invalid domain format"),
});

export const insertTenantEntitlementSchema = createInsertSchema(tenantEntitlements).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertModelTenantSchema = createInsertSchema(modelTenants).omit({
  id: true,
  createdAt: true,
});

export const insertOauthClientSchema = createInsertSchema(oauthClients).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertOauthTokenSchema = createInsertSchema(oauthTokens).omit({
  id: true,
  createdAt: true,
});

export const insertOauthUserConsentSchema = createInsertSchema(oauthUserConsents).omit({
  id: true,
  consentedAt: true,
  lastUsedAt: true,
});

export const insertTenantAuditLogSchema = createInsertSchema(tenantAuditLog).omit({
  id: true,
  createdAt: true,
});

// TypeScript types for OAuth Identity Provider
export type Application = typeof applications.$inferSelect;
export type InsertApplication = z.infer<typeof insertApplicationSchema>;

export type ApplicationRole = typeof applicationRoles.$inferSelect;
export type InsertApplicationRole = z.infer<typeof insertApplicationRoleSchema>;

export type TenantApplication = typeof tenantApplications.$inferSelect;
export type InsertTenantApplication = z.infer<typeof insertTenantApplicationSchema>;

export type UserApplicationRole = typeof userApplicationRoles.$inferSelect;
export type InsertUserApplicationRole = z.infer<typeof insertUserApplicationRoleSchema>;

export type OauthAuthorizationCode = typeof oauthAuthorizationCodes.$inferSelect;
export type InsertOauthAuthorizationCode = z.infer<typeof insertOauthAuthorizationCodeSchema>;

export type OauthUserConsent = typeof oauthUserConsents.$inferSelect;
export type InsertOauthUserConsent = z.infer<typeof insertOauthUserConsentSchema>;

// TypeScript types for multi-tenant tables
export type Tenant = typeof tenants.$inferSelect;
export type InsertTenant = z.infer<typeof insertTenantSchema>;

export type TenantDomain = typeof tenantDomains.$inferSelect;
export type InsertTenantDomain = z.infer<typeof insertTenantDomainSchema>;

export type TenantEntitlement = typeof tenantEntitlements.$inferSelect;
export type InsertTenantEntitlement = z.infer<typeof insertTenantEntitlementSchema>;

export type ModelTenant = typeof modelTenants.$inferSelect;
export type InsertModelTenant = z.infer<typeof insertModelTenantSchema>;

export type OauthClient = typeof oauthClients.$inferSelect;
export type InsertOauthClient = z.infer<typeof insertOauthClientSchema>;

export type OauthToken = typeof oauthTokens.$inferSelect;
export type InsertOauthToken = z.infer<typeof insertOauthTokenSchema>;

export type TenantAuditLog = typeof tenantAuditLog.$inferSelect;
export type InsertTenantAuditLog = z.infer<typeof insertTenantAuditLogSchema>;
