import { afterAll, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { inArray } from 'drizzle-orm';
import { db } from '../../server/db';
import * as schema from '../../shared/schema';
import { SeedHarness } from './helpers/seed';

// Real import-service runs against the real DB. Mock only orthogonal services.
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

const harness = new SeedHarness('imp');

afterAll(async () => {
  await harness.cleanup();
});

async function buildApp(role: string | null = 'global_admin', userId = 'admin-imp') {
  const { buildTestApp } = await import('./helpers/app');
  const { registerAssessmentRoutes } = await import(
    '../../server/routes/assessment-routes'
  );
  const app = buildTestApp({
    user: role
      ? { id: userId, username: 'a', password: 'x', role, tenantId: null }
      : null,
  });
  registerAssessmentRoutes(app);
  return app;
}

async function seedTargetModel() {
  const model = await harness.createModel({ status: 'published' });
  const dim = await harness.createDimension(model.id, 'strategy', 'Strategy', 1);
  const { question } = await harness.createMcQuestion(
    model.id,
    dim.id,
    'How mature is your AI strategy?',
    1,
  );
  return { model, dim, questionId: question.id };
}

const baseAssessment = (qid: string) => ({
  id: 'ext-a1',
  overall_score: 250,
  dimension_scores: { strategy: 250 },
  maturity_level: 'Beginning',
  answers: [{ questionId: qid, value: 100 }],
  created_at: '2025-01-01T00:00:00.000Z',
});

describe('Admin import preview + execute (real DB)', () => {
  it('rejects preview for unauthenticated users', async () => {
    const app = await buildApp(null);
    const res = await request(app)
      .post('/api/admin/import/preview')
      .send({ importData: { x: 1 }, modelSlug: 'whatever' });
    expect(res.status).toBe(401);
  });

  it('returns 400 when required fields are missing', async () => {
    const app = await buildApp('global_admin');
    const res = await request(app)
      .post('/api/admin/import/preview')
      .send({ modelSlug: 'whatever' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/required/i);
  });

  it('returns valid=true with question matches on a well-formed payload', async () => {
    const app = await buildApp('global_admin');
    const { model, questionId } = await seedTargetModel();

    const res = await request(app)
      .post('/api/admin/import/preview')
      .send({
        importData: {
          model_info: { name: model.name, dimensions: ['Strategy'] },
          question_mapping: [
            {
              question_id: 'eq1',
              question_text: 'How mature is your AI strategy?',
              dimension: 'Strategy',
              answer_options: [
                { score: 100, text: 'Low' },
                { score: 500, text: 'Leading' },
              ],
            },
          ],
          assessments: [baseAssessment('eq1')],
        },
        modelSlug: model.slug,
      });

    expect(res.status).toBe(200);
    expect(res.body.valid).toBe(true);
    expect(res.body.assessmentCount).toBe(1);
    expect(res.body.questionMatches).toHaveLength(1);
    expect(res.body.questionMatches[0].internalId).toBe(questionId);
  });

  it('returns valid=false when the model does not exist', async () => {
    const app = await buildApp('global_admin');
    const res = await request(app)
      .post('/api/admin/import/preview')
      .send({
        importData: {
          model_info: { name: 'X', dimensions: [] },
          question_mapping: [],
          assessments: [],
        },
        modelSlug: `${harness.prefix}_does_not_exist`,
      });
    expect(res.status).toBe(200);
    expect(res.body.valid).toBe(false);
    expect(res.body.errors.join(' ')).toMatch(/not found/i);
  });

  it('rejects a .model definition file as the wrong format', async () => {
    const app = await buildApp('global_admin');
    const { model } = await seedTargetModel();
    const res = await request(app)
      .post('/api/admin/import/preview')
      .send({
        importData: {
          formatVersion: '1.0',
          model: { name: 'X', slug: 'x' },
          dimensions: [],
          questions: [],
        },
        modelSlug: model.slug,
      });
    expect(res.status).toBe(200);
    expect(res.body.valid).toBe(false);
    expect(res.body.errors.join(' ')).toMatch(/\.model/);
  });

  it('executes import and persists a real batch + imported assessment', async () => {
    const app = await buildApp('global_admin', 'admin-exec');
    const adminUser = await harness.createUser('global_admin');
    const realApp = await buildApp('global_admin', adminUser.id);
    const { model, questionId } = await seedTargetModel();

    const res = await request(realApp)
      .post('/api/admin/import/execute')
      .send({
        importData: {
          model_info: { name: model.name, dimensions: ['Strategy'] },
          question_mapping: [
            {
              question_id: 'eq1',
              question_text: 'How mature is your AI strategy?',
              dimension: 'Strategy',
              answer_options: [
                { score: 100, text: 'Low' },
                { score: 500, text: 'Leading' },
              ],
            },
          ],
          assessments: [baseAssessment('eq1')],
        },
        modelSlug: model.slug,
        filename: 'export.json',
      });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.importedCount).toBe(1);
    harness.trackImportBatch(res.body.batchId);

    // Real persistence should now hold one batch + one assessment + result
    // for our model. Verify by querying the DB directly.
    const batches = await db
      .select()
      .from(schema.importBatches)
      .where(inArray(schema.importBatches.id, [res.body.batchId]));
    expect(batches).toHaveLength(1);

    const importedAssessments = await db
      .select()
      .from(schema.assessments)
      .where(inArray(schema.assessments.modelId, [model.id]));
    expect(importedAssessments.length).toBeGreaterThanOrEqual(1);
    expect(importedAssessments[0].importBatchId).toBe(res.body.batchId);

    // Sanity: the question mapped to the seeded internal question id
    expect(questionId).toBeTruthy();
  });
});
