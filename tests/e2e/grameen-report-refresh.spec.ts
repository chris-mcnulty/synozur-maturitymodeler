import { test, expect } from '@playwright/test';
import { PDFParse } from 'pdf-parse';
import fs from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { setupGrameenFixture, cleanupGrameenFixture, seedStaleSummaryCaches } from './helpers/grameen-fixture';

test.describe('Development-only Grameen owner report refresh', () => {
  test.skip(process.env.GRAMEEN_REPORT_E2E !== '1', 'Opt in with npm run test:grameen-report (live Foundry, disposable dev fixtures).');
  let fixture: Awaited<ReturnType<typeof setupGrameenFixture>>;
  const runId = randomUUID();

  test.beforeAll(async ({ baseURL }) => { fixture = await setupGrameenFixture(baseURL!, runId); });
  test.afterAll(async ({ baseURL }) => { await cleanupGrameenFixture(baseURL!, runId); });

  test('saved custom title -> completed result -> regenerated summary -> refreshed 100-point PDF', async ({ page, baseURL }, testInfo) => {
    test.setTimeout(300_000);
    await page.goto('/auth');
    await page.getByRole('tab', { name: 'Login', exact: true }).click();
    await page.getByTestId('input-login-username').fill(fixture.username);
    await page.getByTestId('input-login-password').fill(fixture.password);
    await page.getByTestId('button-login').click();
    await page.waitForURL(url => !url.pathname.startsWith('/auth'));
    expect((await (await page.request.get('/api/user')).json()).id).toBe(fixture.userId);
    const modelResponse = await page.request.get(`/api/models/by-id/${fixture.modelId}`);
    expect(modelResponse.ok(), 'The disposable owner must have access to the private model').toBeTruthy();
    const respondentModel = await modelResponse.json();
    expect(respondentModel.dimensions.length).toBeGreaterThanOrEqual(2);
    expect(respondentModel.scoringConfig).toEqual({ method: 'mean_answer_values' });

    await page.goto('/profile');
    await page.getByTestId('button-edit-profile').click();
    await page.getByTestId('input-custom-job-title').fill(fixture.newTitle);
    const save = page.waitForResponse(response => response.url().endsWith('/api/profile') && response.request().method() === 'PUT');
    await page.getByTestId('button-save-profile').click();
    expect((await save).ok()).toBeTruthy();
    await page.reload();
    await expect(page.getByTestId('input-custom-job-title')).toHaveValue(fixture.newTitle);
    expect((await (await page.request.get('/api/user')).json()).jobTitle).toBe(fixture.newTitle);

    await page.getByTestId(`button-view-${fixture.assessmentId}`).click();
    await page.waitForURL(`**/results/${fixture.assessmentId}`);
    const downloadButton = page.getByTestId('button-download-pdf');
    await expect(downloadButton).toBeEnabled({ timeout: 180_000 });
    await expect(page.getByTestId('text-score')).toHaveText(String(fixture.score));
    // Poison both persisted cache layers, not the network/provider. Ignoring
    // refresh at either layer must fail instead of passing on a warm summary.
    const poisoned = await seedStaleSummaryCaches(baseURL!, fixture.modelName, fixture.oldTitle);
    expect(poisoned).toEqual(expect.arrayContaining(['maturity-summary', 'maturity_summary']));
    const refreshButton = page.getByTestId('button-refresh-report');
    const refreshed = page.waitForResponse(response =>
      response.url().endsWith('/api/ai/generate-maturity-summary') &&
      response.request().postDataJSON()?.refresh === true, { timeout: 180_000 });
    await refreshButton.click();
    const response = await refreshed;
    expect(response.ok(), 'Live regeneration must succeed, not silently fall back').toBeTruthy();
    const payload = response.request().postDataJSON();
    expect(payload).toMatchObject({
      assessmentId: fixture.assessmentId, modelId: fixture.modelId, maxScore: 100,
      assessmentMode: 'mean_answer_values', userContext: { jobTitle: fixture.newTitle },
    });
    const { summary } = await response.json();
    expect(summary).toContain(fixture.newTitle);
    expect(summary).not.toContain(fixture.oldTitle);
    expect(summary).toMatch(/\b(you|your)\b/i);
    expect(summary).toMatch(/(?:75\s*(?:\/|out of)\s*100|0\s*[-–]\s*100|100[- ]point)/i);
    expect(summary).not.toMatch(/\b500\b|your organi[sz]ation|executive roadmap|business transformation/i);
    const summaryCard = page.getByRole('heading', { name: 'Your Personal AI Skills Summary', exact: true }).locator('..');
    await expect(summaryCard).toContainText(fixture.newTitle);
    await expect(downloadButton).toBeEnabled();
    await expect(refreshButton).toBeEnabled();
    await page.screenshot({ path: testInfo.outputPath('refreshed-result.png'), fullPage: true });

    const downloaded = page.waitForEvent('download');
    await downloadButton.click();
    const download = await downloaded;
    expect(download.suggestedFilename()).toMatch(/\.pdf$/);
    const pdfPath = testInfo.outputPath('refreshed-report.pdf');
    await download.saveAs(pdfPath);
    expect(await download.failure()).toBeNull();
    const bytes = await fs.readFile(pdfPath);
    expect(bytes.subarray(0, 5).toString()).toBe('%PDF-');
    const parser = new PDFParse({ data: bytes });
    try {
      // The extractor otherwise appends synthetic "-- N of M --" markers
      // even to each page's text, breaking cross-page summary comparisons.
      const parsed = await parser.getText({ pageJoiner: '' });
      const text = parsed.pages.map(page => page.text).join('\n');
      const normalized = (value: string) => value.replace(/\s+/g, ' ').trim();
      expect(normalized(text)).toContain(normalized(summary));
      expect(text).toContain('Your Personal AI Skills Summary');
      expect(text).toContain(fixture.newTitle);
      expect(text).not.toContain(fixture.oldTitle);
      expect(text).toMatch(/75\s*(?:\/|out of)\s*100/);
      expect(text).not.toMatch(/\/\s*500|out of 500|500[- ]point/);
      await testInfo.attach('extracted-report-text', { body: text, contentType: 'text/plain' });
    } finally {
      await parser.destroy();
    }
  });
});