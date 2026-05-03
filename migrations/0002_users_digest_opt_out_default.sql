-- Flip all existing users to opted-out of the monthly digest.
-- New users default to opted-out (schema default changed to true).
-- Admins can re-enable individual users or use the bulk control in the
-- Admin → Users section to opt a cohort back in.

UPDATE "users"
  SET "monthly_digest_opt_out" = true
  WHERE "monthly_digest_opt_out" = false;
