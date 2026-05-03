CREATE TABLE "ai_content_reviews" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" text NOT NULL,
	"content_type" text NOT NULL,
	"model_id" varchar,
	"target_id" varchar,
	"generated_content" json NOT NULL,
	"metadata" json,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_by" varchar NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"reviewed_by" varchar,
	"reviewed_at" timestamp,
	"rejection_reason" text
);
--> statement-breakpoint
CREATE TABLE "ai_generated_content" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" text NOT NULL,
	"context_hash" varchar(64) NOT NULL,
	"content" json NOT NULL,
	"metadata" json,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"expires_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_usage_log" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar,
	"model_name" text NOT NULL,
	"operation" text NOT NULL,
	"prompt_tokens" integer,
	"completion_tokens" integer,
	"total_tokens" integer,
	"estimated_cost" integer,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "answers" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"question_id" varchar NOT NULL,
	"text" text NOT NULL,
	"score" integer NOT NULL,
	"order" integer NOT NULL,
	"improvement_statement" text,
	"resource_title" text,
	"resource_link" text,
	"resource_description" text
);
--> statement-breakpoint
CREATE TABLE "application_roles" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"application_id" varchar NOT NULL,
	"role_key" text NOT NULL,
	"scope" text DEFAULT 'tenant' NOT NULL,
	"display_name" text NOT NULL,
	"description" text,
	"precedence" integer DEFAULT 0 NOT NULL,
	"permissions" json,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "application_roles_application_id_role_key_unique" UNIQUE("application_id","role_key")
);
--> statement-breakpoint
CREATE TABLE "applications" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_key" text NOT NULL,
	"display_name" text NOT NULL,
	"description" text,
	"logo_url" text,
	"homepage_url" text,
	"environment" text DEFAULT 'development' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "applications_client_key_unique" UNIQUE("client_key")
);
--> statement-breakpoint
CREATE TABLE "assessment_course_links" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"model_id" varchar NOT NULL,
	"dimension_id" varchar,
	"course_id" varchar NOT NULL,
	"score_threshold" integer DEFAULT 60 NOT NULL,
	"priority" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "assessment_responses" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"assessment_id" varchar NOT NULL,
	"question_id" varchar NOT NULL,
	"answer_id" varchar,
	"answer_ids" text[],
	"numeric_value" integer,
	"boolean_value" boolean,
	"text_value" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "assessment_responses_assessment_id_question_id_unique" UNIQUE("assessment_id","question_id")
);
--> statement-breakpoint
CREATE TABLE "assessment_tag_assignments" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"assessment_id" varchar NOT NULL,
	"tag_id" varchar NOT NULL,
	"assigned_by" varchar,
	"assigned_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "assessment_tag_assignments_assessment_id_tag_id_unique" UNIQUE("assessment_id","tag_id")
);
--> statement-breakpoint
CREATE TABLE "assessment_tags" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"color" varchar(7) DEFAULT '#6366f1' NOT NULL,
	"description" text,
	"created_by" varchar,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "assessment_tags_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "assessments" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar,
	"model_id" varchar NOT NULL,
	"status" text DEFAULT 'in_progress' NOT NULL,
	"started_at" timestamp DEFAULT now() NOT NULL,
	"completed_at" timestamp,
	"session_id" text,
	"import_batch_id" varchar,
	"is_proxy" boolean DEFAULT false NOT NULL,
	"proxy_name" text,
	"proxy_company" text,
	"proxy_job_title" text,
	"proxy_industry" text,
	"proxy_company_size" text,
	"proxy_country" text,
	"tenant_id" varchar
);
--> statement-breakpoint
CREATE TABLE "attestation_records" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"enrollment_id" varchar NOT NULL,
	"lesson_id" varchar NOT NULL,
	"user_id" varchar NOT NULL,
	"tenant_id" varchar,
	"statement" text NOT NULL,
	"signed_name" text NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"signed_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "benchmarks" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"model_id" varchar NOT NULL,
	"segment_type" text NOT NULL,
	"industry" text,
	"company_size" text,
	"country" text,
	"mean_score" integer NOT NULL,
	"dimension_scores" json,
	"sample_size" integer NOT NULL,
	"calculated_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "certificates" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar NOT NULL,
	"user_id" varchar NOT NULL,
	"source_type" text NOT NULL,
	"source_id" varchar,
	"model_id" varchar,
	"title" text NOT NULL,
	"serial_number" text NOT NULL,
	"issued_at" timestamp DEFAULT now() NOT NULL,
	"expires_at" timestamp,
	"pdf_url" text,
	"revoked_at" timestamp,
	CONSTRAINT "certificates_serial_number_unique" UNIQUE("serial_number"),
	CONSTRAINT "uniq_certificates_source" UNIQUE("tenant_id","user_id","source_type","source_id")
);
--> statement-breakpoint
CREATE TABLE "content_embeddings" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_url" text NOT NULL,
	"title" text,
	"content" text NOT NULL,
	"embedding" text,
	"metadata" json,
	"indexed_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "course_enrollments" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"course_id" varchar NOT NULL,
	"user_id" varchar NOT NULL,
	"tenant_id" varchar,
	"status" text DEFAULT 'enrolled' NOT NULL,
	"progress_percent" integer DEFAULT 0 NOT NULL,
	"enrolled_at" timestamp DEFAULT now() NOT NULL,
	"started_at" timestamp,
	"completed_at" timestamp,
	"certificate_url" text,
	CONSTRAINT "course_enrollments_course_id_user_id_unique" UNIQUE("course_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "course_modules" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"course_id" varchar NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "course_tag_assignments" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"course_id" varchar NOT NULL,
	"tag_id" varchar NOT NULL,
	"assigned_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "course_tag_assignments_course_id_tag_id_unique" UNIQUE("course_id","tag_id")
);
--> statement-breakpoint
CREATE TABLE "course_tags" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"color" varchar(7) DEFAULT '#6366f1' NOT NULL,
	"description" text,
	"created_by" varchar,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "course_tags_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "course_tenants" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"course_id" varchar NOT NULL,
	"tenant_id" varchar NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "course_tenants_course_id_tenant_id_unique" UNIQUE("course_id","tenant_id")
);
--> statement-breakpoint
CREATE TABLE "courses" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"summary" text,
	"image_url" text,
	"estimated_minutes" integer,
	"status" text DEFAULT 'draft' NOT NULL,
	"visibility" text DEFAULT 'public' NOT NULL,
	"owner_tenant_id" varchar,
	"passing_score" integer DEFAULT 80 NOT NULL,
	"certificate_enabled" boolean DEFAULT false NOT NULL,
	"created_by" varchar,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "courses_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "dimensions" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"model_id" varchar NOT NULL,
	"key" text NOT NULL,
	"label" text NOT NULL,
	"description" text,
	"order" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "galaxy_attestation_signatures" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"attestation_id" varchar NOT NULL,
	"user_id" varchar NOT NULL,
	"tenant_id" varchar NOT NULL,
	"signed_at" timestamp DEFAULT now() NOT NULL,
	"signature_text" text,
	"ip_address" text,
	CONSTRAINT "galaxy_attestation_signatures_attestation_id_user_id_unique" UNIQUE("attestation_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "galaxy_attestations" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"version" text DEFAULT '1.0' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"audience_roles" text[],
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "galaxy_audit_log" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar NOT NULL,
	"user_id" varchar,
	"client_id" varchar,
	"request_id" text,
	"method" text NOT NULL,
	"path" text NOT NULL,
	"scopes" text[],
	"resource_type" text,
	"resource_id" text,
	"status" integer NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "galaxy_exposure_policies" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"expose_assessments" boolean DEFAULT true NOT NULL,
	"expose_results" boolean DEFAULT true NOT NULL,
	"expose_recommendations" boolean DEFAULT true NOT NULL,
	"expose_insights" boolean DEFAULT true NOT NULL,
	"expose_certificates" boolean DEFAULT false NOT NULL,
	"expose_courses" boolean DEFAULT true NOT NULL,
	"expose_attestations" boolean DEFAULT true NOT NULL,
	"exposed_model_ids" text[],
	"audience_mode" text DEFAULT 'all' NOT NULL,
	"audience_roles" text[],
	"audience_tags" text[],
	"allowed_origins" text[],
	"rate_limit_per_minute" integer DEFAULT 120 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "galaxy_exposure_policies_tenant_id_unique" UNIQUE("tenant_id")
);
--> statement-breakpoint
CREATE TABLE "galaxy_rate_limits" (
	"key" text PRIMARY KEY NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	"reset_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "galaxy_webhook_deliveries" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar NOT NULL,
	"webhook_id" varchar,
	"event_type" text NOT NULL,
	"payload" json NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"response_status" integer,
	"response_body" text,
	"last_error" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"delivered_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "galaxy_webhooks" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar NOT NULL,
	"url" text NOT NULL,
	"signing_secret" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"events" text[],
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "galaxy_webhooks_tenant_id_unique" UNIQUE("tenant_id")
);
--> statement-breakpoint
CREATE TABLE "import_batches" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source" text NOT NULL,
	"filename" text,
	"imported_by" varchar NOT NULL,
	"assessment_count" integer NOT NULL,
	"question_mappings" json,
	"metadata" json,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "knowledge_documents" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"file_url" text NOT NULL,
	"file_size" integer NOT NULL,
	"file_type" text NOT NULL,
	"scope" text NOT NULL,
	"model_id" varchar,
	"description" text,
	"uploaded_by" varchar NOT NULL,
	"uploaded_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lesson_progress" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"enrollment_id" varchar NOT NULL,
	"lesson_id" varchar NOT NULL,
	"status" text DEFAULT 'not_started' NOT NULL,
	"score" integer,
	"attempts" integer DEFAULT 0 NOT NULL,
	"data" json,
	"started_at" timestamp,
	"completed_at" timestamp,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "lesson_progress_enrollment_id_lesson_id_unique" UNIQUE("enrollment_id","lesson_id")
);
--> statement-breakpoint
CREATE TABLE "lessons" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"module_id" varchar NOT NULL,
	"title" text NOT NULL,
	"type" text DEFAULT 'rich_text' NOT NULL,
	"order" integer DEFAULT 0 NOT NULL,
	"content" json DEFAULT '{}'::json NOT NULL,
	"estimated_minutes" integer,
	"required" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "model_access_requests" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"model_id" varchar NOT NULL,
	"requestor_name" text NOT NULL,
	"requestor_email" text NOT NULL,
	"organization_name" text NOT NULL,
	"organization_domain" text,
	"tenant_id" varchar,
	"sso_tenant_id" text,
	"admin_consent_granted" boolean DEFAULT false NOT NULL,
	"message" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"requested_at" timestamp DEFAULT now() NOT NULL,
	"reviewed_at" timestamp,
	"reviewed_by" varchar,
	"denial_reason" text
);
--> statement-breakpoint
CREATE TABLE "model_tenants" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"model_id" varchar NOT NULL,
	"tenant_id" varchar NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "model_tenants_model_id_tenant_id_unique" UNIQUE("model_id","tenant_id")
);
--> statement-breakpoint
CREATE TABLE "models" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"description" text NOT NULL,
	"version" text DEFAULT '1.0' NOT NULL,
	"estimated_time" text,
	"status" text DEFAULT 'draft' NOT NULL,
	"featured" boolean DEFAULT false NOT NULL,
	"allow_anonymous_results" boolean DEFAULT false NOT NULL,
	"image_url" text,
	"maturity_scale" json,
	"general_resources" json,
	"owner_tenant_id" varchar,
	"visibility" text DEFAULT 'public' NOT NULL,
	"model_class" text DEFAULT 'organizational' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "models_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "oauth_authorization_codes" (
	"code" text PRIMARY KEY NOT NULL,
	"client_id" text NOT NULL,
	"user_id" varchar NOT NULL,
	"redirect_uri" text NOT NULL,
	"scope" text,
	"code_challenge" text,
	"code_challenge_method" text DEFAULT 'S256',
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "oauth_clients" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"application_id" varchar,
	"client_id" varchar(255) NOT NULL,
	"client_secret_hash" text,
	"name" text NOT NULL,
	"environment" text DEFAULT 'development' NOT NULL,
	"redirect_uris" text[] NOT NULL,
	"post_logout_redirect_uris" text[],
	"grant_types" text[] DEFAULT ARRAY['authorization_code'] NOT NULL,
	"pkce_required" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "oauth_clients_client_id_unique" UNIQUE("client_id")
);
--> statement-breakpoint
CREATE TABLE "oauth_tokens" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"client_id" varchar NOT NULL,
	"access_token_hash" text NOT NULL,
	"refresh_token_hash" text,
	"token_type" text DEFAULT 'Bearer' NOT NULL,
	"scopes" text[],
	"expires_at" timestamp NOT NULL,
	"revoked_at" timestamp,
	"rotated_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "oauth_user_consents" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"client_id" varchar NOT NULL,
	"scopes" text[] NOT NULL,
	"scopes_hash" text NOT NULL,
	"consented_at" timestamp DEFAULT now() NOT NULL,
	"last_used_at" timestamp DEFAULT now() NOT NULL,
	"revoked_at" timestamp,
	CONSTRAINT "unique_user_client_scopes" UNIQUE("user_id","client_id","scopes_hash")
);
--> statement-breakpoint
CREATE TABLE "password_reset_tokens" (
	"token" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"expires_at" timestamp NOT NULL,
	"used" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "questions" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"model_id" varchar NOT NULL,
	"dimension_id" varchar,
	"text" text NOT NULL,
	"type" text DEFAULT 'multiple_choice' NOT NULL,
	"min_value" integer,
	"max_value" integer,
	"unit" text,
	"placeholder" text,
	"order" integer NOT NULL,
	"improvement_statement" text,
	"resource_title" text,
	"resource_link" text,
	"resource_description" text
);
--> statement-breakpoint
CREATE TABLE "results" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"assessment_id" varchar NOT NULL,
	"overall_score" integer NOT NULL,
	"label" text NOT NULL,
	"dimension_scores" json NOT NULL,
	"pdf_url" text,
	"email_sent" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "results_assessment_id_unique" UNIQUE("assessment_id")
);
--> statement-breakpoint
CREATE TABLE "scorm_packages" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"course_id" varchar,
	"name" text NOT NULL,
	"scorm_version" text DEFAULT '1.2' NOT NULL,
	"package_url" text NOT NULL,
	"entry_point" text,
	"manifest" json,
	"uploaded_by" varchar,
	"uploaded_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session" (
	"sid" varchar PRIMARY KEY NOT NULL,
	"sess" json NOT NULL,
	"expire" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"value" json NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "settings_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "sso_auth_states" (
	"state" varchar PRIMARY KEY NOT NULL,
	"code_verifier" text NOT NULL,
	"redirect_url" text,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "support_ticket_planner_sync" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ticket_id" varchar NOT NULL,
	"tenant_id" varchar NOT NULL,
	"plan_id" text NOT NULL,
	"task_id" text NOT NULL,
	"task_title" text NOT NULL,
	"bucket_id" text,
	"bucket_name" text,
	"sync_status" text DEFAULT 'synced' NOT NULL,
	"sync_error" text,
	"remote_etag" text,
	"last_synced_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "support_ticket_replies" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ticket_id" varchar NOT NULL,
	"user_id" varchar NOT NULL,
	"message" text NOT NULL,
	"is_internal" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "support_tickets" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ticket_number" integer NOT NULL,
	"tenant_id" varchar,
	"user_id" varchar NOT NULL,
	"category" text NOT NULL,
	"subject" text NOT NULL,
	"description" text NOT NULL,
	"priority" text DEFAULT 'medium' NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"assigned_to" varchar,
	"metadata" json,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"resolved_at" timestamp,
	"resolved_by" varchar
);
--> statement-breakpoint
CREATE TABLE "tenant_applications" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar NOT NULL,
	"application_id" varchar NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"plan_tier" text DEFAULT 'basic',
	"seats_limit" integer,
	"billing_anchor_date" date,
	"expires_at" timestamp,
	"config" json,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "tenant_applications_tenant_id_application_id_unique" UNIQUE("tenant_id","application_id")
);
--> statement-breakpoint
CREATE TABLE "tenant_audit_log" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar NOT NULL,
	"actor_user_id" varchar,
	"action" text NOT NULL,
	"target_type" text,
	"target_id" varchar,
	"metadata" json,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tenant_domains" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar NOT NULL,
	"domain" text NOT NULL,
	"verified" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "tenant_domains_domain_unique" UNIQUE("domain")
);
--> statement-breakpoint
CREATE TABLE "tenant_entitlements" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar NOT NULL,
	"application" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"features" json,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "tenant_entitlements_tenant_id_application_unique" UNIQUE("tenant_id","application")
);
--> statement-breakpoint
CREATE TABLE "tenants" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"logo_url" text,
	"favicon_url" text,
	"primary_color" varchar(7),
	"secondary_color" varchar(7),
	"accent_color" varchar(7),
	"email_from_name" varchar(100),
	"auto_create_users" boolean DEFAULT false NOT NULL,
	"allow_user_self_provisioning" boolean DEFAULT true NOT NULL,
	"sync_to_hubspot" boolean DEFAULT false NOT NULL,
	"collect_profile_data" boolean DEFAULT true NOT NULL,
	"invite_only" boolean DEFAULT false NOT NULL,
	"default_company" text,
	"default_industry" text,
	"default_country" text,
	"default_company_size" text,
	"sso_tenant_id" text,
	"sso_admin_consent_granted" boolean DEFAULT false NOT NULL,
	"show_changelog_on_login" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "traffic_visits" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"page" text NOT NULL,
	"visited_at" timestamp DEFAULT now() NOT NULL,
	"country" text,
	"device_type" text,
	"browser" text,
	"browser_version" text,
	"os" text,
	"referrer" text,
	"ip_hash" text
);
--> statement-breakpoint
CREATE TABLE "user_application_roles" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"tenant_id" varchar,
	"application_role_id" varchar NOT NULL,
	"assigned_by" varchar,
	"assigned_at" timestamp DEFAULT now() NOT NULL,
	"expires_at" timestamp,
	CONSTRAINT "user_application_roles_user_id_application_role_id_tenant_id_unique" UNIQUE("user_id","application_role_id","tenant_id")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"username" text NOT NULL,
	"password" text NOT NULL,
	"email" text,
	"name" text,
	"company" text,
	"company_size" text,
	"job_title" text,
	"industry" text,
	"country" text,
	"role" text DEFAULT 'user' NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"verification_token" varchar,
	"verification_token_expiry" timestamp,
	"sso_provider" text,
	"sso_provider_id" text,
	"tenant_id" varchar,
	"last_dismissed_changelog_version" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "users_username_unique" UNIQUE("username"),
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "ai_content_reviews" ADD CONSTRAINT "ai_content_reviews_model_id_models_id_fk" FOREIGN KEY ("model_id") REFERENCES "public"."models"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_content_reviews" ADD CONSTRAINT "ai_content_reviews_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_content_reviews" ADD CONSTRAINT "ai_content_reviews_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_usage_log" ADD CONSTRAINT "ai_usage_log_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "answers" ADD CONSTRAINT "answers_question_id_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."questions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "application_roles" ADD CONSTRAINT "application_roles_application_id_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessment_course_links" ADD CONSTRAINT "assessment_course_links_model_id_models_id_fk" FOREIGN KEY ("model_id") REFERENCES "public"."models"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessment_course_links" ADD CONSTRAINT "assessment_course_links_dimension_id_dimensions_id_fk" FOREIGN KEY ("dimension_id") REFERENCES "public"."dimensions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessment_course_links" ADD CONSTRAINT "assessment_course_links_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessment_responses" ADD CONSTRAINT "assessment_responses_assessment_id_assessments_id_fk" FOREIGN KEY ("assessment_id") REFERENCES "public"."assessments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessment_responses" ADD CONSTRAINT "assessment_responses_question_id_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."questions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessment_responses" ADD CONSTRAINT "assessment_responses_answer_id_answers_id_fk" FOREIGN KEY ("answer_id") REFERENCES "public"."answers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessment_tag_assignments" ADD CONSTRAINT "assessment_tag_assignments_assessment_id_assessments_id_fk" FOREIGN KEY ("assessment_id") REFERENCES "public"."assessments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessment_tag_assignments" ADD CONSTRAINT "assessment_tag_assignments_tag_id_assessment_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."assessment_tags"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessment_tag_assignments" ADD CONSTRAINT "assessment_tag_assignments_assigned_by_users_id_fk" FOREIGN KEY ("assigned_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessment_tags" ADD CONSTRAINT "assessment_tags_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessments" ADD CONSTRAINT "assessments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessments" ADD CONSTRAINT "assessments_model_id_models_id_fk" FOREIGN KEY ("model_id") REFERENCES "public"."models"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessments" ADD CONSTRAINT "assessments_import_batch_id_import_batches_id_fk" FOREIGN KEY ("import_batch_id") REFERENCES "public"."import_batches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attestation_records" ADD CONSTRAINT "attestation_records_enrollment_id_course_enrollments_id_fk" FOREIGN KEY ("enrollment_id") REFERENCES "public"."course_enrollments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attestation_records" ADD CONSTRAINT "attestation_records_lesson_id_lessons_id_fk" FOREIGN KEY ("lesson_id") REFERENCES "public"."lessons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attestation_records" ADD CONSTRAINT "attestation_records_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "benchmarks" ADD CONSTRAINT "benchmarks_model_id_models_id_fk" FOREIGN KEY ("model_id") REFERENCES "public"."models"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "certificates" ADD CONSTRAINT "certificates_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "certificates" ADD CONSTRAINT "certificates_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "certificates" ADD CONSTRAINT "certificates_model_id_models_id_fk" FOREIGN KEY ("model_id") REFERENCES "public"."models"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "course_enrollments" ADD CONSTRAINT "course_enrollments_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "course_enrollments" ADD CONSTRAINT "course_enrollments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "course_modules" ADD CONSTRAINT "course_modules_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "course_tag_assignments" ADD CONSTRAINT "course_tag_assignments_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "course_tag_assignments" ADD CONSTRAINT "course_tag_assignments_tag_id_course_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."course_tags"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "course_tags" ADD CONSTRAINT "course_tags_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "course_tenants" ADD CONSTRAINT "course_tenants_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "courses" ADD CONSTRAINT "courses_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dimensions" ADD CONSTRAINT "dimensions_model_id_models_id_fk" FOREIGN KEY ("model_id") REFERENCES "public"."models"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "galaxy_attestation_signatures" ADD CONSTRAINT "galaxy_attestation_signatures_attestation_id_galaxy_attestations_id_fk" FOREIGN KEY ("attestation_id") REFERENCES "public"."galaxy_attestations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "galaxy_attestation_signatures" ADD CONSTRAINT "galaxy_attestation_signatures_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "galaxy_attestation_signatures" ADD CONSTRAINT "galaxy_attestation_signatures_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "galaxy_attestations" ADD CONSTRAINT "galaxy_attestations_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "galaxy_audit_log" ADD CONSTRAINT "galaxy_audit_log_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "galaxy_audit_log" ADD CONSTRAINT "galaxy_audit_log_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "galaxy_exposure_policies" ADD CONSTRAINT "galaxy_exposure_policies_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "galaxy_webhook_deliveries" ADD CONSTRAINT "galaxy_webhook_deliveries_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "galaxy_webhook_deliveries" ADD CONSTRAINT "galaxy_webhook_deliveries_webhook_id_galaxy_webhooks_id_fk" FOREIGN KEY ("webhook_id") REFERENCES "public"."galaxy_webhooks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "galaxy_webhooks" ADD CONSTRAINT "galaxy_webhooks_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_batches" ADD CONSTRAINT "import_batches_imported_by_users_id_fk" FOREIGN KEY ("imported_by") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_documents" ADD CONSTRAINT "knowledge_documents_model_id_models_id_fk" FOREIGN KEY ("model_id") REFERENCES "public"."models"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_documents" ADD CONSTRAINT "knowledge_documents_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lesson_progress" ADD CONSTRAINT "lesson_progress_enrollment_id_course_enrollments_id_fk" FOREIGN KEY ("enrollment_id") REFERENCES "public"."course_enrollments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lesson_progress" ADD CONSTRAINT "lesson_progress_lesson_id_lessons_id_fk" FOREIGN KEY ("lesson_id") REFERENCES "public"."lessons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lessons" ADD CONSTRAINT "lessons_module_id_course_modules_id_fk" FOREIGN KEY ("module_id") REFERENCES "public"."course_modules"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "model_access_requests" ADD CONSTRAINT "model_access_requests_model_id_models_id_fk" FOREIGN KEY ("model_id") REFERENCES "public"."models"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "model_access_requests" ADD CONSTRAINT "model_access_requests_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "model_access_requests" ADD CONSTRAINT "model_access_requests_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "model_tenants" ADD CONSTRAINT "model_tenants_model_id_models_id_fk" FOREIGN KEY ("model_id") REFERENCES "public"."models"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "model_tenants" ADD CONSTRAINT "model_tenants_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauth_authorization_codes" ADD CONSTRAINT "oauth_authorization_codes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauth_clients" ADD CONSTRAINT "oauth_clients_application_id_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauth_tokens" ADD CONSTRAINT "oauth_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauth_tokens" ADD CONSTRAINT "oauth_tokens_client_id_oauth_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."oauth_clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauth_user_consents" ADD CONSTRAINT "oauth_user_consents_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauth_user_consents" ADD CONSTRAINT "oauth_user_consents_client_id_oauth_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."oauth_clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "password_reset_tokens" ADD CONSTRAINT "password_reset_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "questions" ADD CONSTRAINT "questions_model_id_models_id_fk" FOREIGN KEY ("model_id") REFERENCES "public"."models"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "questions" ADD CONSTRAINT "questions_dimension_id_dimensions_id_fk" FOREIGN KEY ("dimension_id") REFERENCES "public"."dimensions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "results" ADD CONSTRAINT "results_assessment_id_assessments_id_fk" FOREIGN KEY ("assessment_id") REFERENCES "public"."assessments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scorm_packages" ADD CONSTRAINT "scorm_packages_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scorm_packages" ADD CONSTRAINT "scorm_packages_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_ticket_planner_sync" ADD CONSTRAINT "support_ticket_planner_sync_ticket_id_support_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."support_tickets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_ticket_replies" ADD CONSTRAINT "support_ticket_replies_ticket_id_support_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."support_tickets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_ticket_replies" ADD CONSTRAINT "support_ticket_replies_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_assigned_to_users_id_fk" FOREIGN KEY ("assigned_to") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_resolved_by_users_id_fk" FOREIGN KEY ("resolved_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_applications" ADD CONSTRAINT "tenant_applications_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_applications" ADD CONSTRAINT "tenant_applications_application_id_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_audit_log" ADD CONSTRAINT "tenant_audit_log_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_audit_log" ADD CONSTRAINT "tenant_audit_log_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_domains" ADD CONSTRAINT "tenant_domains_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_entitlements" ADD CONSTRAINT "tenant_entitlements_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_application_roles" ADD CONSTRAINT "user_application_roles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_application_roles" ADD CONSTRAINT "user_application_roles_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_application_roles" ADD CONSTRAINT "user_application_roles_application_role_id_application_roles_id_fk" FOREIGN KEY ("application_role_id") REFERENCES "public"."application_roles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_application_roles" ADD CONSTRAINT "user_application_roles_assigned_by_users_id_fk" FOREIGN KEY ("assigned_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_ai_review_status" ON "ai_content_reviews" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_ai_review_creator" ON "ai_content_reviews" USING btree ("created_by");--> statement-breakpoint
CREATE INDEX "idx_ai_review_model" ON "ai_content_reviews" USING btree ("model_id");--> statement-breakpoint
CREATE INDEX "idx_ai_content_hash" ON "ai_generated_content" USING btree ("context_hash");--> statement-breakpoint
CREATE INDEX "idx_ai_content_type" ON "ai_generated_content" USING btree ("type");--> statement-breakpoint
CREATE INDEX "idx_ai_content_expires" ON "ai_generated_content" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "idx_ai_usage_user" ON "ai_usage_log" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_ai_usage_created" ON "ai_usage_log" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_application_roles_app" ON "application_roles" USING btree ("application_id");--> statement-breakpoint
CREATE INDEX "idx_applications_client_key" ON "applications" USING btree ("client_key");--> statement-breakpoint
CREATE INDEX "idx_applications_environment" ON "applications" USING btree ("environment");--> statement-breakpoint
CREATE INDEX "idx_assessment_course_links_model" ON "assessment_course_links" USING btree ("model_id");--> statement-breakpoint
CREATE INDEX "idx_assessment_course_links_course" ON "assessment_course_links" USING btree ("course_id");--> statement-breakpoint
CREATE INDEX "idx_tag_assignments_assessment" ON "assessment_tag_assignments" USING btree ("assessment_id");--> statement-breakpoint
CREATE INDEX "idx_tag_assignments_tag" ON "assessment_tag_assignments" USING btree ("tag_id");--> statement-breakpoint
CREATE INDEX "idx_assessments_tenant_status" ON "assessments" USING btree ("tenant_id","status");--> statement-breakpoint
CREATE INDEX "idx_assessments_started_at" ON "assessments" USING btree ("started_at");--> statement-breakpoint
CREATE INDEX "idx_assessments_completed_at" ON "assessments" USING btree ("completed_at");--> statement-breakpoint
CREATE INDEX "idx_assessments_model_id" ON "assessments" USING btree ("model_id");--> statement-breakpoint
CREATE INDEX "idx_attestation_enrollment" ON "attestation_records" USING btree ("enrollment_id");--> statement-breakpoint
CREATE INDEX "idx_attestation_user" ON "attestation_records" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_attestation_tenant" ON "attestation_records" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "idx_benchmark_model_segment" ON "benchmarks" USING btree ("model_id","segment_type");--> statement-breakpoint
CREATE INDEX "idx_certificates_tenant" ON "certificates" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "idx_certificates_user" ON "certificates" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_certificates_source" ON "certificates" USING btree ("source_type","source_id");--> statement-breakpoint
CREATE INDEX "idx_embeddings_source" ON "content_embeddings" USING btree ("source_url");--> statement-breakpoint
CREATE INDEX "idx_enrollments_user" ON "course_enrollments" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_enrollments_course" ON "course_enrollments" USING btree ("course_id");--> statement-breakpoint
CREATE INDEX "idx_enrollments_tenant_status" ON "course_enrollments" USING btree ("tenant_id","status");--> statement-breakpoint
CREATE INDEX "idx_course_modules_course" ON "course_modules" USING btree ("course_id");--> statement-breakpoint
CREATE INDEX "idx_course_tag_assignments_course" ON "course_tag_assignments" USING btree ("course_id");--> statement-breakpoint
CREATE INDEX "idx_course_tag_assignments_tag" ON "course_tag_assignments" USING btree ("tag_id");--> statement-breakpoint
CREATE INDEX "idx_course_tenants_course" ON "course_tenants" USING btree ("course_id");--> statement-breakpoint
CREATE INDEX "idx_course_tenants_tenant" ON "course_tenants" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "idx_courses_owner_tenant" ON "courses" USING btree ("owner_tenant_id");--> statement-breakpoint
CREATE INDEX "idx_courses_status_visibility" ON "courses" USING btree ("status","visibility");--> statement-breakpoint
CREATE INDEX "idx_galaxy_attestation_sigs_user" ON "galaxy_attestation_signatures" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_galaxy_attestation_sigs_tenant" ON "galaxy_attestation_signatures" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "idx_galaxy_attestations_tenant" ON "galaxy_attestations" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "idx_galaxy_attestations_status" ON "galaxy_attestations" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_galaxy_audit_tenant" ON "galaxy_audit_log" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "idx_galaxy_audit_created" ON "galaxy_audit_log" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_galaxy_audit_resource" ON "galaxy_audit_log" USING btree ("resource_type","resource_id");--> statement-breakpoint
CREATE INDEX "idx_galaxy_policy_tenant" ON "galaxy_exposure_policies" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "idx_galaxy_deliveries_tenant" ON "galaxy_webhook_deliveries" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "idx_galaxy_deliveries_status" ON "galaxy_webhook_deliveries" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_galaxy_deliveries_created" ON "galaxy_webhook_deliveries" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_galaxy_webhooks_tenant" ON "galaxy_webhooks" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "idx_lesson_progress_enrollment" ON "lesson_progress" USING btree ("enrollment_id");--> statement-breakpoint
CREATE INDEX "idx_lessons_module" ON "lessons" USING btree ("module_id");--> statement-breakpoint
CREATE INDEX "idx_access_requests_model" ON "model_access_requests" USING btree ("model_id");--> statement-breakpoint
CREATE INDEX "idx_access_requests_tenant" ON "model_access_requests" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "idx_access_requests_status" ON "model_access_requests" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_access_requests_email" ON "model_access_requests" USING btree ("requestor_email");--> statement-breakpoint
CREATE INDEX "idx_model_tenants_model" ON "model_tenants" USING btree ("model_id");--> statement-breakpoint
CREATE INDEX "idx_model_tenants_tenant" ON "model_tenants" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "idx_models_owner_tenant" ON "models" USING btree ("owner_tenant_id");--> statement-breakpoint
CREATE INDEX "idx_models_visibility" ON "models" USING btree ("visibility");--> statement-breakpoint
CREATE INDEX "idx_models_status_visibility" ON "models" USING btree ("status","visibility");--> statement-breakpoint
CREATE INDEX "idx_oauth_codes_user" ON "oauth_authorization_codes" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_oauth_codes_expires" ON "oauth_authorization_codes" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "idx_oauth_clients_client_id" ON "oauth_clients" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "idx_oauth_clients_environment" ON "oauth_clients" USING btree ("environment");--> statement-breakpoint
CREATE INDEX "idx_oauth_clients_application" ON "oauth_clients" USING btree ("application_id");--> statement-breakpoint
CREATE INDEX "idx_oauth_tokens_user" ON "oauth_tokens" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_oauth_tokens_client" ON "oauth_tokens" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "idx_oauth_tokens_expires" ON "oauth_tokens" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "idx_user_consent_user_client" ON "oauth_user_consents" USING btree ("user_id","client_id");--> statement-breakpoint
CREATE INDEX "idx_user_consent_scopes_hash" ON "oauth_user_consents" USING btree ("scopes_hash");--> statement-breakpoint
CREATE INDEX "IDX_session_expire" ON "session" USING btree ("expire");--> statement-breakpoint
CREATE INDEX "idx_sso_auth_states_expires" ON "sso_auth_states" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "idx_planner_sync_ticket" ON "support_ticket_planner_sync" USING btree ("ticket_id");--> statement-breakpoint
CREATE INDEX "idx_planner_sync_tenant" ON "support_ticket_planner_sync" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "idx_planner_sync_task" ON "support_ticket_planner_sync" USING btree ("task_id");--> statement-breakpoint
CREATE INDEX "idx_support_replies_ticket" ON "support_ticket_replies" USING btree ("ticket_id");--> statement-breakpoint
CREATE INDEX "idx_support_replies_user" ON "support_ticket_replies" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_support_tickets_tenant" ON "support_tickets" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "idx_support_tickets_user" ON "support_tickets" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_support_tickets_status" ON "support_tickets" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_support_tickets_number" ON "support_tickets" USING btree ("ticket_number");--> statement-breakpoint
CREATE INDEX "idx_tenant_applications_tenant" ON "tenant_applications" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "idx_tenant_applications_app" ON "tenant_applications" USING btree ("application_id");--> statement-breakpoint
CREATE INDEX "idx_tenant_audit_tenant" ON "tenant_audit_log" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "idx_tenant_audit_actor" ON "tenant_audit_log" USING btree ("actor_user_id");--> statement-breakpoint
CREATE INDEX "idx_tenant_audit_created" ON "tenant_audit_log" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_tenant_domains_tenant" ON "tenant_domains" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "idx_tenant_domains_domain" ON "tenant_domains" USING btree ("domain");--> statement-breakpoint
CREATE INDEX "idx_tenant_entitlements_tenant" ON "tenant_entitlements" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "idx_tenants_sso_tenant" ON "tenants" USING btree ("sso_tenant_id");--> statement-breakpoint
CREATE INDEX "idx_traffic_page" ON "traffic_visits" USING btree ("page");--> statement-breakpoint
CREATE INDEX "idx_traffic_visited_at" ON "traffic_visits" USING btree ("visited_at");--> statement-breakpoint
CREATE INDEX "idx_traffic_country" ON "traffic_visits" USING btree ("country");--> statement-breakpoint
CREATE INDEX "idx_user_application_roles_user" ON "user_application_roles" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_user_application_roles_tenant" ON "user_application_roles" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "idx_user_application_roles_role" ON "user_application_roles" USING btree ("application_role_id");--> statement-breakpoint
CREATE INDEX "idx_users_tenant" ON "users" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "idx_users_sso_provider" ON "users" USING btree ("sso_provider","sso_provider_id");