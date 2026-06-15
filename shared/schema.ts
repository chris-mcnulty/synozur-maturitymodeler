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
  // SSO fields
  ssoProvider: text("sso_provider"), // 'microsoft', 'google', etc.
  ssoProviderId: text("sso_provider_id"), // The provider's unique user ID (e.g., Azure AD oid)
  // Multi-tenant fields (nullable for backward compatibility)
  tenantId: varchar("tenant_id"),
  lastDismissedChangelogVersion: text("last_dismissed_changelog_version"),
  // Email notification preferences
  monthlyDigestOptOut: boolean("monthly_digest_opt_out").notNull().default(true),
  lastMonthlyDigestSentAt: timestamp("last_monthly_digest_sent_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  tenantIdx: index("idx_users_tenant").on(table.tenantId),
  ssoProviderIdx: index("idx_users_sso_provider").on(table.ssoProvider, table.ssoProviderId),
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
  allowAnonymousResults: boolean("allow_anonymous_results").notNull().default(false), // Whether to allow viewing results without login
  hideScoreAndNarratives: boolean("hide_score_and_narratives").notNull().default(false), // When true, results show only the maturity level name — no numeric score or narrative interpretations
  imageUrl: text("image_url"),
  // Maturity scale configuration (JSONB array of levels)
  // scoringMethod: 'average' (default) averages answer scores, 'sum' adds them
  maturityScale: json("maturity_scale").$type<Array<{
    id: string;
    name: string;
    description: string;
    minScore: number;
    maxScore: number;
  }> & { scoringMethod?: 'average' | 'sum' }>(),
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
  // Assessment scoring mode: 'scored' = numeric maturity score (default);
  // 'type' = archetype/propensity quiz that categorizes the respondent into one
  // of several model types (each answer votes for a type) rather than a score.
  assessmentMode: text("assessment_mode").notNull().default("scored"), // 'scored', 'type'
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
  // For 'type' assessment-mode models: the model type (archetype) this answer
  // votes for, referenced by key. Null for normal scored models.
  typeKey: text("type_key"),
  // Optional improvement guidance for PDF reports
  improvementStatement: text("improvement_statement"),
  resourceTitle: text("resource_title"),
  resourceLink: text("resource_link"),
  resourceDescription: text("resource_description"),
}, (table) => ({
  questionIdIdx: index("idx_answers_question_id").on(table.questionId),
}));

// Model types (archetypes) — used by 'type' assessment-mode models. Each answer
// in a type model votes for one of these via answers.typeKey; the most-voted
// type becomes the respondent's result.
export const modelTypes = pgTable("model_types", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  modelId: varchar("model_id").notNull().references(() => models.id, { onDelete: "cascade" }),
  key: text("key").notNull(), // Stable identifier within the model (e.g. 'visionary')
  name: text("name").notNull(), // Display name (e.g. 'The Visionary')
  tagline: text("tagline"),
  description: text("description"),
  superpowers: text("superpowers").array(), // Bullet list of strengths
  proTip: text("pro_tip"),
  imageUrl: text("image_url"),
  order: integer("order").notNull().default(0),
}, (table) => ({
  modelIdIdx: index("idx_model_types_model_id").on(table.modelId),
}));

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
  startedAtIdx: index("idx_assessments_started_at").on(table.startedAt),
  completedAtIdx: index("idx_assessments_completed_at").on(table.completedAt),
  modelIdIdx: index("idx_assessments_model_id").on(table.modelId),
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
  assessmentIdIdx: index("idx_assessment_responses_assessment_id").on(table.assessmentId),
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
  faviconUrl: text("favicon_url"),
  primaryColor: varchar("primary_color", { length: 7 }), // Hex color #RRGGBB
  secondaryColor: varchar("secondary_color", { length: 7 }), // Hex color #RRGGBB (legacy)
  accentColor: varchar("accent_color", { length: 7 }), // Hex color #RRGGBB
  emailFromName: varchar("email_from_name", { length: 100 }), // Display name used in tenant-scoped email "From" headers
  autoCreateUsers: boolean("auto_create_users").notNull().default(false),
  // SSO Provisioning settings
  allowUserSelfProvisioning: boolean("allow_user_self_provisioning").notNull().default(true), // Allow users to auto-provision via SSO when domain matches
  syncToHubSpot: boolean("sync_to_hubspot").notNull().default(false), // Sync new accounts to HubSpot (opt-in per tenant)
  monthlyDigestEnabled: boolean("monthly_digest_enabled").notNull().default(true), // Master switch: when false, no users in this tenant receive the monthly digest
  collectProfileData: boolean("collect_profile_data").notNull().default(true), // Prompt new SSO users for profile info; if false, tenant defaults are applied and only job title is collected
  inviteOnly: boolean("invite_only").notNull().default(false), // If true, users can only join via explicit invitation (for public domains)
  // Directory defaults — pre-fill profile fields for new SSO-provisioned users
  defaultCompany: text("default_company"),
  defaultIndustry: text("default_industry"),
  defaultCountry: text("default_country"),
  defaultCompanySize: text("default_company_size"),
  // Azure AD / Entra ID integration
  ssoTenantId: text("sso_tenant_id"), // Azure AD tenant ID (tid claim) for this organization
  ssoAdminConsentGranted: boolean("sso_admin_consent_granted").notNull().default(false), // Whether org-wide admin consent has been granted
  showChangelogOnLogin: boolean("show_changelog_on_login").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  ssoTenantIdx: index("idx_tenants_sso_tenant").on(table.ssoTenantId),
}));

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

