import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core';
import {
  canSendMandatoryTrainingMilestone,
  getDueMandatoryTrainingMilestones,
  getMandatoryTrainingMilestonePlan,
  processMandatoryTrainingEmails,
  setMandatoryTrainingCompletionResolver,
  utcDay,
} from '../mandatory-training-email';

const mocks = vi.hoisted(() => ({
  execute: vi.fn(),
  send: vi.fn(),
  complete: false,
  claims: new Map<string, string>(),
  emailRows: new Map<string, { status: string; error: string | null }>(),
}));

vi.mock('../../db', () => ({ db: { execute: mocks.execute } }));
vi.mock('../../config/environment', () => ({ getBaseUrl: () => 'https://training.example.test' }));
vi.mock('../../sendgrid', () => ({
  getEmailBranding: vi.fn().mockResolvedValue({
    primaryColor: '#123456',
    logoUrl: null,
    brandName: 'Example',
    headerHtml: '<header>Example</header>',
    footerHtml: '<footer>Example</footer>',
  }),
  buildEmailFrom: vi.fn().mockResolvedValue('training@example.test'),
  getUncachableSendGridClient: vi.fn(async () => ({
    client: { send: mocks.send },
    fromEmail: 'training@example.test',
  })),
}));

const dialect = new PgDialect();
const scheduleRecipient = {
  scheduleId: 'schedule-1',
  recipientId: 'recipient-1',
  userId: 'user-1',
  email: 'learner@example.test',
  emailVerified: true,
  name: 'Learner',
  username: 'learner',
  tenantId: 'tenant-1',
  scheduleTenantId: 'tenant-1',
  title: 'Security training',
  releaseAt: new Date('2026-05-01T00:00:00.000Z'),
  dueAt: new Date('2026-05-10T12:00:00.000Z'),
};

function configureMockDb(): void {
  mocks.execute.mockReset().mockImplementation(async (query: unknown) => {
    const { sql: statement, params } = dialect.sqlToQuery(query as any);
    const normalized = statement.toLowerCase();
    if (normalized.includes('from mandatory_training_schedules s')) {
      return { rows: [{ ...scheduleRecipient }] };
    }
    if (normalized.includes('from mandatory_training_items')) {
      return {
        rows: [{
          scheduleId: 'schedule-1',
          id: 'item-1',
          kind: 'course',
          contentId: 'course-1',
          title: 'Security basics',
          order: 0,
        }],
      };
    }
    if (normalized.includes('from course_enrollments')) {
      return { rows: mocks.complete ? [{ completed: 1 }] : [] };
    }
    if (normalized.includes('insert into mandatory_training_emails')) {
      const recipientId = String(params[0]);
      const milestone = String(params[1]);
      const key = `${recipientId}:${milestone}`;
      if (mocks.claims.has(key)) return { rows: [] };
      const id = `email-${mocks.claims.size + 1}`;
      mocks.claims.set(key, id);
      return { rows: [{ id }] };
    }
    if (normalized.includes('update mandatory_training_emails')) {
      const id = String(params[3]);
      mocks.emailRows.set(id, {
        status: String(params[0]),
        error: params[2] == null ? null : String(params[2]),
      });
      return { rows: [] };
    }
    throw new Error(`Unexpected query in mandatory-training email test: ${statement}`);
  });
}

