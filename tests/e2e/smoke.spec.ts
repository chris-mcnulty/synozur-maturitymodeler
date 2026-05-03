import { test, expect, Page, request as pwRequest } from '@playwright/test';

/**
 * End-to-end smoke suite for the four-step journey described in task-9:
 *
 *   1. Anonymous user signs up at /auth.
 *   2. They start an assessment from a published model on the landing page.
 *   3. They answer every question and submit.
 *   4. They view their results.
 *   5. (When admin credentials are provided) an admin opens the same model
 *      and edits a question's text.
 *
 * The suite is intentionally tolerant of the seeded data: it picks the first
 * "individual"-class published model from the public /api/models feed and
 * answers each question deterministically based on the question type.
 *
 * Required env (optional but recommended):
 *   - E2E_ADMIN_USERNAME / E2E_ADMIN_PASSWORD: enables the admin edit step
 *     (used as `npx playwright test` env, not `npm run test:e2e`).
 *   - E2E_BASE_URL: defaults to http://localhost:5000.
 */

type ApiModel = {
  id: string;
  slug: string;
  name: string;
  status: string;
  modelClass?: string;
};

type ApiQuestion = {
  id: string;
  key: string;
  text: string;
  // Matches the values stored by the app (see shared/schema.ts: questions.type):
  //   multiple_choice | multi_select | numeric | true_false | text
  type: 'multiple_choice' | 'multi_select' | 'true_false' | 'text' | 'numeric';
  dimensionId: string | null;
  minValue: number | null;
  maxValue: number | null;
};

type ApiAnswer = {
  id: string;
  key: string;
  questionId: string;
  text: string;
  score: number;
};

const ADMIN_USERNAME = process.env.E2E_ADMIN_USERNAME;
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD;

function uniqueSuffix() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

async function pickPublishedModel(baseURL: string): Promise<ApiModel> {
  const ctx = await pwRequest.newContext({ baseURL });
  try {
    const res = await ctx.get('/api/models');
    expect(res.ok(), 'GET /api/models should succeed').toBeTruthy();
    const all = (await res.json()) as ApiModel[];
    const published = all.filter(
      (m) => m.status === 'published' && (m.modelClass ?? 'individual') === 'individual',
    );
    expect(published.length, 'at least one published individual model is required for E2E').toBeGreaterThan(0);
    return published[0];
  } finally {
    await ctx.dispose();
  }
}

async function fetchModelQuestions(baseURL: string, modelId: string) {
  const ctx = await pwRequest.newContext({ baseURL });
  try {
    const qRes = await ctx.get(`/api/questions?modelId=${encodeURIComponent(modelId)}`);
    expect(qRes.ok(), 'GET /api/questions?modelId=... should succeed').toBeTruthy();
    const questions = (await qRes.json()) as ApiQuestion[];
    const answersByQuestion: Record<string, ApiAnswer[]> = {};
    for (const q of questions) {
      if (q.type === 'multiple_choice' || q.type === 'multi_select') {
        const aRes = await ctx.get(`/api/answers/${q.id}`);
        if (aRes.ok()) {
          answersByQuestion[q.id] = (await aRes.json()) as ApiAnswer[];
        }
      }
    }
    return { questions, answersByQuestion };
  } finally {
    await ctx.dispose();
  }
}

async function answerCurrentQuestion(
  page: Page,
  question: ApiQuestion,
  answers: ApiAnswer[] | undefined,
) {
  switch (question.type) {
    case 'multiple_choice': {
      const first = answers?.[0];
      if (!first) throw new Error(`No answers seeded for multiple_choice question ${question.id}`);
      // The QuestionCard maps API answer.id -> rendered key, so the rendered
      // testid is `answer-option-${answer.id}` (see client/src/pages/Assessment.tsx).
      await page.getByTestId(`answer-option-${first.key ?? first.id}`).click();
      break;
    }
    case 'multi_select': {
      const first = answers?.[0];
      if (!first) throw new Error(`No answers seeded for multi_select question ${question.id}`);
      await page.getByTestId(`answer-option-${first.key ?? first.id}`).click();
      break;
    }
    case 'true_false': {
      await page.getByTestId('answer-option-true').click();
      break;
    }
    case 'numeric': {
      const min = question.minValue ?? 0;
      const max = question.maxValue ?? 100;
      const mid = Math.round((min + max) / 2);
      await page.getByTestId('input-numeric-answer').fill(String(mid));
      break;
    }
    case 'text': {
      await page.getByTestId('textarea-text-answer').fill('Smoke test response.');
      break;
    }
    default:
      throw new Error(`Unsupported question type: ${question.type}`);
  }
}