export const insertModelTypeSchema = createInsertSchema(modelTypes).omit({
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

// Assessment tags table for categorizing and grouping assessments
export const assessmentTags = pgTable("assessment_tags", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull().unique(),
  color: varchar("color", { length: 7 }).notNull().default("#6366f1"), // Hex color for UI display
  description: text("description"),
  createdBy: varchar("created_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Assessment tag assignments - junction table
export const assessmentTagAssignments = pgTable("assessment_tag_assignments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  assessmentId: varchar("assessment_id").notNull().references(() => assessments.id, { onDelete: "cascade" }),
  tagId: varchar("tag_id").notNull().references(() => assessmentTags.id, { onDelete: "cascade" }),
  assignedBy: varchar("assigned_by").references(() => users.id, { onDelete: "set null" }),
  assignedAt: timestamp("assigned_at").defaultNow().notNull(),
}, (table) => ({
  uniqueAssessmentTag: unique().on(table.assessmentId, table.tagId),
  assessmentIdx: index("idx_tag_assignments_assessment").on(table.assessmentId),
  tagIdx: index("idx_tag_assignments_tag").on(table.tagId),
}));

export const insertAssessmentTagSchema = createInsertSchema(assessmentTags).omit({
  id: true,
  createdAt: true,
});

export const insertAssessmentTagAssignmentSchema = createInsertSchema(assessmentTagAssignments).omit({
  id: true,
  assignedAt: true,
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
export type ModelType = typeof modelTypes.$inferSelect;
export type InsertModelType = z.infer<typeof insertModelTypeSchema>;
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
    allowAnonymousResults: z.boolean().optional().default(false),
    hideScoreAndNarratives: z.boolean().optional().default(false),
    assessmentMode: z.string().optional().default("scored"),
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
  // Archetype definitions for 'type' assessment-mode models.
  types: z.array(z.object({
    key: z.string(),
    name: z.string(),
    tagline: z.string().nullable().optional(),
    description: z.string().nullable().optional(),
    superpowers: z.array(z.string()).nullable().optional(),
    proTip: z.string().nullable().optional(),
    imageUrl: z.string().nullable().optional(),
    order: z.number().optional().default(0),
  })).optional(),
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
      typeKey: z.string().nullable().optional(),
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

// Accept absolute URLs OR object-storage relative paths like /objects/...
const logoOrFaviconSchema = z
  .string()
  .max(500)
  .refine(
    (val) => val === '' || val.startsWith('/objects/') || /^https?:\/\//.test(val),
    "Must be a URL or an object-storage path"
  )
  .nullable()
  .or(z.literal(''))
  .transform(val => val === '' ? null : val);

export const insertTenantSchema = createInsertSchema(tenants).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  name: z.string().min(1, "Tenant name is required").max(255),
  logoUrl: logoOrFaviconSchema,
  faviconUrl: logoOrFaviconSchema,
  primaryColor: z.string().regex(hexColorRegex, "Invalid hex color format (e.g., #810FFB)").nullable().or(z.literal('')).transform(val => val === '' ? null : val),
  secondaryColor: z.string().regex(hexColorRegex, "Invalid hex color format (e.g., #E60CB3)").nullable().or(z.literal('')).transform(val => val === '' ? null : val),
  accentColor: z.string().regex(hexColorRegex, "Invalid hex color format (e.g., #E60CB3)").nullable().or(z.literal('')).transform(val => val === '' ? null : val),
  emailFromName: z.string().max(100).nullable().or(z.literal('')).transform(val => val === '' ? null : val),
});

// Branding-only update schema (subset, used by tenant_admin's branding endpoint)
export const tenantBrandingSchema = z.object({
  logoUrl: logoOrFaviconSchema.optional(),
  faviconUrl: logoOrFaviconSchema.optional(),
  primaryColor: z.string().regex(hexColorRegex, "Invalid hex color format (e.g., #810FFB)").nullable().or(z.literal('')).transform(val => val === '' ? null : val).optional(),
  accentColor: z.string().regex(hexColorRegex, "Invalid hex color format (e.g., #E60CB3)").nullable().or(z.literal('')).transform(val => val === '' ? null : val).optional(),
  emailFromName: z.string().max(100).nullable().or(z.literal('')).transform(val => val === '' ? null : val).optional(),
});

export type TenantBranding = z.infer<typeof tenantBrandingSchema>;

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

// TypeScript types for assessment tags
export type AssessmentTag = typeof assessmentTags.$inferSelect;
export type InsertAssessmentTag = z.infer<typeof insertAssessmentTagSchema>;

export type AssessmentTagAssignment = typeof assessmentTagAssignments.$inferSelect;
export type InsertAssessmentTagAssignment = z.infer<typeof insertAssessmentTagAssignmentSchema>;

// Model access requests - for customers to request access to private models
export const modelAccessRequests = pgTable("model_access_requests", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  modelId: varchar("model_id").notNull().references(() => models.id, { onDelete: "cascade" }),
  // Requestor info (filled from profile or manually entered)
  requestorName: text("requestor_name").notNull(),
  requestorEmail: text("requestor_email").notNull(),
  organizationName: text("organization_name").notNull(),
  organizationDomain: text("organization_domain"), // extracted from email
  // Linked tenant/SSO info if available at request time
  tenantId: varchar("tenant_id").references(() => tenants.id, { onDelete: "set null" }),
  ssoTenantId: text("sso_tenant_id"), // Azure AD tenant ID if available
  adminConsentGranted: boolean("admin_consent_granted").notNull().default(false),
  // Optional message from requestor
  message: text("message"),
  // Status lifecycle
  status: text("status").notNull().default("pending"), // 'pending' | 'approved' | 'denied'
  requestedAt: timestamp("requested_at").defaultNow().notNull(),
  reviewedAt: timestamp("reviewed_at"),
  reviewedBy: varchar("reviewed_by").references(() => users.id, { onDelete: "set null" }),
  denialReason: text("denial_reason"),
}, (table) => ({
  modelIdx: index("idx_access_requests_model").on(table.modelId),
  tenantIdx: index("idx_access_requests_tenant").on(table.tenantId),
  statusIdx: index("idx_access_requests_status").on(table.status),
  emailIdx: index("idx_access_requests_email").on(table.requestorEmail),
}));

export const insertModelAccessRequestSchema = createInsertSchema(modelAccessRequests).omit({
  id: true,
  requestedAt: true,
  reviewedAt: true,
});

export type ModelAccessRequest = typeof modelAccessRequests.$inferSelect;
export type InsertModelAccessRequest = z.infer<typeof insertModelAccessRequestSchema>;

// Traffic visits table for analytics
export const trafficVisits = pgTable("traffic_visits", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  page: text("page").notNull(), // 'homepage', 'signup', 'login'
  visitedAt: timestamp("visited_at").defaultNow().notNull(),
  country: text("country"), // ISO country code from geoip
  deviceType: text("device_type"), // 'desktop', 'mobile', 'tablet'
  browser: text("browser"), // Browser name
  browserVersion: text("browser_version"),
  os: text("os"), // Operating system
  referrer: text("referrer"), // Referrer URL
  ipHash: text("ip_hash"), // Hashed IP for uniqueness without PII
}, (table) => ({
  pageIdx: index("idx_traffic_page").on(table.page),
  visitedAtIdx: index("idx_traffic_visited_at").on(table.visitedAt),
  countryIdx: index("idx_traffic_country").on(table.country),
}));

export const insertTrafficVisitSchema = createInsertSchema(trafficVisits).omit({
  id: true,
  visitedAt: true,
});

export type TrafficVisit = typeof trafficVisits.$inferSelect;
export type InsertTrafficVisit = z.infer<typeof insertTrafficVisitSchema>;

// SSO Auth States table for production-ready session management
export const ssoAuthStates = pgTable("sso_auth_states", {
  state: varchar("state").primaryKey(), // The OAuth state parameter (UUID)
  codeVerifier: text("code_verifier").notNull(), // PKCE code verifier
  redirectUrl: text("redirect_url"), // Optional return URL after auth
  expiresAt: timestamp("expires_at").notNull(), // When this state expires (10 minutes)
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  expiresAtIdx: index("idx_sso_auth_states_expires").on(table.expiresAt),
}));

