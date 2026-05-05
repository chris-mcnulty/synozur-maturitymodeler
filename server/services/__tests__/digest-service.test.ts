import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { db } from '../../db';
import { sql, eq } from 'drizzle-orm';
import * as schema from '@shared/schema';
import type { getUncachableSendGridClient as GetSgClientFn } from '../../sendgrid';

// ---------------------------------------------------------------------------
// Mocks — hoisted before any module imports by Vitest
// ---------------------------------------------------------------------------

vi.mock('../ai-service', () => ({
  aiService: {
    generatePortfolioNarrative: vi.fn().mockResolvedValue('Mocked narrative for tests'),
  },
}));

vi.mock('../../config/environment', () => ({
  getBaseUrl: () => 'https://test.example.com',
}));

// Make SendGrid unavailable so runMonthlyDigest returns early after the
// duplicate-prevention guards fire, without attempting real email sends.
vi.mock('../../sendgrid', () => ({
  getUncachableSendGridClient: vi.fn().mockRejectedValue(
    new Error('SendGrid not configured in test environment'),
  ),
  buildEmailFrom: vi.fn(),
}));

// admin-routes is a heavy Express module; mock only the exported helper used
// by the digest service so its transitive imports don't run in tests.
vi.mock('../../routes/admin-routes', () => ({
  buildInsightsFromRows: vi.fn().mockReturnValue({
    models: [],
    crossModelDimensions: [],
  }),
}));

// ---------------------------------------------------------------------------
// Import the module under test (after mocks are registered)
// ---------------------------------------------------------------------------
import { runMonthlyDigest } from '../digest-service';

// ---------------------------------------------------------------------------
// Constants mirrored from digest-service.ts (not exported, but stable)
// ---------------------------------------------------------------------------
const DIGEST_LAST_RUN_KEY = 'digest:lastRunMonth';
const LOCK_KEY_1 = 219734871;
const LOCK_KEY_2 = 1836018548;

function currentMonthKey(date = new Date()): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function cleanDigestSetting(): Promise<void> {
  await db.delete(schema.settings).where(eq(schema.settings.key, DIGEST_LAST_RUN_KEY));
}

async function releaseAdvisoryLock(): Promise<void> {
  // Safe to call even when the lock is not held — returns false but does not error.
  await db
    .execute(sql`SELECT pg_advisory_unlock(${LOCK_KEY_1}::int, ${LOCK_KEY_2}::int)`)
    .catch(() => {});
}

