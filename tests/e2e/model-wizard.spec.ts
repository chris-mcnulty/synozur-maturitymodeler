import { test, expect, request as pwRequest } from '@playwright/test';

/**
 * Smoke spec for the admin model creation wizard.
 *
 * Walks an admin through the 5-step wizard:
 *   1. Basics  → name, slug, description
 *   2. Dimensions → add one dimension
 *   3. Questions  → add one multiple-choice question
 *   4. Maturity Scale → skip (default empty is acceptable)
 *   5. Publish → click "Publish Now"
 *
 * The new model is then verified via the admin `/api/admin/models` feed and
 * cleaned up via the admin DELETE endpoint so re-running the spec is safe.
 *
 * Like the rest of the e2e suite, this spec only runs when admin credentials
 * are provided. Without them the journey is `skip`-ed.
 */

const ADMIN_USERNAME = process.env.E2E_ADMIN_USERNAME;
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD;

function uniqueSuffix() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

test.describe('Model creation wizard', () => {
  test('admin can create a draft model end-to-end via the wizard', async ({ page, baseURL }) => {
    test.skip(
      !ADMIN_USERNAME || !ADMIN_PASSWORD,
      'Set E2E_ADMIN_USERNAME and E2E_ADMIN_PASSWORD to run wizard smoke',
    );
    test.setTimeout(120_000);

    const suffix = uniqueSuffix();
    const modelName = `E2E Wizard Model ${suffix}`;
    const slug = `e2e-wizard-${suffix}`;

    // Login as admin
    await page.goto('/auth');
    await page.getByTestId('input-login-username').fill(ADMIN_USERNAME!);
    await page.getByTestId('input-login-password').fill(ADMIN_PASSWORD!);
    await page.getByTestId('button-login').click();
    await page.waitForURL((u) => !u.pathname.startsWith('/auth'), { timeout: 30_000 });

    // Open admin → Models → wizard
    await page.goto('/admin');
    await page.getByTestId('tab-models').click();
    await page.getByTestId('button-create-model-wizard').click();

    // Step 1: basics
    await page.getByTestId('wiz-input-name').fill(modelName);
    // Slug is auto-derived from the name, but force a deterministic value so
    // we can clean up by id below regardless.
    const slugInput = page.getByTestId('wiz-input-slug');
    await slugInput.fill(slug);
    await page.getByTestId('wiz-input-description').fill('Created by automated wizard test.');
    await page.getByTestId('wiz-button-next-1').click();

    // Step 2: one dimension
    await page.getByTestId('wiz-input-dim-label').fill('Strategy');
    await page.getByTestId('wiz-input-dim-desc').fill('Strategic alignment');
    await page.getByTestId('wiz-button-add-dimension').click();
    // Wait for the dimension to register, then go forward
    await expect(page.getByText('Strategy', { exact: true })).toBeVisible({ timeout: 10_000 });
    await page.getByTestId('wiz-button-next-2').click();

    // Step 3: one question
    await page.getByTestId('wiz-input-question-text').fill('How mature is your AI strategy?');
    await page.getByTestId('wiz-button-add-question').click();
    await expect(page.getByText('How mature is your AI strategy?')).toBeVisible({ timeout: 10_000 });
    await page.getByTestId('wiz-button-next-3').click();

    // Step 4: maturity scale → just skip via Save & Review
    await page.getByTestId('wiz-button-next-4').click();

    // Step 5: publish flow — review summary should be present, then publish
    await expect(page.getByTestId('wiz-button-publish')).toBeVisible({ timeout: 10_000 });
    await page.getByTestId('wiz-button-publish').click();

    // Verify and clean up via the API
    const ctx = await pwRequest.newContext({
      baseURL: baseURL!,
      storageState: await page.context().storageState(),
    });
    try {
      const listRes = await ctx.get('/api/admin/models?includeArchived=true');
      expect(listRes.ok(), 'admin models list should be reachable').toBeTruthy();
      const models = (await listRes.json()) as Array<{ id: string; slug: string; name: string }>;
      const created = models.find((m) => m.slug === slug || m.name === modelName);
      expect(created, `wizard should have created model ${slug}`).toBeTruthy();

      if (created) {
        const del = await ctx.delete(`/api/models/${created.id}`);
        expect(del.ok(), `cleanup delete should succeed for ${created.id}`).toBeTruthy();
      }
    } finally {
      await ctx.dispose();
    }
  });
});