export const insertSsoAuthStateSchema = createInsertSchema(ssoAuthStates).omit({
  createdAt: true,
});

export type SsoAuthState = typeof ssoAuthStates.$inferSelect;
export type InsertSsoAuthState = z.infer<typeof insertSsoAuthStateSchema>;

// ========== GALAXY CLIENT PORTAL ==========

// Per-tenant policy controlling what Galaxy can see/do for a tenant.
// Stored as a single row per tenant (master toggle + per-type toggles +
// per-artifact selection + audience scope). Webhook configuration lives in
// galaxyWebhooks; per-API-call records live in galaxyAuditLog.
export const galaxyExposurePolicies = pgTable("galaxy_exposure_policies", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id").notNull().unique().references(() => tenants.id, { onDelete: "cascade" }),
  enabled: boolean("enabled").notNull().default(false),
  // Per-artifact-type toggles
  exposeAssessments: boolean("expose_assessments").notNull().default(true),
  exposeResults: boolean("expose_results").notNull().default(true),
  exposeRecommendations: boolean("expose_recommendations").notNull().default(true),
  exposeInsights: boolean("expose_insights").notNull().default(true),
  exposeCertificates: boolean("expose_certificates").notNull().default(false),
  exposeCourses: boolean("expose_courses").notNull().default(true),
  exposeAttestations: boolean("expose_attestations").notNull().default(true),
  // Per-artifact selection: explicit allowlist of model IDs the tenant has
  // chosen to expose. Empty array = "no models exposed"; null = "all
  // tenant-visible models exposed".
  exposedModelIds: text("exposed_model_ids").array(),
  // Audience scope: 'all' = every user in tenant, 'roles' = userRoles[].
  audienceMode: text("audience_mode").notNull().default("all"),
  audienceRoles: text("audience_roles").array(),
  audienceTags: text("audience_tags").array(),
  // Allowed CORS origins for the Galaxy app talking to this tenant
  allowedOrigins: text("allowed_origins").array(),
  // Per-tenant rate limit (requests/minute per user). 0 = use default.
  rateLimitPerMinute: integer("rate_limit_per_minute").notNull().default(120),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  tenantIdx: index("idx_galaxy_policy_tenant").on(table.tenantId),
}));

// Outbound webhook registrations. One row per tenant; secret rotation
// produces a new value but reuses the same row.
export const galaxyWebhooks = pgTable("galaxy_webhooks", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id").notNull().unique().references(() => tenants.id, { onDelete: "cascade" }),
  url: text("url").notNull(),
  signingSecret: text("signing_secret").notNull(),
  active: boolean("active").notNull().default(true),
  // Subscribed event keys, e.g. ['assessment.completed','attestation.signed']
  events: text("events").array(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  tenantIdx: index("idx_galaxy_webhooks_tenant").on(table.tenantId),
}));

// Each attempt to deliver a Galaxy event to a tenant's webhook.
// Used to power the "Galaxy Activity" admin view and the redeliver action.
export const galaxyWebhookDeliveries = pgTable("galaxy_webhook_deliveries", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  webhookId: varchar("webhook_id").references(() => galaxyWebhooks.id, { onDelete: "cascade" }),
  eventType: text("event_type").notNull(),
  payload: json("payload").notNull(),
  status: text("status").notNull().default("pending"), // pending, delivered, failed
  attemptCount: integer("attempt_count").notNull().default(0),
  responseStatus: integer("response_status"),
  responseBody: text("response_body"),
  lastError: text("last_error"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  deliveredAt: timestamp("delivered_at"),
}, (table) => ({
  tenantIdx: index("idx_galaxy_deliveries_tenant").on(table.tenantId),
  statusIdx: index("idx_galaxy_deliveries_status").on(table.status),
  createdIdx: index("idx_galaxy_deliveries_created").on(table.createdAt),
}));

