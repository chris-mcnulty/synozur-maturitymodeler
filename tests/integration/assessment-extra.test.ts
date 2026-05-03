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
vi.mock('../../server/services/ai-service', () => ({
  aiService: { generateRecommendations: async () => '' },
}));
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

const harness = new SeedHarness('axt');

afterAll(async () => {
  await harness.cleanup();
});

async function buildApp(userId: string) {
  const { buildTestApp } = await import('./helpers/app');
  const { registerAssessmentRoutes } = await import(
    '../../server/routes/assessment-routes'
  );
  const app = buildTestApp({
    user: { id: userId, username: 'alice', password: 'x', role: 'user', tenantId: null },
  });
  registerAssessmentRoutes(app);
  return app;
}

async function seedScenario() {
  const user = await harness.createUser('user');
  const model = await harness.createModel({ status: 'published' });
  const dim = await harness.createDimension(model.id, 'strategy', 'Strategy', 1);
  const { question, low, high } = await harness.createMcQuestion(
    model.id, dim.id, 'How mature?', 1,
  );
  return { user, model, dim, question, low, high };
}

describe('Assessment results regeneration and listing (real storage)', () => {
  it('regenerates results: second calculate updates the existing row, not duplicates it', async () => {
    const { user, model, question, low, high } = await seedScenario();
    const app = await buildApp(user.id);

    const a = await request(app)
      .post('/api/assessments')
      .send({ modelId: model.id, userId: user.id });
    expect(a.status).toBe(200);
    const id = a.body.id;

    await request(app)
      .post(`/api/assessments/${id}/responses`)
      .send({ questionId: question.id, answerId: low.id });
    const calc1 = await request(app).post(`/api/assessments/${id}/calculate`);
    expect(calc1.status).toBe(200);
    expect(calc1.body.overallScore).toBe(100);
    const firstResultId = calc1.body.id;

    // Change response and recalculate
    await request(app)
      .post(`/api/assessments/${id}/responses`)
      .send({ questionId: question.id, answerId: high.id });
    const calc2 = await request(app).post(`/api/assessments/${id}/calculate`);
    expect(calc2.status).toBe(200);
    expect(calc2.body.overallScore).toBe(500);
    expect(calc2.body.label).toBe('Transformational');
    // Same result row, updated in place
    expect(calc2.body.id).toBe(firstResultId);

    const stored = await storage.getResult(id);
    expect(stored?.overallScore).toBe(500);
    expect(stored?.id).toBe(firstResultId);
  });

  it('returns an error from calculate when the assessment has no responses', async () => {
    const { user, model } = await seedScenario();
    const app = await buildApp(user.id);
    const a = await request(app)
      .post('/api/assessments')
      .send({ modelId: model.id, userId: user.id });

    const res = await request(app).post(`/api/assessments/${a.body.id}/calculate`);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/no responses/i);
  });

  it('returns 400 on a response upsert with an invalid payload', async () => {
    const { user, model } = await seedScenario();
    const app = await buildApp(user.id);
    const a = await request(app)
      .post('/api/assessments')
      .send({ modelId: model.id, userId: user.id });

    // Missing questionId entirely
    const res = await request(app)
      .post(`/api/assessments/${a.body.id}/responses`)
      .send({ answerId: 'whatever' });
    expect(res.status).toBe(400);

    const persisted = await storage.getAssessmentResponses(a.body.id);
    expect(persisted).toHaveLength(0);
  });

  it('upserts a response and calculates the result against the latest answer', async () => {
    const { user, model, question, low, high } = await seedScenario();
    const app = await buildApp(user.id);

    const a = await request(app)
      .post('/api/assessments')
      .send({ modelId: model.id, userId: user.id });
    expect(a.status).toBe(200);
    const id = a.body.id;

    // First save: low score, then overwrite with high score (response upsert)
    const r1 = await request(app)
      .post(`/api/assessments/${id}/responses`)
      .send({ questionId: question.id, answerId: low.id });
    expect(r1.status).toBe(200);
    const r2 = await request(app)
      .post(`/api/assessments/${id}/responses`)
      .send({ questionId: question.id, answerId: high.id });
    expect(r2.status).toBe(200);

    // The second POST must update, not insert a second row
    const persisted = await storage.getAssessmentResponses(id);
    expect(persisted).toHaveLength(1);
    expect(persisted[0].answerId).toBe(high.id);

    const calc = await request(app).post(`/api/assessments/${id}/calculate`);
    expect(calc.status).toBe(200);
    expect(calc.body.overallScore).toBe(500);
    expect(calc.body.label).toBe('Transformational');

    // Verify the result is also persisted to storage
    const stored = await storage.getResult(id);
    expect(stored?.overallScore).toBe(500);
  });

  it('exports completed assessment data as JSON', async () => {
    const { user, model, question, high } = await seedScenario();
    const app = await buildApp(user.id);
    const a = await request(app)
      .post('/api/assessments')
      .send({ modelId: model.id, userId: user.id });
    const id = a.body.id;
    await request(app)
      .post(`/api/assessments/${id}/responses`)
      .send({ questionId: question.id, answerId: high.id });
    await request(app).post(`/api/assessments/${id}/calculate`);

    const exp = await request(app).get(`/api/assessments/${id}/export`);
    expect(exp.status).toBe(200);
    expect(exp.headers['content-disposition']).toMatch(/attachment.*export\.json/);
    expect(exp.body.assessment.id).toBe(id);
    expect(exp.body.assessment.modelSlug).toBe(model.slug);
    expect(exp.body.responses).toHaveLength(1);
    expect(exp.body.result.overallScore).toBe(500);
  });

  it('returns 404 when exporting an unknown assessment', async () => {
    const { user } = await seedScenario();
    const app = await buildApp(user.id);
    const res = await request(app).get(`/api/assessments/${harness.prefix}_missing/export`);
    expect(res.status).toBe(404);
  });

  it('rejects recommendations for an in-progress assessment with 404', async () => {
    const { user, model } = await seedScenario();
    const app = await buildApp(user.id);
    const a = await request(app)
      .post('/api/assessments')
      .send({ modelId: model.id, userId: user.id });
    const res = await request(app).post(`/api/assessments/${a.body.id}/recommendations`);
    expect(res.status).toBe(404);
  });

  it('updates an assessment via PATCH (proxy demographics) and persists', async () => {
    const { user, model } = await seedScenario();
    const app = await buildApp(user.id);
    const a = await request(app)
      .post('/api/assessments')
      .send({ modelId: model.id, userId: user.id });

    const res = await request(app)
      .patch(`/api/assessments/${a.body.id}`)
      .send({ proxyName: 'Acme Corp', proxyIndustry: 'Finance' });
    expect(res.status).toBe(200);
    expect(res.body.proxyName).toBe('Acme Corp');
    expect(res.body.proxyIndustry).toBe('Finance');

    const reread = await storage.getAssessment(a.body.id);
    expect(reread?.proxyName).toBe('Acme Corp');
    expect(reread?.proxyIndustry).toBe('Finance');
  });

  it('returns 404 when patching an unknown assessment', async () => {
    const { user } = await seedScenario();
    const app = await buildApp(user.id);
    const res = await request(app)
      .patch(`/api/assessments/${harness.prefix}_missing`)
      .send({ proxyName: 'X' });
    expect(res.status).toBe(404);
  });

  it('lists results for a user via /api/users/:id/results', async () => {
    const { user, model, question, high } = await seedScenario();
    const app = await buildApp(user.id);
    const a = await request(app)
      .post('/api/assessments')
      .send({ modelId: model.id, userId: user.id });
    await request(app)
      .post(`/api/assessments/${a.body.id}/responses`)
      .send({ questionId: question.id, answerId: high.id });
    await request(app).post(`/api/assessments/${a.body.id}/calculate`);

    const res = await request(app).get(`/api/users/${user.id}/results`);
    expect(res.status).toBe(200);
    expect(res.body.length).toBeGreaterThanOrEqual(1);
    const mine = res.body.find((r: any) => r.assessmentId === a.body.id);
    expect(mine?.overallScore).toBe(500);
  });
});
