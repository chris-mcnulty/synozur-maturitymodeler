import { test, expect, Page, Locator, request as pwRequest } from '@playwright/test';

/**
 * Mobile-layout regression suite.
 *
 * Loads the key public routes at three representative mobile/tablet viewports
 * and asserts, for every (route, viewport) pair:
 *
 *   1. The document does not horizontally overflow (no horizontal scrollbar
 *      on `document.body` or `<html>`).
 *   2. The mobile-only landmarks introduced by the mobile-first pass are
 *      still present (e.g. `mobile-value-prop`, `button-mobile-overflow`,
 *      `text-question`, `text-error-title`).
 *   3. The route's primary CTA is visible without the user having to scroll
 *      (its bounding box sits inside the initial viewport).
 *
 * Routes covered:
 *   - `/` (Landing) — anonymous
 *   - `/auth` (sign-in / sign-up) — anonymous
 *   - `/results/:id` (Results, error state) — anonymous; uses a known-bad id
 *      so the page renders the public "Results Not Available" view, which
 *      is the same surface anonymous visitors see when following a stale
 *      shared link.
 *   - `/assessment/:id` — exercised once with a freshly signed-up user
 *      (the assessment surface requires auth), and resized across all 3
 *      viewports while on the assessment page.
 *
 * The suite is intentionally additive: it complements `smoke.spec.ts` rather
 * than replacing it, and uses the same Playwright project so it shares the
 * web-server lifecycle. Filter with `npm run test:mobile-layouts` (or
 * `npx playwright test mobile-layouts`).
 */

type Viewport = { name: string; width: number; height: number };

const VIEWPORTS: Viewport[] = [
  { name: '375x812 (iPhone SE/13 mini)', width: 375, height: 812 },
  { name: '414x896 (iPhone 11 Pro Max)', width: 414, height: 896 },
  { name: '768x1024 (iPad portrait)', width: 768, height: 1024 },
];

// Deterministic UUID that is guaranteed not to match any real assessment —
// used to land on the public Results "not available" surface anonymously.
const BOGUS_RESULTS_ID = '00000000-0000-0000-0000-000000000000';

type ApiModel = {
  id: string;
  slug: string;
  status: string;
  modelClass?: string;
};

type ApiQuestion = {
  id: string;
  key: string;
  text: string;
  type: 'single_choice' | 'multi_select' | 'boolean' | 'text' | 'numeric';
  minValue: number | null;
  maxValue: number | null;
};

type ApiAnswer = { id: string; key: string; questionId: string; text: string; score: number };

function uniqueSuffix() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

async function selectRadixOption(page: Page, triggerTestId: string, optionText: string) {
  await page.getByTestId(triggerTestId).click();
  // Radix renders the listbox in a portal; match the option by visible text.
  await page.getByRole('option', { name: new RegExp(optionText, 'i') }).first().click();
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
    expect(published.length, 'need at least one published individual model').toBeGreaterThan(0);
    return published[0];
  } finally {
    await ctx.dispose();
  }
}