test.describe('Orion smoke journey', () => {
  test('signup -> take assessment -> view results', async ({ page, baseURL }) => {
    test.setTimeout(180_000);
    const url = baseURL!;
    const model = await pickPublishedModel(url);
    const { questions, answersByQuestion } = await fetchModelQuestions(url, model.id);
    expect(questions.length, 'model must have at least one question').toBeGreaterThan(0);

    const suffix = uniqueSuffix();
    const username = `e2e-${suffix}`;
    const email = `${username}@example.test`;
    const password = 'CorrectHorse-Battery-Staple-9!';

    // 1) Sign up
    await page.goto('/auth');
    await page.getByTestId('input-name').fill(`E2E Tester ${suffix}`);
    await page.getByTestId('input-register-username').fill(username);
    await page.getByTestId('input-email').fill(email);
    await page.getByTestId('input-register-password').fill(password);
    await page.getByTestId('input-company').fill('Smoke Co');
    await page.getByTestId('button-register').click();

    // After register the app redirects to landing; wait for an authenticated UI cue.
    await page.waitForURL((u) => !u.pathname.startsWith('/auth'), { timeout: 30_000 });

    // 2) Start the chosen model's assessment
    await page.goto(`/${model.slug}`);
    await page.getByTestId('button-start-assessment').click();
    await page.waitForURL(/\/assessment\//, { timeout: 30_000 });

    // 3) Answer every question
    for (let i = 0; i < questions.length; i++) {
      const q = questions[i];
      // The Assessment page shows one question at a time; QuestionCard exposes
      // the current question text via [data-testid=text-question]. We don't
      // assume order matches the API list, so we read the rendered question
      // and look it up.
      await expect(page.getByTestId('card-question')).toBeVisible();
      const renderedText = (await page.getByTestId('text-question').innerText()).trim();
      const match = questions.find((qq) => renderedText.startsWith(qq.text.trim().slice(0, 40)));
      const current = match ?? q;
      await answerCurrentQuestion(page, current, answersByQuestion[current.id]);
      await page.getByTestId('button-next').click();
    }

    // 4) Results screen
    await page.waitForURL(/\/results\//, { timeout: 60_000 });
    await expect(page.getByTestId('text-score')).toBeVisible({ timeout: 30_000 });
    const scoreText = (await page.getByTestId('text-score').innerText()).trim();
    expect(scoreText.length).toBeGreaterThan(0);
  });

  test('admin can edit a question on a published model', async ({ page, baseURL }) => {
    test.skip(!ADMIN_USERNAME || !ADMIN_PASSWORD, 'Set E2E_ADMIN_USERNAME and E2E_ADMIN_PASSWORD to run admin smoke');
    test.setTimeout(120_000);

    await page.goto('/auth');
    await page.getByTestId('input-login-username').fill(ADMIN_USERNAME!);
    await page.getByTestId('input-login-password').fill(ADMIN_PASSWORD!);
    await page.getByTestId('button-login').click();
    await page.waitForURL((u) => !u.pathname.startsWith('/auth'), { timeout: 30_000 });

    const model = await pickPublishedModel(baseURL!);

    await page.goto('/admin');
    await page.getByTestId('tab-models').click();
    await page.getByTestId(`button-edit-${model.id}`).click();

    // ModelBuilder opens on the "overview" tab by default; switch to the
    // "structure" tab where dimensions and questions are editable.
    await page.getByTestId('tab-structure').click();

    // Expand the first dimension accordion to reveal its questions. The
    // accordion items expose `accordion-dimension-${id}` test IDs; the
    // clickable trigger is the AccordionTrigger inside that container.
    const firstDimension = page.locator('[data-testid^="accordion-dimension-"]').first();
    await expect(firstDimension).toBeVisible({ timeout: 30_000 });
    await firstDimension.locator('button').first().click();

    // Each question renders a UnifiedQuestionEditor card with testid
    // `unified-question-${id}`. The card is collapsed by default; clicking
    // the card header expands it and reveals `input-question-text-${id}`.
    const firstQuestionCard = page.locator('[data-testid^="unified-question-"]').first();
    await expect(firstQuestionCard).toBeVisible({ timeout: 15_000 });
    await firstQuestionCard.locator('div').first().click();

    const firstQuestionInput = page.locator('[data-testid^="input-question-text-"]').first();
    await expect(firstQuestionInput).toBeVisible({ timeout: 15_000 });
    const original = (await firstQuestionInput.inputValue()).trim();
    const edited = `${original} [smoke ${uniqueSuffix()}]`;

    await firstQuestionInput.fill(edited);
    // UnifiedQuestionEditor autosaves the question text on blur. Trigger
    // blur and give the network mutation a moment to flush.
    await firstQuestionInput.blur();
    await page.waitForTimeout(1_000);

    // Reload, re-open the same question, and confirm the change persisted.
    await page.reload();
    await page.getByTestId('tab-structure').click();
    const reloadedDim = page.locator('[data-testid^="accordion-dimension-"]').first();
    await expect(reloadedDim).toBeVisible({ timeout: 30_000 });
    await reloadedDim.locator('button').first().click();
    const reloadedCard = page.locator('[data-testid^="unified-question-"]').first();
    await expect(reloadedCard).toBeVisible({ timeout: 15_000 });
    await reloadedCard.locator('div').first().click();
    const reloaded = page.locator('[data-testid^="input-question-text-"]').first();
    await expect(reloaded).toHaveValue(edited, { timeout: 15_000 });
  });
});
