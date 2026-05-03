-- Add monthly Insights digest preference + bookkeeping columns to users.
-- Idempotent: safe to run against databases where these columns already
-- exist (e.g. environments that previously synced the schema via
-- `drizzle-kit push`).

ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "monthly_digest_opt_out" boolean NOT NULL DEFAULT false;

ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "last_monthly_digest_sent_at" timestamp;
