ALTER TABLE "tenants"
  ADD COLUMN "planner_admin_consent_granted" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
-- Consent previously covered both SSO and Planner permissions. Preserve that
-- access for existing tenants while new tenants can approve the two features
-- independently.
UPDATE "tenants"
SET "planner_admin_consent_granted" = "sso_admin_consent_granted"
WHERE "sso_admin_consent_granted" = true;