// Immutable audit log of sensitive Galaxy reads (assessment results,
// certificates, attestations). Append-only; never updated.
export const galaxyAuditLog = pgTable("galaxy_audit_log", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  userId: varchar("user_id").references(() => users.id, { onDelete: "set null" }),
  clientId: varchar("client_id"), // OAuth client id string (e.g. 'galaxy')
  requestId: text("request_id"),
  method: text("method").notNull(),
  path: text("path").notNull(),
  scopes: text("scopes").array(),
  resourceType: text("resource_type"), // 'assessment','result','certificate', etc.
  resourceId: text("resource_id"),
  status: integer("status").notNull(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  tenantIdx: index("idx_galaxy_audit_tenant").on(table.tenantId),
  createdIdx: index("idx_galaxy_audit_created").on(table.createdAt),
  resourceIdx: index("idx_galaxy_audit_resource").on(table.resourceType, table.resourceId),
}));

// Cluster-wide rate-limit counters for the Galaxy API. Each row represents
// one fixed-window bucket keyed by `key` (typically `${tenantId}:${userId}`).
// Counters are incremented atomically via INSERT ... ON CONFLICT DO UPDATE so
// the limit is enforced consistently across multiple Orion app instances.
export const galaxyRateLimits = pgTable("galaxy_rate_limits", {
  key: text("key").primaryKey(),
  count: integer("count").notNull().default(0),
  resetAt: timestamp("reset_at").notNull(),
});

// ========== GALAXY: PORTAL KEYS ==========
// Static API keys issued to external portals (e.g. synozur-baseline marketing site).
// Unlike user-scoped OAuth tokens, these are domain-scoped umbrella keys that
// expose aggregate/tenant-level data without requiring a per-user login.
export const galaxyPortalKeys = pgTable("galaxy_portal_keys", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  label: text("label").notNull(),
  keyHash: text("key_hash").notNull().unique(), // SHA-256 of the raw secret
  allowedDomains: text("allowed_domains").array().notNull().default(sql`'{}'::text[]`),
  allowedOrigins: text("allowed_origins").array().notNull().default(sql`'{}'::text[]`),
  isActive: boolean("is_active").notNull().default(true),
  createdBy: varchar("created_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  lastUsedAt: timestamp("last_used_at"),
}, (table) => ({
  keyHashIdx: index("idx_galaxy_portal_keys_hash").on(table.keyHash),
  activeIdx: index("idx_galaxy_portal_keys_active").on(table.isActive),
}));

export const insertGalaxyPortalKeySchema = createInsertSchema(galaxyPortalKeys).omit({
  id: true,
  keyHash: true,
  createdAt: true,
  lastUsedAt: true,
});
export type GalaxyPortalKey = typeof galaxyPortalKeys.$inferSelect;
export type InsertGalaxyPortalKey = z.infer<typeof insertGalaxyPortalKeySchema>;

export const insertGalaxyExposurePolicySchema = createInsertSchema(galaxyExposurePolicies).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertGalaxyWebhookSchema = createInsertSchema(galaxyWebhooks).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const galaxyPolicyUpdateSchema = z.object({
  enabled: z.boolean().optional(),
  exposeAssessments: z.boolean().optional(),
  exposeResults: z.boolean().optional(),
  exposeRecommendations: z.boolean().optional(),
  exposeInsights: z.boolean().optional(),
  exposeCertificates: z.boolean().optional(),
  exposeCourses: z.boolean().optional(),
  exposeAttestations: z.boolean().optional(),
  exposedModelIds: z.array(z.string()).nullable().optional(),
  audienceMode: z.enum(['all', 'roles']).optional(),
  audienceRoles: z.array(z.string()).nullable().optional(),
  audienceTags: z.array(z.string()).nullable().optional(),
  allowedOrigins: z.array(z.string().url()).nullable().optional(),
  rateLimitPerMinute: z.number().int().min(0).max(10000).optional(),
});

export const galaxyWebhookUpdateSchema = z.object({
  url: z.string().url(),
  events: z.array(z.string()).optional(),
  active: z.boolean().optional(),
});

export type GalaxyExposurePolicy = typeof galaxyExposurePolicies.$inferSelect;
export type InsertGalaxyExposurePolicy = z.infer<typeof insertGalaxyExposurePolicySchema>;
export type GalaxyWebhook = typeof galaxyWebhooks.$inferSelect;
export type InsertGalaxyWebhook = z.infer<typeof insertGalaxyWebhookSchema>;
export type GalaxyWebhookDelivery = typeof galaxyWebhookDeliveries.$inferSelect;
export type GalaxyAuditLog = typeof galaxyAuditLog.$inferSelect;

// Galaxy OAuth scope constants. Source of truth for both the IdP and the
// Galaxy API middleware.
export const GALAXY_SCOPES = [
  'galaxy_portal',
  'artifacts.read',
  'artifacts.write',
  'assessments.read',
  'assessments.write',
  'courses.read',
  'courses.write',
  'attestations.read',
  'attestations.write',
  'insights.read',
  'admin.directory.read',
] as const;
export type GalaxyScope = typeof GALAXY_SCOPES[number];

export const GALAXY_EVENT_TYPES = [
  'assessment.completed',
  'course.completed',
  'attestation.signed',
  'certificate.issued',
  'recommendation.created',
] as const;
export type GalaxyEventType = typeof GALAXY_EVENT_TYPES[number];

// ========== GALAXY: ATTESTATIONS, CERTIFICATES ==========
//
// Galaxy reuses the existing learning-courses module (see below) for course
// data and enrollments. The entities defined here are Galaxy-specific:
//   - galaxyAttestations / galaxyAttestationSignatures: standalone tenant
//     statements that users in the Galaxy audience sign (policy acks, code
//     of conduct, etc). This is distinct from per-lesson `attestationRecords`
//     used inside a course.
//   - certificates: cross-source proof-of-completion artefacts (assessment,
//     course, attestation, or manual issuance) surfaced to Galaxy.

