import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';

// In-memory storage shim that satisfies just enough of the storage interface
// used by model-routes.ts admin create/edit paths.
const storeState = {
  models: [] as any[],
  dimensions: [] as any[],
  nextId: 1,
};

const storageMock = {
  async getModel(id: string) {
    return storeState.models.find(m => m.id === id);
  },
  async getModelBySlug(slug: string) {
    return storeState.models.find(m => m.slug === slug);
  },
  async getAllModels(_status?: string) {
    return storeState.models.map(m => ({ ...m, questionCount: 0 }));
  },
  async createModel(data: any) {
    const m = {
      id: `m-${storeState.nextId++}`,
      ...data,
    };
    storeState.models.push(m);
    return m;
  },
  async updateModel(id: string, data: any) {
    const m = storeState.models.find(x => x.id === id);
    if (!m) return undefined;
    Object.assign(m, data);
    return m;
  },
  async deleteModel(id: string) {
    const i = storeState.models.findIndex(m => m.id === id);
    if (i >= 0) storeState.models.splice(i, 1);
  },
  async createDimension(data: any) {
    const d = { id: `d-${storeState.nextId++}`, ...data };
    storeState.dimensions.push(d);
    return d;
  },
};

vi.mock('../../server/storage', () => ({ storage: storageMock }));
vi.mock('../../server/db', () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => ({ limit: async () => [] }),
        orderBy: () => [],
      }),
    }),
    insert: () => ({ values: () => ({ returning: async () => [] }) }),
    update: () => ({ set: () => ({ where: () => ({ returning: async () => [] }) }) }),
    delete: () => ({ where: () => Promise.resolve() }),
  },
}));
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
vi.mock('../../server/services/import-service', () => ({
  validateImportData: async () => ({}),
  executeImport: async () => ({}),
}));
vi.mock('../../server/services/sso-service', () => ({
  generateAdminConsentUrl: () => ({ url: '' }),
  isSsoConfigured: () => false,
  extractDomain: () => null,
}));
vi.mock('../../server/utils/password', () => ({
  hashPassword: async (p: string) => `hashed:${p}`,
  comparePasswords: async () => true,
}));

describe('Admin model create / edit', () => {
  beforeEach(() => {
    storeState.models.length = 0;
    storeState.dimensions.length = 0;
    storeState.nextId = 1;
  });

  async function buildApp(role: string | null = 'global_admin') {
    const { buildTestApp } = await import('./helpers/app');
    const { registerModelRoutes } = await import('../../server/routes/model-routes');
    const app = buildTestApp({
      user: role
        ? { id: 'u', username: 'a', password: 'x', role, tenantId: null }
        : null,
    });
    registerModelRoutes(app);
    return app;
  }

  it('rejects model creation for unauthenticated users', async () => {
    const app = await buildApp(null);
    const res = await request(app).post('/api/models').send({
      slug: 'm',
      name: 'M',
      description: 'D',
    });
    expect(res.status).toBe(401);
  });

  it('rejects model creation for regular users', async () => {
    const app = await buildApp('user');
    const res = await request(app).post('/api/models').send({
      slug: 'm',
      name: 'M',
      description: 'D',
    });
    expect(res.status).toBe(401);
  });

  it('admin can create a model with dimensions', async () => {
    const app = await buildApp('global_admin');
    const res = await request(app)
      .post('/api/models')
      .send({
        slug: 'ai-readiness',
        name: 'AI Readiness',
        description: 'desc',
        dimensions: [
          { key: 'strategy', label: 'Strategy', description: 's' },
          { key: 'people', label: 'People', description: 'p' },
        ],
      });
    expect(res.status).toBe(200);
    expect(res.body.slug).toBe('ai-readiness');
    expect(storeState.models.length).toBe(1);
    expect(storeState.dimensions.length).toBe(2);
    expect(storeState.dimensions.map(d => d.key)).toEqual(['strategy', 'people']);
    expect(storeState.dimensions[0].order).toBe(1);
  });

  it('rejects private model creation without an owner tenant', async () => {
    const app = await buildApp('global_admin');
    const res = await request(app).post('/api/models').send({
      slug: 'priv',
      name: 'P',
      description: 'd',
      visibility: 'private',
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/tenant/i);
  });

  it('strips ownerTenantId on public models (auto-correct)', async () => {
    const app = await buildApp('global_admin');
    const res = await request(app).post('/api/models').send({
      slug: 'pub',
      name: 'Pub',
      description: 'd',
      visibility: 'public',
      ownerTenantId: 'tenant-1',
    });
    expect(res.status).toBe(200);
    expect(res.body.ownerTenantId).toBeNull();
  });

  it('admin can edit an existing model', async () => {
    storeState.models.push({
      id: 'm-1',
      slug: 'x',
      name: 'X',
      description: 'd',
      visibility: 'public',
    });

    const app = await buildApp('global_admin');
    const res = await request(app).put('/api/models/m-1').send({
      name: 'X v2',
      description: 'updated',
    });
    expect(res.status).toBe(200);
    expect(res.body.name).toBe('X v2');
    expect(storeState.models[0].name).toBe('X v2');
  });

  it('returns 404 when editing a missing model', async () => {
    const app = await buildApp('global_admin');
    const res = await request(app).put('/api/models/missing').send({
      name: 'whatever',
    });
    expect(res.status).toBe(404);
  });
});
