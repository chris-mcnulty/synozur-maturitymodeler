-- Optional authored translations and scoring extensions. Defaults preserve
-- existing models and assessment records unchanged.
ALTER TABLE models ADD COLUMN IF NOT EXISTS scoring_config json;
ALTER TABLE models ADD COLUMN IF NOT EXISTS content_translations json;
ALTER TABLE models ADD COLUMN IF NOT EXISTS respondent_content json;
ALTER TABLE questions ADD COLUMN IF NOT EXISTS is_scored boolean NOT NULL DEFAULT true;
ALTER TABLE questions ADD COLUMN IF NOT EXISTS is_optional boolean NOT NULL DEFAULT false;
ALTER TABLE answers ADD COLUMN IF NOT EXISTS is_not_applicable boolean NOT NULL DEFAULT false;