export const galaxyAttestations = pgTable("galaxy_attestations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  body: text("body").notNull(),
  version: text("version").notNull().default("1.0"),
  // 'active' | 'retired'
  status: text("status").notNull().default("active"),
  // Optional per-resource audience gate. null/empty = visible to the whole
  // tenant audience (subject to galaxyExposurePolicies.audienceRoles).
  audienceRoles: text("audience_roles").array(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  tenantIdx: index("idx_galaxy_attestations_tenant").on(table.tenantId),
  statusIdx: index("idx_galaxy_attestations_status").on(table.status),
}));

export const galaxyAttestationSignatures = pgTable("galaxy_attestation_signatures", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  attestationId: varchar("attestation_id").notNull().references(() => galaxyAttestations.id, { onDelete: "cascade" }),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  tenantId: varchar("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  signedAt: timestamp("signed_at").defaultNow().notNull(),
  signatureText: text("signature_text"),
  ipAddress: text("ip_address"),
}, (table) => ({
  uniqueAttestationUser: unique().on(table.attestationId, table.userId),
  userIdx: index("idx_galaxy_attestation_sigs_user").on(table.userId),
  tenantIdx: index("idx_galaxy_attestation_sigs_tenant").on(table.tenantId),
}));

export const certificates = pgTable("certificates", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  // 'assessment' | 'course' | 'attestation' | 'manual'
  sourceType: text("source_type").notNull(),
  sourceId: varchar("source_id"),
  modelId: varchar("model_id").references(() => models.id, { onDelete: "set null" }),
  title: text("title").notNull(),
  serialNumber: text("serial_number").notNull().unique(),
  issuedAt: timestamp("issued_at").defaultNow().notNull(),
  expiresAt: timestamp("expires_at"),
  pdfUrl: text("pdf_url"),
  revokedAt: timestamp("revoked_at"),
}, (table) => ({
  tenantIdx: index("idx_certificates_tenant").on(table.tenantId),
  userIdx: index("idx_certificates_user").on(table.userId),
  sourceIdx: index("idx_certificates_source").on(table.sourceType, table.sourceId),
  // Idempotency: at most one certificate per (tenant, user, sourceType,
  // sourceId). Postgres treats NULL as distinct, so 'manual' rows with
  // sourceId=null are unaffected.
  uniqSource: unique("uniq_certificates_source").on(
    table.tenantId, table.userId, table.sourceType, table.sourceId,
  ),
}));

export const insertGalaxyAttestationSchema = createInsertSchema(galaxyAttestations).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export const insertGalaxyAttestationSignatureSchema = createInsertSchema(galaxyAttestationSignatures).omit({
  id: true,
  signedAt: true,
});
export const insertCertificateSchema = createInsertSchema(certificates).omit({
  id: true,
  issuedAt: true,
  serialNumber: true,
});

export type GalaxyAttestation = typeof galaxyAttestations.$inferSelect;
export type InsertGalaxyAttestation = z.infer<typeof insertGalaxyAttestationSchema>;
export type GalaxyAttestationSignature = typeof galaxyAttestationSignatures.$inferSelect;
export type InsertGalaxyAttestationSignature = z.infer<typeof insertGalaxyAttestationSignatureSchema>;
export type Certificate = typeof certificates.$inferSelect;
export type InsertCertificate = z.infer<typeof insertCertificateSchema>;

// ========== SUPPORT TICKET SYSTEM ==========

export const TICKET_CATEGORIES = ['bug', 'feature_request', 'question', 'feedback'] as const;
export const TICKET_PRIORITIES = ['low', 'medium', 'high'] as const;
export const TICKET_STATUSES = ['open', 'in_progress', 'resolved', 'closed'] as const;

export type TicketCategory = typeof TICKET_CATEGORIES[number];
export type TicketPriority = typeof TICKET_PRIORITIES[number];
export type TicketStatus = typeof TICKET_STATUSES[number];

export const supportTickets = pgTable("support_tickets", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  ticketNumber: integer("ticket_number").notNull(),
  tenantId: varchar("tenant_id"),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  category: text("category").notNull().$type<TicketCategory>(),
  subject: text("subject").notNull(),
  description: text("description").notNull(),
  priority: text("priority").notNull().$type<TicketPriority>().default('medium'),
  status: text("status").notNull().$type<TicketStatus>().default('open'),
  assignedTo: varchar("assigned_to").references(() => users.id, { onDelete: "set null" }),
  metadata: json("metadata").$type<Record<string, any>>(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  resolvedAt: timestamp("resolved_at"),
  resolvedBy: varchar("resolved_by").references(() => users.id, { onDelete: "set null" }),
}, (table) => ({
  tenantIdx: index("idx_support_tickets_tenant").on(table.tenantId),
  userIdx: index("idx_support_tickets_user").on(table.userId),
  statusIdx: index("idx_support_tickets_status").on(table.status),
  ticketNumberIdx: index("idx_support_tickets_number").on(table.ticketNumber),
}));

export const supportTicketReplies = pgTable("support_ticket_replies", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  ticketId: varchar("ticket_id").notNull().references(() => supportTickets.id, { onDelete: "cascade" }),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  message: text("message").notNull(),
  isInternal: boolean("is_internal").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  ticketIdx: index("idx_support_replies_ticket").on(table.ticketId),
  userIdx: index("idx_support_replies_user").on(table.userId),
}));

export const supportTicketPlannerSync = pgTable("support_ticket_planner_sync", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  ticketId: varchar("ticket_id").notNull().references(() => supportTickets.id, { onDelete: "cascade" }),
  tenantId: varchar("tenant_id").notNull(),
  planId: text("plan_id").notNull(),
  taskId: text("task_id").notNull(),
  taskTitle: text("task_title").notNull(),
  bucketId: text("bucket_id"),
  bucketName: text("bucket_name"),
  syncStatus: text("sync_status").notNull().default('synced'),
  syncError: text("sync_error"),
  remoteEtag: text("remote_etag"),
  lastSyncedAt: timestamp("last_synced_at").defaultNow().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  ticketIdx: index("idx_planner_sync_ticket").on(table.ticketId),
  tenantIdx: index("idx_planner_sync_tenant").on(table.tenantId),
  taskIdx: index("idx_planner_sync_task").on(table.taskId),
}));

