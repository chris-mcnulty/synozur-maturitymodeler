-- Type / Propensity assessment support
ALTER TABLE models
  ADD COLUMN IF NOT EXISTS assessment_mode text NOT NULL DEFAULT 'scored';

ALTER TABLE answers
  ADD COLUMN IF NOT EXISTS type_key text;

CREATE TABLE IF NOT EXISTS model_types (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  model_id varchar NOT NULL REFERENCES models(id) ON DELETE CASCADE,
  key text NOT NULL,
  name text NOT NULL,
  tagline text,
  description text,
  superpowers text[],
  pro_tip text,
  image_url text,
  "order" integer NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_model_types_model_id ON model_types(model_id);
