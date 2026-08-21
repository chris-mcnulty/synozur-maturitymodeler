CREATE TABLE IF NOT EXISTS pptx_review_sessions (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id varchar NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  owner_tenant_id varchar,
  status text NOT NULL DEFAULT 'active',
  preview_paths json NOT NULL DEFAULT '[]'::json,
  retained_paths json NOT NULL DEFAULT '[]'::json,
  course_id varchar REFERENCES courses(id) ON DELETE SET NULL,
  expires_at timestamp NOT NULL,
  cleanup_completed_at timestamp,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pptx_review_sessions_owner
  ON pptx_review_sessions(owner_user_id);

CREATE INDEX IF NOT EXISTS idx_pptx_review_sessions_status_expiry
  ON pptx_review_sessions(status, expires_at);

CREATE INDEX IF NOT EXISTS idx_pptx_review_sessions_pending_cleanup
  ON pptx_review_sessions(status, cleanup_completed_at);