export const insertSupportTicketSchema = createInsertSchema(supportTickets).omit({
  id: true,
  ticketNumber: true,
  createdAt: true,
  updatedAt: true,
  resolvedAt: true,
  resolvedBy: true,
});

export const insertSupportTicketReplySchema = createInsertSchema(supportTicketReplies).omit({
  id: true,
  createdAt: true,
});

export const insertSupportTicketPlannerSyncSchema = createInsertSchema(supportTicketPlannerSync).omit({
  id: true,
  createdAt: true,
  lastSyncedAt: true,
});

export type SupportTicket = typeof supportTickets.$inferSelect;
export type InsertSupportTicket = z.infer<typeof insertSupportTicketSchema>;

export type SupportTicketReply = typeof supportTicketReplies.$inferSelect;
export type InsertSupportTicketReply = z.infer<typeof insertSupportTicketReplySchema>;

export type SupportTicketPlannerSync = typeof supportTicketPlannerSync.$inferSelect;
export type InsertSupportTicketPlannerSync = z.infer<typeof insertSupportTicketPlannerSyncSchema>;

// ========== LEARNING COURSES MODULE (Task #39) ==========

export const COURSE_STATUSES = ['draft', 'published', 'archived'] as const;
export const COURSE_VISIBILITIES = ['public', 'private'] as const;
export const LESSON_TYPES = ['slides', 'video', 'audio', 'rich_text', 'quiz', 'scorm', 'attestation'] as const;
export const ENROLLMENT_STATUSES = ['enrolled', 'in_progress', 'completed', 'expired'] as const;
export const LESSON_PROGRESS_STATUSES = ['not_started', 'in_progress', 'completed', 'failed'] as const;

export type CourseStatus = typeof COURSE_STATUSES[number];
export type CourseVisibility = typeof COURSE_VISIBILITIES[number];
export type LessonType = typeof LESSON_TYPES[number];
export type EnrollmentStatus = typeof ENROLLMENT_STATUSES[number];
export type LessonProgressStatus = typeof LESSON_PROGRESS_STATUSES[number];

// Courses table - top-level learning container
export const courses = pgTable("courses", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  slug: text("slug").notNull().unique(),
  title: text("title").notNull(),
  description: text("description").notNull().default(""),
  summary: text("summary"), // short blurb for catalog
  imageUrl: text("image_url"),
  estimatedMinutes: integer("estimated_minutes"),
  status: text("status").notNull().$type<CourseStatus>().default("draft"),
  visibility: text("visibility").notNull().$type<CourseVisibility>().default("public"),
  ownerTenantId: varchar("owner_tenant_id"), // null for global/public
  // Completion / certification
  passingScore: integer("passing_score").notNull().default(80), // 0-100
  certificateEnabled: boolean("certificate_enabled").notNull().default(false),
  // Author
  createdBy: varchar("created_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  ownerTenantIdx: index("idx_courses_owner_tenant").on(table.ownerTenantId),
  statusVisibilityIdx: index("idx_courses_status_visibility").on(table.status, table.visibility),
}));

// Course tenants - junction table for sharing private courses with specific tenants
export const courseTenants = pgTable("course_tenants", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  courseId: varchar("course_id").notNull().references(() => courses.id, { onDelete: "cascade" }),
  tenantId: varchar("tenant_id").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  uniq: unique().on(table.courseId, table.tenantId),
  courseIdx: index("idx_course_tenants_course").on(table.courseId),
  tenantIdx: index("idx_course_tenants_tenant").on(table.tenantId),
}));

// Course modules - sections within a course
export const courseModules = pgTable("course_modules", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  courseId: varchar("course_id").notNull().references(() => courses.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  description: text("description"),
  order: integer("order").notNull().default(0),
}, (table) => ({
  courseIdx: index("idx_course_modules_course").on(table.courseId),
}));

// Lessons - individual learning units within a module
export const lessons = pgTable("lessons", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  moduleId: varchar("module_id").notNull().references(() => courseModules.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  type: text("type").notNull().$type<LessonType>().default("rich_text"),
  order: integer("order").notNull().default(0),
  // Generic content payload — shape depends on `type`:
  //  - rich_text: { html: string }
  //  - slides: { slides: Array<{ title?: string; html: string; imageUrl?: string }> }
  //  - video: { videoUrl: string; provider?: 'mp4'|'youtube'|'vimeo' }
  //  - audio: { audioUrl: string }
  //  - quiz: { passingScore: number; questions: Array<QuizQuestion> }
  //  - scorm: { packageId: string; entryPoint: string; version: '1.2'|'2004' }
  //  - attestation: { statement: string; requireTyped: boolean }
  content: json("content").$type<Record<string, any>>().notNull().default({}),
  estimatedMinutes: integer("estimated_minutes"),
  required: boolean("required").notNull().default(true),
}, (table) => ({
  moduleIdx: index("idx_lessons_module").on(table.moduleId),
}));

// Course enrollments - learner registration in a course
export const courseEnrollments = pgTable("course_enrollments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  courseId: varchar("course_id").notNull().references(() => courses.id, { onDelete: "cascade" }),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  tenantId: varchar("tenant_id"), // captured at enrollment for reporting
  status: text("status").notNull().$type<EnrollmentStatus>().default("enrolled"),
  progressPercent: integer("progress_percent").notNull().default(0),
  enrolledAt: timestamp("enrolled_at").defaultNow().notNull(),
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
  certificateUrl: text("certificate_url"),
}, (table) => ({
  uniq: unique().on(table.courseId, table.userId),
  userIdx: index("idx_enrollments_user").on(table.userId),
  courseIdx: index("idx_enrollments_course").on(table.courseId),
  tenantStatusIdx: index("idx_enrollments_tenant_status").on(table.tenantId, table.status),
}));

