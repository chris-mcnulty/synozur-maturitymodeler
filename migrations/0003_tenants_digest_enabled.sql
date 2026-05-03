-- Add tenant-level master switch for the monthly digest.
-- Default true = digest on for all tenants (consistent with current behaviour).
-- Set to false on specific tenants (e.g. narrative, curriculum) to silence
-- all digest emails for every user in that tenant, overriding individual prefs.

ALTER TABLE "tenants"
  ADD COLUMN IF NOT EXISTS "monthly_digest_enabled" boolean NOT NULL DEFAULT true;
