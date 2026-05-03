import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { eq } from 'drizzle-orm';
import { db } from '../../server/db';
import { storage } from '../../server/storage';
import * as schema from '../../shared/schema';
import { SeedHarness } from './helpers/seed';

// Mock orthogonal services we don't want to exercise here. Storage and db
// are the real implementations so route + persistence behaviour is covered.
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

const harness = new SeedHarness('mlife');

afterAll(async () => {
  await harness.cleanup();
});

async function buildApp(role: string | null = 'global_admin', username = 'admin1') {
  const { buildTestApp } = await import('./helpers/app');
  const { registerModelRoutes } = await import('../../server/routes/model-routes');
  const app = buildTestApp({
    user: role
      ? { id: 'u-' + username, username, password: 'x', role, tenantId: null }
      : null,
  });
  registerModelRoutes(app);
  return app;
}

async function seedFullModel() {
  const model = await harness.createModel({ status: 'published' });
  const dim = await harness.createDimension(model.id, 'strategy', 'Strategy', 1);
  await harness.createMcQuestion(model.id, dim.id, 'Q1', 1);
  await harness.createMcQuestion(model.id, dim.id, 'Q2', 2);
  return model;
}

describe('Model lifecycle: duplicate, archive, delete (real storage)', () => {
  it('duplicates a model with all dimensions, questions, and answers', async () => {
    const app = await buildApp('global_admin');
    const model = await seedFullModel();

    const res = await request(app).post(`/api/models/${model.id}/duplicate`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    const copy = res.body.model;
    expect(copy.name).toBe(`${model.name} (Copy)`);
    expect(copy.status).toBe('draft');
    harness.trackModel(copy.id);

    const copyDims = await storage.getDimensionsByModelId(copy.id);
    const copyQs = await storage.getQuestionsByModelId(copy.id);
    expect(copyDims).toHaveLength(1);
    expect(copyQs).toHaveLength(2);

    const allCopyAnswers = (await Promise.all(
      copyQs.map(q => storage.getAnswersByQuestionId(q.id))
    )).flat();
    expect(allCopyAnswers).toHaveLength(4);
  });

  it('returns 404 when duplicating an unknown model', async () => {
    const app = await buildApp('global_admin');
    const res = await request(app).post(`/api/models/${harness.prefix}_missing/duplicate`);
    expect(res.status).toBe(404);
  });

  it('rejects duplicate for non-admin users', async () => {
    const app = await buildApp('user');
    const model = await harness.createModel();
    const res = await request(app).post(`/api/models/${model.id}/duplicate`);
    expect(res.status).toBe(401);
  });

  it('archives a model via PUT status update and persists the change', async () => {
    const app = await buildApp('global_admin');
    const model = await harness.createModel({ status: 'published' });

    const res = await request(app)
      .put(`/api/models/${model.id}`)
      .send({ status: 'archived' });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('archived');

    const reread = await storage.getModel(model.id);
    expect(reread?.status).toBe('archived');
  });

  it('hides archived models from the public listing', async () => {
    const app = await buildApp(null);
    const model = await harness.createModel({ status: 'published' });
    await storage.updateModel(model.id, { status: 'archived' });

    const res = await request(app).get('/api/models');
    expect(res.status).toBe(200);
    expect(res.body.find((m: any) => m.id === model.id)).toBeUndefined();
  });

  it('admin can delete a model and the row disappears from storage', async () => {
    const app = await buildApp('global_admin');
    const model = await harness.createModel();

    const res = await request(app).delete(`/api/models/${model.id}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const reread = await storage.getModel(model.id);
    expect(reread).toBeUndefined();
  });

  it('rejects delete for non-admin users', async () => {
    const app = await buildApp('user');
    const model = await harness.createModel();

    const res = await request(app).delete(`/api/models/${model.id}`);
    expect(res.status).toBe(401);

    const stillThere = await storage.getModel(model.id);
    expect(stillThere?.id).toBe(model.id);
  });
});