// Lesson progress - per-lesson tracking
export const lessonProgress = pgTable("lesson_progress", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  enrollmentId: varchar("enrollment_id").notNull().references(() => courseEnrollments.id, { onDelete: "cascade" }),
  lessonId: varchar("lesson_id").notNull().references(() => lessons.id, { onDelete: "cascade" }),
  status: text("status").notNull().$type<LessonProgressStatus>().default("not_started"),
  score: integer("score"), // 0-100 for quiz/scorm
  attempts: integer("attempts").notNull().default(0),
  // Free-form data: quiz answers, scorm cmi data, attestation signature, etc.
  data: json("data").$type<Record<string, any>>(),
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  uniq: unique().on(table.enrollmentId, table.lessonId),
  enrollmentIdx: index("idx_lesson_progress_enrollment").on(table.enrollmentId),
}));

// Course tags - reusable taxonomy for catalog filtering
export const courseTags = pgTable("course_tags", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull().unique(),
  color: varchar("color", { length: 7 }).notNull().default("#6366f1"),
  description: text("description"),
  createdBy: varchar("created_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const courseTagAssignments = pgTable("course_tag_assignments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  courseId: varchar("course_id").notNull().references(() => courses.id, { onDelete: "cascade" }),
  tagId: varchar("tag_id").notNull().references(() => courseTags.id, { onDelete: "cascade" }),
  assignedAt: timestamp("assigned_at").defaultNow().notNull(),
}, (table) => ({
  uniq: unique().on(table.courseId, table.tagId),
  courseIdx: index("idx_course_tag_assignments_course").on(table.courseId),
  tagIdx: index("idx_course_tag_assignments_tag").on(table.tagId),
}));

// Assessment ↔ course bridge - lets a model recommend courses based on dimension scores
export const assessmentCourseLinks = pgTable("assessment_course_links", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  modelId: varchar("model_id").notNull().references(() => models.id, { onDelete: "cascade" }),
  dimensionId: varchar("dimension_id").references(() => dimensions.id, { onDelete: "cascade" }),
  courseId: varchar("course_id").notNull().references(() => courses.id, { onDelete: "cascade" }),
  // Trigger condition: recommend when dimension score is at/below this threshold (0-100 normalized)
  scoreThreshold: integer("score_threshold").notNull().default(60),
  priority: integer("priority").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  modelIdx: index("idx_assessment_course_links_model").on(table.modelId),
  courseIdx: index("idx_assessment_course_links_course").on(table.courseId),
}));

// Attestation records - signed acknowledgments for compliance reporting
export const attestationRecords = pgTable("attestation_records", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  enrollmentId: varchar("enrollment_id").notNull().references(() => courseEnrollments.id, { onDelete: "cascade" }),
  lessonId: varchar("lesson_id").notNull().references(() => lessons.id, { onDelete: "cascade" }),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  tenantId: varchar("tenant_id"),
  statement: text("statement").notNull(),
  signedName: text("signed_name").notNull(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  signedAt: timestamp("signed_at").defaultNow().notNull(),
}, (table) => ({
  enrollmentIdx: index("idx_attestation_enrollment").on(table.enrollmentId),
  userIdx: index("idx_attestation_user").on(table.userId),
  tenantIdx: index("idx_attestation_tenant").on(table.tenantId),
}));

// SCORM packages - metadata for uploaded SCORM bundles
export const scormPackages = pgTable("scorm_packages", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  courseId: varchar("course_id").references(() => courses.id, { onDelete: "set null" }),
  name: text("name").notNull(),
  scormVersion: text("scorm_version").notNull().default("1.2"), // '1.2' | '2004'
  packageUrl: text("package_url").notNull(), // object storage URL of the .zip
  entryPoint: text("entry_point"), // path to launch HTML inside package
  manifest: json("manifest").$type<Record<string, any>>(), // parsed imsmanifest.xml summary
  uploadedBy: varchar("uploaded_by").references(() => users.id, { onDelete: "set null" }),
  uploadedAt: timestamp("uploaded_at").defaultNow().notNull(),
});

// ===== Insert schemas + types =====

export const insertCourseSchema = createInsertSchema(courses).omit({
  id: true, createdAt: true, updatedAt: true,
}).extend({
  slug: z.string().min(1).max(100).regex(/^[a-z0-9-]+$/, "Slug must be lowercase letters, numbers, and hyphens"),
  title: z.string().min(1).max(255),
  description: z.string().default(""),
  passingScore: z.number().int().min(0).max(100).default(80),
});

export const insertCourseModuleSchema = createInsertSchema(courseModules).omit({ id: true });
export const insertLessonSchema = createInsertSchema(lessons).omit({ id: true });
export const insertCourseEnrollmentSchema = createInsertSchema(courseEnrollments).omit({
  id: true, enrolledAt: true, startedAt: true, completedAt: true,
});
export const insertLessonProgressSchema = createInsertSchema(lessonProgress).omit({
  id: true, updatedAt: true, startedAt: true, completedAt: true,
});
export const insertCourseTagSchema = createInsertSchema(courseTags).omit({ id: true, createdAt: true });
export const insertCourseTagAssignmentSchema = createInsertSchema(courseTagAssignments).omit({ id: true, assignedAt: true });
export const insertAssessmentCourseLinkSchema = createInsertSchema(assessmentCourseLinks).omit({ id: true, createdAt: true });
export const insertAttestationRecordSchema = createInsertSchema(attestationRecords).omit({ id: true, signedAt: true });
export const insertScormPackageSchema = createInsertSchema(scormPackages).omit({ id: true, uploadedAt: true });
export const insertCourseTenantSchema = createInsertSchema(courseTenants).omit({ id: true, createdAt: true });

