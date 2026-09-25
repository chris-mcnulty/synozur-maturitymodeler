CREATE TABLE IF NOT EXISTS mandatory_training_schedules (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id varchar NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  title text NOT NULL,
  release_at timestamp NOT NULL,
  due_at timestamp NOT NULL,
  created_by varchar REFERENCES users(id) ON DELETE SET NULL,
  idempotency_key text,
  idempotency_hash text,
  created_at timestamp NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS mandatory_training_schedules_tenant_idempotency_unique
  ON mandatory_training_schedules (tenant_id, idempotency_key);
CREATE INDEX IF NOT EXISTS idx_mandatory_training_schedules_tenant
  ON mandatory_training_schedules (tenant_id);

CREATE TABLE IF NOT EXISTS mandatory_training_items (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  schedule_id varchar NOT NULL REFERENCES mandatory_training_schedules(id) ON DELETE CASCADE,
  "order" integer NOT NULL,
  kind text NOT NULL,
  content_id varchar,
  snapshot_title text NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS mandatory_training_items_schedule_order_unique
  ON mandatory_training_items (schedule_id, "order");
CREATE INDEX IF NOT EXISTS idx_mandatory_training_items_schedule
  ON mandatory_training_items (schedule_id);

CREATE TABLE IF NOT EXISTS mandatory_training_recipients (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  schedule_id varchar NOT NULL REFERENCES mandatory_training_schedules(id) ON DELETE CASCADE,
  user_id varchar REFERENCES users(id) ON DELETE SET NULL,
  snapshot_name text NOT NULL,
  snapshot_email text,
  created_at timestamp NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS mandatory_training_recipients_schedule_user_unique
  ON mandatory_training_recipients (schedule_id, user_id);
CREATE INDEX IF NOT EXISTS idx_mandatory_training_recipients_schedule
  ON mandatory_training_recipients (schedule_id);
CREATE INDEX IF NOT EXISTS idx_mandatory_training_recipients_user
  ON mandatory_training_recipients (user_id);

CREATE TABLE IF NOT EXISTS mandatory_training_emails (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_id varchar NOT NULL REFERENCES mandatory_training_recipients(id) ON DELETE CASCADE,
  milestone text NOT NULL,
  status text NOT NULL,
  claimed_at timestamp NOT NULL DEFAULT now(),
  sent_at timestamp,
  error text
);
CREATE UNIQUE INDEX IF NOT EXISTS mandatory_training_emails_recipient_milestone_unique
  ON mandatory_training_emails (recipient_id, milestone);
CREATE INDEX IF NOT EXISTS idx_mandatory_training_emails_recipient
  ON mandatory_training_emails (recipient_id);
CREATE INDEX IF NOT EXISTS idx_mandatory_training_emails_status
  ON mandatory_training_emails (status);