async function runCasUpsert(monthKey: string): Promise<unknown[]> {
  const inProgressValue = JSON.stringify({ monthKey, status: 'in_progress' });
  const result = await db.execute(sql`
    INSERT INTO settings (key, value, updated_at)
    VALUES (
      ${DIGEST_LAST_RUN_KEY},
      ${inProgressValue}::jsonb,
      NOW()
    )
    ON CONFLICT (key) DO UPDATE
      SET value      = EXCLUDED.value,
          updated_at = NOW()
      WHERE (settings.value->>'monthKey') IS DISTINCT FROM ${monthKey}
         OR (settings.value->>'status')   IS DISTINCT FROM ${'in_progress'}
    RETURNING key
  `);
  return (result as unknown as { rows: unknown[] }).rows ?? [];
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('digest-service — duplicate-prevention guards', () => {
  beforeEach(async () => {
    await cleanDigestSetting();
    await releaseAdvisoryLock();
  });

  afterEach(async () => {
    await cleanDigestSetting();
    await releaseAdvisoryLock();
  });

  // -------------------------------------------------------------------------
  // 1. Atomic CAS upsert SQL — tested directly against real Postgres
  // -------------------------------------------------------------------------
  describe('CAS upsert — atomic compare-and-swap SQL', () => {
    it('returns 1 row on the very first upsert for a new month (acquires lock)', async () => {
      const rows = await runCasUpsert(currentMonthKey());
      expect(rows).toHaveLength(1);
    });

    it('returns 0 rows when the row is already in_progress for the current month (race loser)', async () => {
      const monthKey = currentMonthKey();

      // First instance wins the race.
      const firstRows = await runCasUpsert(monthKey);
      expect(firstRows).toHaveLength(1);

      // Second instance runs the exact same CAS — must get 0 rows back.
      const secondRows = await runCasUpsert(monthKey);
      expect(secondRows).toHaveLength(0);
    });

    it('returns 0 rows on a third attempt while still in_progress', async () => {
      const monthKey = currentMonthKey();
      await runCasUpsert(monthKey);
      await runCasUpsert(monthKey);

      const thirdRows = await runCasUpsert(monthKey);
      expect(thirdRows).toHaveLength(0);
    });

    it('returns 1 row when the existing row is for a previous month (fresh run allowed)', async () => {
      // Seed a completed run from a previous month so there IS a conflicting row.
      await db
        .insert(schema.settings)
        .values({
          key: DIGEST_LAST_RUN_KEY,
          value: { monthKey: '2000-01', status: 'complete' },
        })
        .onConflictDoUpdate({
          target: schema.settings.key,
          set: {
            value: { monthKey: '2000-01', status: 'complete' },
            updatedAt: new Date(),
          },
        });

      // Current month is different → CAS should succeed.
      const rows = await runCasUpsert(currentMonthKey());
      expect(rows).toHaveLength(1);
    });

    it('returns 1 row when the existing row has status=complete for the same month (re-run scenario would be forced)', async () => {
      // This verifies the OR branch: same monthKey but status differs from in_progress.
      const monthKey = currentMonthKey();
      await db
        .insert(schema.settings)
        .values({
          key: DIGEST_LAST_RUN_KEY,
          value: { monthKey, status: 'complete' },
        })
        .onConflictDoUpdate({
          target: schema.settings.key,
          set: { value: { monthKey, status: 'complete' }, updatedAt: new Date() },
        });

      // status is 'complete', not 'in_progress' → WHERE clause is true → update fires.
      const rows = await runCasUpsert(monthKey);
      expect(rows).toHaveLength(1);
    });
  });

  // -------------------------------------------------------------------------
  // 2. runMonthlyDigest — integration tests with real Postgres for locking
  // -------------------------------------------------------------------------
  describe('runMonthlyDigest — race condition prevention', () => {
    it('allows exactly one of two simultaneous calls to proceed past the guards', async () => {
      // Fire both calls concurrently. Node's event loop will interleave the
      // async DB operations. The advisory lock (fast path) and/or the CAS
      // upsert (durable guard) must ensure exactly one call proceeds while
      // the other returns early.
      //
      // Since SendGrid is mocked to reject, the "winner" returns with a
      // SendGrid error (it got past both guards). The "loser" returns with a
      // skipping message from one of the two guards.
      const [r1, r2] = await Promise.all([runMonthlyDigest(), runMonthlyDigest()]);

      const isSkipped = (errors: string[]) =>
        errors.some(
          (e) =>
            e.includes('advisory lock held') ||
            e.includes('Another instance already claimed') ||
            e.includes('Already ran for'),
        );

      const isProceeded = (errors: string[]) =>
        errors.some((e) => e.includes('SendGrid'));

      const skipped = [r1, r2].filter((r) => isSkipped(r.errors));
      const proceeded = [r1, r2].filter((r) => isProceeded(r.errors));

      expect(skipped).toHaveLength(1);
      expect(proceeded).toHaveLength(1);
    });

    it('the proceeding call has 0 candidates (no eligible users in test DB)', async () => {
      const [r1, r2] = await Promise.all([runMonthlyDigest(), runMonthlyDigest()]);
      const proceeded = [r1, r2].find((r) =>
        r.errors.some((e) => e.includes('SendGrid')),
      );
      expect(proceeded).toBeDefined();
      expect(proceeded!.candidates).toBe(0);
    });

    it('returns early when the settings row is already in_progress for this month', async () => {
      const monthKey = currentMonthKey();

      await db
        .insert(schema.settings)
        .values({ key: DIGEST_LAST_RUN_KEY, value: { monthKey, status: 'in_progress' } })
        .onConflictDoUpdate({
          target: schema.settings.key,
          set: { value: { monthKey, status: 'in_progress' }, updatedAt: new Date() },
        });

      const result = await runMonthlyDigest();

      expect(result.errors.length).toBeGreaterThan(0);
      expect(
        result.errors.some(
          (e) =>
            e.includes(`Already ran for ${monthKey}`) ||
            e.includes('advisory lock') ||
            e.includes('Another instance'),
        ),
      ).toBe(true);
      // The run should not have processed any candidates.
      expect(result.candidates).toBe(0);
      expect(result.sent).toBe(0);
    });

    it('returns early when the settings row shows complete for this month', async () => {
      const monthKey = currentMonthKey();

      await db
        .insert(schema.settings)
        .values({ key: DIGEST_LAST_RUN_KEY, value: { monthKey, status: 'complete' } })
        .onConflictDoUpdate({
          target: schema.settings.key,
          set: { value: { monthKey, status: 'complete' }, updatedAt: new Date() },
        });

      const result = await runMonthlyDigest();

      expect(result.errors.length).toBeGreaterThan(0);
      expect(
        result.errors.some((e) => e.includes(`Already ran for ${monthKey}`)),
      ).toBe(true);
      expect(result.sent).toBe(0);
    });

    it('records the correct monthKey in the summary for the winning call', async () => {
      const [r1, r2] = await Promise.all([runMonthlyDigest(), runMonthlyDigest()]);
      const proceeded = [r1, r2].find((r) =>
        r.errors.some((e) => e.includes('SendGrid')),
      );
      expect(proceeded!.monthKey).toBe(currentMonthKey());
    });

    it('sends exactly one email across two simultaneous calls when an eligible user exists', async () => {
      // -----------------------------------------------------------------------
      // This is the most direct end-to-end assertion of the duplicate-email
      // guarantee: two concurrent calls, real Postgres for CAS, fake transport
      // layer to count actual send() invocations.
      // -----------------------------------------------------------------------

      // Build a tracked fake SendGrid client for this test only.
      const fakeSend = vi.fn().mockResolvedValue([{ statusCode: 202 }]);
      const fakeClient = { send: fakeSend };

      // Override the default (rejecting) sendgrid mock for this one test.
      // Only the winning call will reach getUncachableSendGridClient; the loser
      // is blocked by the advisory lock / CAS before it gets there.
      const sendgridMod = await import('../../sendgrid');
      const getSgClient = vi.mocked(
        sendgridMod.getUncachableSendGridClient as typeof GetSgClientFn,
      );
      getSgClient.mockResolvedValueOnce({
        client: fakeClient as any,
        fromEmail: 'noreply@test.example.com',
      });

      // Also make buildEmailFrom return a usable from-address for this call.
      const buildFrom = vi.mocked(sendgridMod.buildEmailFrom);
      buildFrom.mockResolvedValueOnce('noreply@test.example.com' as any);

      // -----------------------------------------------------------------------
      // Seed one eligible user with a completed assessment + result so that
      // runMonthlyDigest actually reaches the sgClient.send() call.
      // -----------------------------------------------------------------------
      const suffix = Date.now();

      const [model] = await db
        .insert(schema.models)
        .values({
          slug: `test-digest-model-${suffix}`,
          name: 'Test Digest Model',
          description: 'Seed for digest race test',
          status: 'published',
          modelClass: 'organizational',
          maturityScale: [
            { id: '1', name: 'Basic', description: '', minScore: 0, maxScore: 100 },
          ] as any,
        })
        .returning();

      const [user] = await db
        .insert(schema.users)
        .values({
          username: `test-digest-user-${suffix}`,
          password: 'hashed-not-real',
          email: `test-digest-${suffix}@example.com`,
          emailVerified: true,
          monthlyDigestOptOut: false,
        })
        .returning();

      const [assessment] = await db
        .insert(schema.assessments)
        .values({
          userId: user.id,
          modelId: model.id,
          status: 'completed',
          completedAt: new Date(),
        })
        .returning();

      await db.insert(schema.results).values({
        assessmentId: assessment.id,
        overallScore: 50,
        label: 'Basic',
        dimensionScores: {} as any,
      });

      try {
        const [r1, r2] = await Promise.all([runMonthlyDigest(), runMonthlyDigest()]);

        // -----------------------------------------------------------------------
        // Core assertion: the transport layer was called exactly once regardless
        // of which guard (advisory lock or CAS) stopped the second instance.
        // -----------------------------------------------------------------------
        expect(fakeSend).toHaveBeenCalledTimes(1);

        // Exactly one run should have sent the email; the other sent nothing.
        const sentCounts = [r1.sent, r2.sent].sort();
        expect(sentCounts).toEqual([0, 1]);

        // The winning run must report 1 candidate (our seeded user).
        const winner = [r1, r2].find((r) => r.sent === 1)!;
        expect(winner.candidates).toBe(1);
        expect(winner.failed).toBe(0);
      } finally {
        // Clean up seeded data in dependency order.
        await db
          .delete(schema.results)
          .where(eq(schema.results.assessmentId, assessment.id));
        await db
          .delete(schema.assessments)
          .where(eq(schema.assessments.id, assessment.id));
        // Reset the digest stamp on the user before deleting it.
        await db
          .update(schema.users)
          .set({ lastMonthlyDigestSentAt: null })
          .where(eq(schema.users.id, user.id));
        await db.delete(schema.users).where(eq(schema.users.id, user.id));
        await db.delete(schema.models).where(eq(schema.models.id, model.id));
      }
    });
  });
});