export type Course = typeof courses.$inferSelect;
export type InsertCourse = z.infer<typeof insertCourseSchema>;
export type CourseModule = typeof courseModules.$inferSelect;
export type InsertCourseModule = z.infer<typeof insertCourseModuleSchema>;
export type Lesson = typeof lessons.$inferSelect;
export type InsertLesson = z.infer<typeof insertLessonSchema>;
export type CourseEnrollment = typeof courseEnrollments.$inferSelect;
export type InsertCourseEnrollment = z.infer<typeof insertCourseEnrollmentSchema>;
export type LessonProgress = typeof lessonProgress.$inferSelect;
export type InsertLessonProgress = z.infer<typeof insertLessonProgressSchema>;
export type CourseTag = typeof courseTags.$inferSelect;
export type InsertCourseTag = z.infer<typeof insertCourseTagSchema>;
export type CourseTagAssignment = typeof courseTagAssignments.$inferSelect;
export type InsertCourseTagAssignment = z.infer<typeof insertCourseTagAssignmentSchema>;
export type AssessmentCourseLink = typeof assessmentCourseLinks.$inferSelect;
export type InsertAssessmentCourseLink = z.infer<typeof insertAssessmentCourseLinkSchema>;
export type AttestationRecord = typeof attestationRecords.$inferSelect;
export type InsertAttestationRecord = z.infer<typeof insertAttestationRecordSchema>;
export type ScormPackage = typeof scormPackages.$inferSelect;
export type InsertScormPackage = z.infer<typeof insertScormPackageSchema>;
export type CourseTenant = typeof courseTenants.$inferSelect;
export type InsertCourseTenant = z.infer<typeof insertCourseTenantSchema>;

// ========== ACADEMIES (Learning Sequences) ==========
//
// An academy is an ordered sequence of learning items. Each item is either a
// reference to an internal `course` (Orion-authored content) or an external
// link (LinkedIn Learning, Coursera, YouTube, etc.). Visibility & tenant
// sharing follow the same pattern as `courses` / `courseTenants`.

export const ACADEMY_STATUSES = ['draft', 'published', 'archived'] as const;
export const ACADEMY_VISIBILITIES = ['public', 'private'] as const;
export const ACADEMY_ITEM_TYPES = ['course', 'external'] as const;
export const ACADEMY_EXTERNAL_PROVIDERS = [
  'linkedin_learning',
  'coursera',
  'pluralsight',
  'youtube',
  'udemy',
  'edx',
  'other',
] as const;

export type AcademyStatus = typeof ACADEMY_STATUSES[number];
export type AcademyVisibility = typeof ACADEMY_VISIBILITIES[number];
export type AcademyItemType = typeof ACADEMY_ITEM_TYPES[number];
export type AcademyExternalProvider = typeof ACADEMY_EXTERNAL_PROVIDERS[number];

export const academies = pgTable("academies", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  slug: text("slug").notNull().unique(),
  title: text("title").notNull(),
  description: text("description").notNull().default(""),
  summary: text("summary"),
  imageUrl: text("image_url"),
  estimatedMinutes: integer("estimated_minutes"),
  status: text("status").notNull().$type<AcademyStatus>().default("draft"),
  visibility: text("visibility").notNull().$type<AcademyVisibility>().default("private"),
  ownerTenantId: varchar("owner_tenant_id"),
  createdBy: varchar("created_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  ownerTenantIdx: index("idx_academies_owner_tenant").on(table.ownerTenantId),
  statusVisibilityIdx: index("idx_academies_status_visibility").on(table.status, table.visibility),
}));

// Junction table for sharing private academies with specific tenants.
export const academyTenants = pgTable("academy_tenants", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  academyId: varchar("academy_id").notNull().references(() => academies.id, { onDelete: "cascade" }),
  tenantId: varchar("tenant_id").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  uniq: unique().on(table.academyId, table.tenantId),
  academyIdx: index("idx_academy_tenants_academy").on(table.academyId),
  tenantIdx: index("idx_academy_tenants_tenant").on(table.tenantId),
}));

// An academy item is one entry in the sequence. `itemType` is either:
//  - 'course'   → courseId references a row in `courses`
//  - 'external' → externalProvider/title/url/etc. populated, courseId null
export const academyItems = pgTable("academy_items", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  academyId: varchar("academy_id").notNull().references(() => academies.id, { onDelete: "cascade" }),
  order: integer("order").notNull().default(0),
  itemType: text("item_type").notNull().$type<AcademyItemType>(),
  courseId: varchar("course_id").references(() => courses.id, { onDelete: "set null" }),
  externalProvider: text("external_provider").$type<AcademyExternalProvider>(),
  externalTitle: text("external_title"),
  externalUrl: text("external_url"),
  externalDurationMinutes: integer("external_duration_minutes"),
  externalDescription: text("external_description"),
  required: boolean("required").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  academyIdx: index("idx_academy_items_academy").on(table.academyId),
  courseIdx: index("idx_academy_items_course").on(table.courseId),
}));

export const insertAcademySchema = createInsertSchema(academies).omit({
  id: true, createdAt: true, updatedAt: true,
}).extend({
  slug: z.string().min(1).max(100).regex(/^[a-z0-9-]+$/, "Slug must be lowercase letters, numbers, and hyphens"),
  title: z.string().min(1).max(255),
  description: z.string().default(""),
});

export const insertAcademyItemSchema = createInsertSchema(academyItems).omit({
  id: true, createdAt: true,
}).extend({
  itemType: z.enum(ACADEMY_ITEM_TYPES),
  externalProvider: z.enum(ACADEMY_EXTERNAL_PROVIDERS).nullable().optional(),
  externalUrl: z.string().url().nullable().optional(),
});

export const insertAcademyTenantSchema = createInsertSchema(academyTenants).omit({
  id: true, createdAt: true,
});

export type Academy = typeof academies.$inferSelect;
export type InsertAcademy = z.infer<typeof insertAcademySchema>;
export type AcademyItem = typeof academyItems.$inferSelect;
export type InsertAcademyItem = z.infer<typeof insertAcademyItemSchema>;
export type AcademyTenant = typeof academyTenants.$inferSelect;
export type InsertAcademyTenant = z.infer<typeof insertAcademyTenantSchema>;
