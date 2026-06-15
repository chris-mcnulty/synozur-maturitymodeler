import { test, expect, Page, request as pwRequest } from '@playwright/test';

/**
 * End-to-end happy path for a "type / propensity" (archetype) assessment.
 *
 * A type model categorizes a respondent into an archetype instead of producing
 * a numeric score. Each answer carries a `typeKey` that votes for one of the
 * model's `modelTypes`; the most-voted type is the result.
 *
 *   1. Pick the first published model whose assessmentMode === 'type'.
 *   2. Sign up a fresh user.
 *   3. Answer every question (first option each).
 *   4. On results, assert an archetype card is shown and no numeric score.
 *
 * The suite skips itself when no published type model is seeded.
 */

type ApiModel = {
  id: string;
  slug: string;
  name: string;
  status: string;
  assessmentMode?: string;
};

type ApiQuestion = {
  id: string;
  text: string;
  type: 'multiple_choice' | 'multi_select' | 'true_false' | 'text' | 'numeric';
};

type ApiAnswer = { id: string; key?: string; questionId: string; text: string };

function uniqueSuffix() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

async function pickTypeModel(baseURL: string): Promise<ApiModel | null> {
  const ctx = await pwRequest.newContext({ baseURL });
  try {
    const res = await ctx.get('/api/models');
    if (!res.ok()) return null;
    const all = (await res.json()) as ApiModel[];
    const typeModels = all.filter(
      (m) => m.status === 'published' && m.assessmentMode === 'type',
    );
    return typeModels[0] ?? null;
  } finally {
    await ctx.dispose();
  }
}

async function fetchQuestions(baseURL: string, modelId: string) {
  const ctx = await pwRequest.newContext({ baseURL });
  try {
    const qRes = await ctx.get(`/api/questions?modelId=${encodeURIComponent(modelId)}`);
    expect(qRes.ok(), 'GET /api/questions should succeed').toBeTruthy();
    const questions = (await qRes.json()) as ApiQuestion[];
    const answersByQuestion: Record<string, ApiAnswer[]> = {};
    for (const q of questions) {
      const aRes = await ctx.get(`/api/answers/${q.id}`);
      if (aRes.ok()) answersByQuestion[q.id] = (await aRes.json()) as ApiAnswer[];
    }
    return { questions, answersByQuestion };
  } finally {
    await ctx.dispose();
  }
}

async function answerCurrentQuestion(page: Page, answers: ApiAnswer[] | undefined) {
  const first = answers?.[0];
  if (!first) throw new Error('Type quiz questions must be multiple choice with seeded answers');
  await page.getByTestId(`answer-option-${first.key ?? first.id}`).click();
}

test.describe('Orion type/propensity journey', () => {
  test('signup -> take type quiz -> see archetype result', async ({ page, baseURL }) => {
    test.setTimeout(180_000);
    const url = baseURL!;
    const model = await pickTypeModel(url);
    test.skip(!model, 'No published type/propensity model is seeded');

    const { questions, answersByQuestion } = await fetchQuestions(url, model!.id);
    expect(questions.length, 'type model must have questions').toBeGreaterThan(0);

    const suffix = uniqueSuffix();
    const username = `e2e-type-${suffix}`;
    const password = 'CorrectHorse-Battery-Staple-9!';

    await page.goto('/auth');
    await page.getByTestId('input-name').fill(`Type Tester ${suffix}`);
    await page.getByTestId('input-register-username').fill(username);
    await page.getByTestId('input-email').fill(`${username}@example.test`);
    await page.getByTestId('input-register-password').fill(password);
    await page.getByTestId('input-company').fill('Type Co');
    await page.getByTestId('button-register').click();
    await page.waitForURL((u) => !u.pathname.startsWith('/auth'), { timeout: 30_000 });

    await page.goto(`/${model!.slug}`);
    await page.getByTestId('button-start-assessment').click();
    await page.waitForURL(/\/assessment\//, { timeout: 30_000 });

    for (let i = 0; i < questions.length; i++) {
      await expect(page.getByTestId('card-question')).toBeVisible();
      const renderedText = (await page.getByTestId('text-question').innerText()).trim();
      const match = questions.find((qq) => renderedText.startsWith(qq.text.trim().slice(0, 40)));
      const current = match ?? questions[i];
      await answerCurrentQuestion(page, answersByQuestion[current.id]);
      await page.getByTestId('button-next').click();
    }

    await page.waitForURL(/\/results\//, { timeout: 60_000 });

    // An archetype card should be visible, and no numeric score.
    const typeCard = page.locator('[data-testid^="card-type-"]').first();
    await expect(typeCard).toBeVisible({ timeout: 30_000 });
    const typeName = page.locator('[data-testid^="text-type-name-"]').first();
    await expect(typeName).toBeVisible();
    await expect(page.getByTestId('text-score')).toHaveCount(0);
  });
});
