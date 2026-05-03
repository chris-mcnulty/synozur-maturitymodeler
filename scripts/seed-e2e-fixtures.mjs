#!/usr/bin/env node
// Seed minimal fixtures the Playwright smoke suite depends on.
//
// The smoke spec (`tests/e2e/smoke.spec.ts`) requires at least one
// `status='published'` model whose `modelClass` is `'individual'`, with at
// least one `multiple_choice` question and a handful of answer options.
// This script idempotently inserts that fixture using direct SQL so it can
// run in CI before the app boots, without depending on any admin endpoints.
//
// Intended to run against a dedicated CI Postgres instance. Never run
// against production data.
import pg from "pg";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("DATABASE_URL is required to seed E2E fixtures.");
  process.exit(1);
}

const MODEL_SLUG = "e2e-smoke-individual";
const MODEL_NAME = "E2E Smoke Individual Model";

const client = new pg.Client({ connectionString: databaseUrl });
await client.connect();

try {
  await client.query("BEGIN");

  const maturityScale = JSON.stringify([
    { id: "1", name: "Beginning", description: "Just starting out", minScore: 100, maxScore: 199 },
    { id: "2", name: "Developing", description: "Building capability", minScore: 200, maxScore: 299 },
    { id: "3", name: "Established", description: "Solid foundation", minScore: 300, maxScore: 399 },
    { id: "4", name: "Advanced", description: "Mature practice", minScore: 400, maxScore: 449 },
    { id: "5", name: "Leading", description: "Industry-leading", minScore: 450, maxScore: 500 },
  ]);

  const modelRow = await client.query(
    `INSERT INTO models (slug, name, description, version, status, model_class, visibility, maturity_scale)
     VALUES ($1, $2, $3, '1.0', 'published', 'individual', 'public', $4::json)
     ON CONFLICT (slug) DO UPDATE
       SET status = 'published',
           model_class = 'individual',
           visibility = 'public',
           maturity_scale = EXCLUDED.maturity_scale,
           updated_at = now()
     RETURNING id`,
    [MODEL_SLUG, MODEL_NAME, "Minimal published individual model used by the E2E smoke suite.", maturityScale],
  );
  const modelId = modelRow.rows[0].id;

  // Reset prior dimensions/questions/answers so reruns are deterministic.
  await client.query(`DELETE FROM dimensions WHERE model_id = $1`, [modelId]);
  await client.query(
    `DELETE FROM questions WHERE model_id = $1`,
    [modelId],
  );

  const dimRow = await client.query(
    `INSERT INTO dimensions (model_id, key, label, description, "order")
     VALUES ($1, 'core', 'Core', 'Core dimension for smoke test', 1)
     RETURNING id`,
    [modelId],
  );
  const dimensionId = dimRow.rows[0].id;

  const questionRow = await client.query(
    `INSERT INTO questions (model_id, dimension_id, text, type, "order")
     VALUES ($1, $2, $3, 'multiple_choice', 1)
     RETURNING id`,
    [modelId, dimensionId, "How would you rate your current maturity?"],
  );
  const questionId = questionRow.rows[0].id;

  const answers = [
    { text: "Beginning", score: 150 },
    { text: "Developing", score: 250 },
    { text: "Established", score: 350 },
    { text: "Advanced", score: 425 },
    { text: "Leading", score: 475 },
  ];
  for (let i = 0; i < answers.length; i++) {
    await client.query(
      `INSERT INTO answers (question_id, text, score, "order")
       VALUES ($1, $2, $3, $4)`,
      [questionId, answers[i].text, answers[i].score, i + 1],
    );
  }

  await client.query("COMMIT");
  console.log(`Seeded E2E smoke fixture: model='${MODEL_SLUG}' id=${modelId}`);
} catch (err) {
  await client.query("ROLLBACK").catch(() => {});
  console.error("Failed to seed E2E fixtures:", err);
  process.exit(1);
} finally {
  await client.end();
}