async function fetchModelQuestions(baseURL: string, modelId: string) {
  const ctx = await pwRequest.newContext({ baseURL });
  try {
    const qRes = await ctx.get(`/api/questions?modelId=${encodeURIComponent(modelId)}`);
    expect(qRes.ok(), 'GET /api/questions should succeed').toBeTruthy();
    const questions = (await qRes.json()) as ApiQuestion[];
    const answersByQuestion: Record<string, ApiAnswer[]> = {};
    for (const q of questions) {
      if (q.type === 'single_choice' || q.type === 'multi_select') {
        const aRes = await ctx.get(`/api/answers/${q.id}`);
        if (aRes.ok()) answersByQuestion[q.id] = (await aRes.json()) as ApiAnswer[];
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
    case 'single_choice':
    case 'multi_select': {
      const first = answers?.[0];
      if (!first) throw new Error(`No answers seeded for ${question.type} question ${question.id}`);
      await page.getByTestId(`answer-option-${first.key}`).click();
      break;
    }
    case 'boolean':
      await page.getByTestId('answer-option-true').click();
      break;
    case 'numeric': {
      const min = question.minValue ?? 0;
      const max = question.maxValue ?? 100;
      await page.getByTestId('input-numeric-answer').fill(String(Math.round((min + max) / 2)));
      break;
    }
    case 'text':
      await page.getByTestId('textarea-text-answer').fill('Mobile layout regression response.');
      break;
  }
}

async function assertNoHorizontalOverflow(page: Page, label: string) {
  // Allow a 1px tolerance for sub-pixel rounding in browser layout.
  const result = await page.evaluate(() => ({
    bodyScroll: document.body.scrollWidth,
    htmlScroll: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(
    result.bodyScroll,
    `${label}: document.body should not horizontally overflow (body=${result.bodyScroll}, client=${result.clientWidth})`,
  ).toBeLessThanOrEqual(result.clientWidth + 1);
  expect(
    result.htmlScroll,
    `${label}: <html> should not horizontally overflow (html=${result.htmlScroll}, client=${result.clientWidth})`,
  ).toBeLessThanOrEqual(result.clientWidth + 1);
}

async function assertVisibleWithoutScrolling(page: Page, locator: Locator, label: string) {
  await expect(locator, `${label}: should be visible`).toBeVisible();
  const box = await locator.boundingBox();
  expect(box, `${label}: should have a bounding box`).not.toBeNull();
  const vp = page.viewportSize();
  expect(vp, `${label}: viewport should be set`).not.toBeNull();
  // Element must sit within the initial fold (no vertical scrolling required).
  expect(box!.y, `${label}: top should be within viewport`).toBeGreaterThanOrEqual(0);
  expect(
    box!.y + box!.height,
    `${label}: bottom should be within viewport (y=${box!.y}, h=${box!.height}, vp.h=${vp!.height})`,
  ).toBeLessThanOrEqual(vp!.height + 1);
}

async function assertRouteHealthy(
  page: Page,
  opts: {
    label: string;
    waitFor: Locator;
    landmarks: Array<{ locator: Locator; description: string; mustBeVisible?: boolean }>;
    primaryCta: { locator: Locator; description: string };
  },
) {
  await expect(opts.waitFor, `${opts.label}: route should render`).toBeVisible({ timeout: 30_000 });

  await assertNoHorizontalOverflow(page, opts.label);

  for (const landmark of opts.landmarks) {
    if (landmark.mustBeVisible === false) {
      await expect(
        landmark.locator,
        `${opts.label}: ${landmark.description} must be hidden`,
      ).toBeHidden();
    } else {
      await expect(
        landmark.locator,
        `${opts.label}: ${landmark.description} must be present`,
      ).toBeVisible();
    }
  }

  await assertVisibleWithoutScrolling(
    page,
    opts.primaryCta.locator,
    `${opts.label}: ${opts.primaryCta.description}`,
  );
}

for (const vp of VIEWPORTS) {
  test.describe(`Mobile layout @ ${vp.name}`, () => {
    test.use({ viewport: { width: vp.width, height: vp.height } });

    test('Landing /', async ({ page }) => {
      await page.goto('/');
      await assertRouteHealthy(page, {
        label: `Landing @ ${vp.name}`,
        // The Orion logo is at the top of the hero and is rendered for both
        // anonymous and authenticated visitors — a stable signal that the
        // landing page has rendered.
        waitFor: page.getByTestId('img-orion-logo'),
        landmarks: [
          // The header overflow button is the mobile-only entry point for
          // help/theme/contrast controls; it is intentionally hidden at
          // >=sm (640px) so the desktop header layout takes over.
          {
            locator: page.getByTestId('button-mobile-overflow'),
            description: 'button-mobile-overflow',
            mustBeVisible: vp.width < 640,
          },
        ],
        primaryCta: {
          // For anonymous landing visitors the primary above-the-fold CTA is
          // the header "Sign In" button; the in-hero CTAs (start-featured,
          // start-${slug}) live below the hero copy and are not guaranteed
          // to fit in the initial viewport, especially at 375px tall heroes.
          locator: page.getByTestId('button-signin'),
          description: 'primary CTA (button-signin) should be in fold',
        },
      });
    });

    test('Auth /auth', async ({ page }) => {
      await page.goto('/auth');
      await assertRouteHealthy(page, {
        label: `Auth @ ${vp.name}`,
        waitFor: page.getByTestId('button-login'),
        landmarks: [
          // Both panes are rendered on mobile/tablet (`lg:hidden`, i.e.
          // <1024px). All three test viewports fall below `lg`.
          {
            locator: page.getByTestId('mobile-value-prop'),
            description: 'mobile-value-prop',
          },
          {
            locator: page.getByTestId('mobile-disclaimer'),
            description: 'mobile-disclaimer',
          },
        ],
        primaryCta: {
          locator: page.getByTestId('button-login'),
          description: 'primary CTA (button-login) should be in fold',
        },
      });
    });

    test('Results /results/:id (anonymous, error state)', async ({ page }) => {
      // Anonymous visit to a stale/unknown share link — Results renders the
      // public "Results Not Available" surface, exposing button-home /
      // button-return-assessment as the recovery CTAs. This is the exact
      // route state the mobile-first pass guarantees should not horizontally
      // overflow, and it is reachable without auth or seeded data.
      await page.goto(`/results/${BOGUS_RESULTS_ID}`);
      await assertRouteHealthy(page, {
        label: `Results error @ ${vp.name}`,
        waitFor: page.getByTestId('text-error-title'),
        landmarks: [
          {
            locator: page.getByTestId('text-error-message'),
            description: 'text-error-message',
          },
        ],
        primaryCta: {
          locator: page.getByTestId('button-home'),
          description: 'primary CTA (button-home) should be in fold',
        },
      });
    });
  });
}

test.describe('Mobile layout — assessment + results (authenticated)', () => {
  test('assessment and results pages survive 375 / 414 / 768 viewports', async ({
    browser,
    baseURL,
  }) => {
    test.setTimeout(240_000);

    // Start at the smallest viewport — we'll resize as we walk through the
    // flow so we don't have to repeat signup three times.
    const context = await browser.newContext({
      viewport: { width: VIEWPORTS[0].width, height: VIEWPORTS[0].height },
    });
    const page = await context.newPage();

    try {
      const url = baseURL!;
      const model = await pickPublishedModel(url);
      const { questions, answersByQuestion } = await fetchModelQuestions(url, model.id);
      expect(questions.length, 'model must have at least one question').toBeGreaterThan(0);

      // 1) Sign up a fresh user (the Assessment surface is auth-gated).
      // Auth opens on the Login tab by default — switch to Sign Up first.
      const suffix = uniqueSuffix();
      const username = `mobile-${suffix}`;
      await page.goto('/auth');
      await page.getByRole('tab', { name: 'Sign Up' }).click();

      await page.getByTestId('input-name').fill(`Mobile Tester ${suffix}`);
      await page.getByTestId('input-register-username').fill(username);
      await page.getByTestId('input-email').fill(`${username}@example.test`);
      await page.getByTestId('input-register-password').fill('CorrectHorse-Battery-Staple-9!');
      await page.getByTestId('input-company').fill('Mobile Co');

      // The four required selects (jobTitle / industry / companySize /
      // country) all use the same Radix pattern: click the trigger, then
      // click an option in the popover.
      await selectRadixOption(page, 'select-job-title', 'Software Engineer');
      await selectRadixOption(page, 'select-industry', 'Technology');
      // companySize options render as "Small Business (10-49)" etc — match
      // the partial label.
      await selectRadixOption(page, 'select-company-size', 'Small Business');
      await selectRadixOption(page, 'select-country', 'United States');

      await page.getByTestId('button-register').click();
      await page.waitForURL((u) => !u.pathname.startsWith('/auth'), { timeout: 30_000 });

      // 2) Start the assessment from the model's public landing.
      await page.goto(`/${model.slug}`);
      await page.getByTestId('button-start-assessment').click();
      await page.waitForURL(/\/assessment\//, { timeout: 30_000 });
      await expect(page.getByTestId('card-question')).toBeVisible({ timeout: 30_000 });

      // 3) Verify all three viewports on the assessment page.
      for (const vp of VIEWPORTS) {
        await page.setViewportSize({ width: vp.width, height: vp.height });
        // Allow layout to settle after resize.
        await page.waitForTimeout(200);

        await assertRouteHealthy(page, {
          label: `Assessment @ ${vp.name}`,
          waitFor: page.getByTestId('card-question'),
          landmarks: [
            { locator: page.getByTestId('text-question'), description: 'text-question' },
          ],
          primaryCta: {
            locator: page.getByTestId('button-next'),
            description: 'primary CTA (button-next) should be in fold',
          },
        });
      }

      // 4) Restore the smallest viewport so the answer controls we click are
      // guaranteed to be in the mobile layout, then answer every question.
      await page.setViewportSize({ width: VIEWPORTS[0].width, height: VIEWPORTS[0].height });
      for (let i = 0; i < questions.length; i++) {
        await expect(page.getByTestId('card-question')).toBeVisible();
        const renderedText = (await page.getByTestId('text-question').innerText()).trim();
        const match = questions.find((qq) => renderedText.startsWith(qq.text.trim().slice(0, 40)));
        const current = match ?? questions[i];
        await answerCurrentQuestion(page, current, answersByQuestion[current.id]);
        await page.getByTestId('button-next').click();
      }

      // 5) Real Results page — verify all three viewports. We assert the
      // actual results layout (text-score is rendered, button-back is the
      // above-the-fold primary action), not just the public error surface.
      await page.waitForURL(/\/results\//, { timeout: 60_000 });
      await expect(page.getByTestId('text-score')).toBeVisible({ timeout: 30_000 });

      for (const vp of VIEWPORTS) {
        await page.setViewportSize({ width: vp.width, height: vp.height });
        await page.waitForTimeout(200);
        // Scroll to top so we are measuring the initial-fold experience —
        // resize alone does not always reset the scroll offset.
        await page.evaluate(() => window.scrollTo(0, 0));

        await assertRouteHealthy(page, {
          label: `Results @ ${vp.name}`,
          waitFor: page.getByTestId('button-back'),
          landmarks: [
            { locator: page.getByTestId('text-score'), description: 'text-score' },
            { locator: page.getByTestId('text-title'), description: 'text-title' },
          ],
          primaryCta: {
            locator: page.getByTestId('button-back'),
            description: 'primary CTA (button-back) should be in fold',
          },
        });
      }
    } finally {
      await context.close();
    }
  });
});
