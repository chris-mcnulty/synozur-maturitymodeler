import { afterAll, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { storage } from '../../server/storage';
import { SeedHarness } from './helpers/seed';

vi.mock('../../server/permissions', () => ({
  canAccessModel: async () => true,
  canManageUsers: () => true,
  canAssignRole: () => true,
  checkIsGlobalAdmin: (u: any) => u?.role === 'global_admin',
  getAccessibleTenantIds: () => null,
  hasAdminAccess: () => true,
}));
vi.mock('../../server/objectStorage', () => ({
  ObjectStorageService: class {},
  ObjectNotFoundError: class extends Error {},
}));
vi.mock('../../server/services/ai-service', () => ({ aiService: {} }));
vi.mock('../../server/services/ai-providers/registry', () => ({ providerRegistry: {} }));
vi.mock('../../server/services/sso-service', () => ({
  generateAdminConsentUrl: () => ({ url: '' }),
  isSsoConfigured: () => false,
  extractDomain: () => null,
}));
vi.mock('../../server/utils/password', () => ({
  hashPassword: async (p: string) => `hashed:${p}`,
  comparePasswords: async () => true,
}));

const harness = new SeedHarness('csv');

afterAll(async () => {
  await harness.cleanup();
});

async function buildApp(role: string | null = 'global_admin') {
  const { buildTestApp } = await import('./helpers/app');
  const { registerModelRoutes } = await import('../../server/routes/model-routes');
  const app = buildTestApp({
    user: role
      ? { id: `u-${role}`, username: 'a', password: 'x', role, tenantId: null }
      : null,
  });
  registerModelRoutes(app);
  return app;
}

const VALID_CSV = [
  'Question#,Question Text,Answer,Score,Interpretation,Resource Title,Resource Link,Resource Description',
  '1,"How mature is your AI strategy?","Not Started",100,"Begin with discovery","Strategy 101","https://example.com/s","Foundational guide"',
  '1,"How mature is your AI strategy?","Leading",500,"You are a leader","",""',
  '2,"Annual data volume","Numeric (0-1000 TB)",,,"",""',
].join('\n');

describe('CSV import via /api/models/:id/import-questions (real storage)', () => {
  it('imports questions and answers from a well-formed CSV (add mode)', async () => {
    const app = await buildApp('global_admin');
    const model = await harness.createModel({ status: 'draft' });

    const res = await request(app)
      .post(`/api/models/${model.id}/import-questions`)
      .send({ csvContent: VALID_CSV, mode: 'add' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.questionsImported).toBe(2);
    expect(res.body.answersImported).toBe(2);

    const persisted = await storage.getQuestionsByModelId(model.id);
    expect(persisted).toHaveLength(2);

    const numericQ = persisted.find(q => q.type === 'numeric')!;
    expect(numericQ.minValue).toBe(0);
    expect(numericQ.maxValue).toBe(1000);
    expect(numericQ.unit).toBe('TB');

    const mcQ = persisted.find(q => q.type === 'multiple_choice')!;
    const mcAnswers = await storage.getAnswersByQuestionId(mcQ.id);
    expect(mcAnswers.map(a => a.score).sort((a, b) => a - b)).toEqual([100, 500]);
  });

  it("replaces existing questions when mode is 'replace'", async () => {
    const app = await buildApp('global_admin');
    const model = await harness.createModel({ status: 'draft' });
    const dim = await harness.createDimension(model.id, 'old', 'Old', 1);
    const { question: oldQ } = await harness.createMcQuestion(model.id, dim.id, 'Old Q', 1);

    const res = await request(app)
      .post(`/api/models/${model.id}/import-questions`)
      .send({ csvContent: VALID_CSV, mode: 'replace' });
    expect(res.status).toBe(200);

    const persisted = await storage.getQuestionsByModelId(model.id);
    expect(persisted).toHaveLength(2);
    expect(persisted.find(q => q.id === oldQ.id)).toBeUndefined();
  });

  it('returns 404 when the target model does not exist', async () => {
    const app = await buildApp('global_admin');
    const res = await request(app)
      .post(`/api/models/${harness.prefix}_nope/import-questions`)
      .send({ csvContent: VALID_CSV });
    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/not found/i);
  });

  it('rejects unauthenticated callers', async () => {
    const app = await buildApp(null);
    const model = await harness.createModel({ status: 'draft' });

    const res = await request(app)
      .post(`/api/models/${model.id}/import-questions`)
      .send({ csvContent: VALID_CSV });
    expect(res.status).toBe(401);

    const persisted = await storage.getQuestionsByModelId(model.id);
    expect(persisted).toHaveLength(0);
  });

  it('skips malformed rows and imports zero on a header-only payload', async () => {
    const app = await buildApp('global_admin');
    const model = await harness.createModel({ status: 'draft' });

    const res = await request(app)
      .post(`/api/models/${model.id}/import-questions`)
      .send({
        csvContent: [
          'Question#,Question Text,Answer,Score',
          'not-a-number,,,',
          ',,,,',
        ].join('\n'),
        mode: 'add',
      });
    expect(res.status).toBe(200);
    expect(res.body.questionsImported).toBe(0);
    expect(res.body.answersImported).toBe(0);

    const persisted = await storage.getQuestionsByModelId(model.id);
    expect(persisted).toHaveLength(0);
  });

  it('returns 400 when the CSV payload is the wrong type', async () => {
    const app = await buildApp('global_admin');
    const model = await harness.createModel({ status: 'draft' });

    const res = await request(app)
      .post(`/api/models/${model.id}/import-questions`)
      .send({ csvContent: 12345 });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/import/i);
  });
});