describe('mandatory-training-email UTC milestone boundaries', () => {
  beforeEach(() => {
    mocks.claims.clear();
    mocks.emailRows.clear();
    mocks.complete = false;
    mocks.send.mockReset().mockResolvedValue([{ statusCode: 202 }]);
    configureMockDb();
    setMandatoryTrainingCompletionResolver(undefined);
  });

  it('does not release or remind before the UTC release date', () => {
    expect(getDueMandatoryTrainingMilestones(
      '2026-05-10T23:59:00.000Z',
      '2026-05-20T00:00:00.000Z',
      new Date('2026-05-10T23:58:59.999Z'),
    )).toEqual([]);
  });

  it('sends a reminder only on its actual UTC target day', () => {
    expect(getDueMandatoryTrainingMilestones(
      '2026-05-01T18:00:00.000Z',
      '2026-05-10T23:59:00.000Z',
      new Date('2026-05-03T00:00:00.000Z'),
    )).toEqual(['release', '7d']);
    expect(getMandatoryTrainingMilestonePlan(
      '2026-05-01T18:00:00.000Z',
      '2026-05-10T23:59:00.000Z',
      new Date('2026-05-04T00:00:00.000Z'),
    )).toMatchObject({
      send: null,
      skipped: expect.arrayContaining([
        expect.objectContaining({ milestone: 'release' }),
        expect.objectContaining({ milestone: '7d' }),
      ]),
    });
  });

  it('honors the exact release timestamp and starts overdue only after dueAt', () => {
    expect(getDueMandatoryTrainingMilestones(
      '2026-05-10T23:59:00.000Z',
      '2026-05-20T00:00:00.000Z',
      new Date('2026-05-10T23:58:59.999Z'),
    )).toEqual([]);
    expect(getMandatoryTrainingMilestonePlan(
      '2026-05-01T00:00:00.000Z',
      '2026-05-10T12:00:00.000Z',
      new Date('2026-05-10T12:00:00.000Z'),
    ).send).toBeNull();
    expect(getMandatoryTrainingMilestonePlan(
      '2026-05-01T00:00:00.000Z',
      '2026-05-10T12:00:00.000Z',
      new Date('2026-05-10T12:00:00.001Z'),
    ).send).toBe('overdue');
  });

  it('limits late catch-up to the most recent milestone and records older ones skipped', () => {
    const plan = getMandatoryTrainingMilestonePlan(
      '2026-05-01T00:00:00.000Z',
      '2026-05-10T12:00:00.000Z',
      new Date('2026-05-10T12:00:00.001Z'),
    );
    expect(plan.send).toBe('overdue');
    expect(plan.skipped.map(({ milestone }) => milestone)).toEqual(['release', '7d', '1d']);
    expect(plan.skipped.every(({ reason }) => reason.length > 0)).toBe(true);
  });

  it('still allows the assignment release notice after completion but suppresses reminders', () => {
    expect(canSendMandatoryTrainingMilestone('release', true)).toBe(true);
    expect(canSendMandatoryTrainingMilestone('7d', true)).toBe(false);
    expect(canSendMandatoryTrainingMilestone('1d', true)).toBe(false);
    expect(canSendMandatoryTrainingMilestone('overdue', true)).toBe(false);
    expect(canSendMandatoryTrainingMilestone('overdue', false)).toBe(true);
  });

  it('normalizes timestamps to UTC calendar days and exposes the completion resolver contract', () => {
    expect(utcDay('2026-05-01T23:59:59.999Z').toISOString()).toBe('2026-05-01T00:00:00.000Z');
    expect(() => setMandatoryTrainingCompletionResolver(async () => true)).not.toThrow();
    setMandatoryTrainingCompletionResolver(undefined);
  });

  it('deduplicates concurrent ticks and a subsequent restart using the durable unique claim', async () => {
    const tickAt = new Date('2026-05-03T12:00:00.000Z');
    const [firstRun, concurrentRun] = await Promise.all([
      processMandatoryTrainingEmails(tickAt),
      processMandatoryTrainingEmails(tickAt),
    ]);
    const restartedRun = await processMandatoryTrainingEmails(tickAt);

    expect(firstRun.sent + concurrentRun.sent + restartedRun.sent).toBe(1);
    expect(mocks.send).toHaveBeenCalledTimes(1);
    expect([...mocks.claims.keys()].filter((key) => key.endsWith(':7d'))).toHaveLength(1);
    expect([...mocks.emailRows.values()].filter((row) => row.status === 'sent')).toHaveLength(1);
  });

  it('records completed work as skipped and sends no release-date reminders', async () => {
    mocks.complete = true;
    const run = await processMandatoryTrainingEmails(new Date('2026-05-03T12:00:00.000Z'));

    expect(run.sent).toBe(0);
    expect(mocks.send).not.toHaveBeenCalled();
    expect([...mocks.emailRows.values()]).toHaveLength(4);
    expect([...mocks.emailRows.values()].every((row) =>
      row.status === 'skipped' && row.error?.includes('complete'),
    )).toBe(true);
  });
});