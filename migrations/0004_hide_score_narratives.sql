ALTER TABLE models
  ADD COLUMN IF NOT EXISTS hide_score_and_narratives boolean NOT NULL DEFAULT false;
