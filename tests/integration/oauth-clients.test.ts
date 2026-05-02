import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcryptjs';

// Tiny in-memory shim for the drizzle calls used in oauth-clients-routes.ts.
// The route only ever uses .select / .insert / .update / .delete with simple
// chains, so we just need to mimic the surface area used.

const fakeDb = (() => {
  const clients: any[] = [];
  let nextId = 1;

  const select = () => ({
    from: (_table: any) => ({
      where: (_cond?: any) => ({
        limit: async (_n: number) => clients.slice(0, _n),
        orderBy: () => clients.slice(),
      }),
      orderBy: () => clients.slice(),
    }),
  });

  const insert = (_table: any) => ({
    values: (vals: any) => ({
      returning: async () => {
        const row = {
          id: String(nextId++),
          createdAt: new Date(),
          updatedAt: new Date(),
          ...vals,
        };
        clients.push(row);
        return [row];
      },
    }),
  });

  // For "list": we need select().from().orderBy() to return clients.
  // The route uses db.select({...projection}).from(...).orderBy(...).
  // We override select() to support both shapes.
  const selectAny = (_proj?: any) => ({
    from: () => ({
      where: () => ({
        limit: async (_n: number) => clients.slice(0, _n),
      }),
      orderBy: () => clients.slice(),
    }),
  });

  const update = (_table: any) => ({
    set: (vals: any) => ({
      where: (_cond: any) => ({
        returning: async () => {
          // For the most recent test target the first matching client.
          if (clients.length === 0) return [];
          // Find by the captured id on the next call - the route stores the
          // id via the where clause; we approximate by pulling the
          // pendingTargetId set externally.
          const target = (fakeDb as any)._pendingTargetId
            ? clients.find(c => c.id === (fakeDb as any)._pendingTargetId)
            : clients[0];
          if (!target) return [];
          Object.assign(target, vals);
          return [target];
        },
      }),
    }),
  });

  const del = (_table: any) => ({
    where: (_cond: any) => {
      const target = (fakeDb as any)._pendingTargetId
        ? clients.find(c => c.id === (fakeDb as any)._pendingTargetId)
        : null;
      if (target) {
        const idx = clients.indexOf(target);
        if (idx >= 0) clients.splice(idx, 1);
      }
      return Promise.resolve();
    },
  });

  return {
    clients,
    reset() {
      clients.length = 0;
      nextId = 1;
      (fakeDb as any)._pendingTargetId = null;
    },
    select: selectAny,
    insert,
    update,
    delete: del,
    _pendingTargetId: null as string | null,
  };
})();

vi.mock('../../server/db', () => ({ db: fakeDb }));

// The routes import several helpers/services; stub the ones not exercised here.
vi.mock('../../server/storage', () => ({ storage: {} }));
vi.mock('../../server/permissions', () => ({
  canManageUsers: () => true,
  canAssignRole: () => true,
  checkIsGlobalAdmin: () => true,
  getAccessibleTenantIds: () => null,
  canAccessModel: async () => true,
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

describe('OAuth Clients CRUD (admin)', () => {
  beforeEach(() => {
    fakeDb.reset();
  });

  async function buildAdminApp() {
    const { buildTestApp } = await import('./helpers/app');
    const { registerOauthClientsRoutes } = await import(
      '../../server/routes/oauth-clients-routes'
    );
    const app = buildTestApp({
      user: {
        id: 'admin-1',
        username: 'admin',
        password: 'x',
        role: 'global_admin',
      },
    });
    registerOauthClientsRoutes(app);
    return app;
  }

  async function buildAnonApp() {
    const { buildTestApp } = await import('./helpers/app');
    const { registerOauthClientsRoutes } = await import(
      '../../server/routes/oauth-clients-routes'
    );
    const app = buildTestApp();
    registerOauthClientsRoutes(app);
    return app;
  }

  it('rejects unauthenticated callers with 401', async () => {
    const app = await buildAnonApp();
    const res = await request(app).get('/api/admin/oauth-clients');
    expect(res.status).toBe(401);
  });

  it('creates, lists, updates, regenerates secret, and deletes OAuth clients', async () => {
    const app = await buildAdminApp();

    // CREATE
    const createRes = await request(app)
      .post('/api/admin/oauth-clients')
      .send({
        name: 'Test App',
        redirectUris: ['https://example.com/cb'],
        environment: 'development',
        pkceRequired: true,
      });
    expect(createRes.status).toBe(200);
    expect(createRes.body.clientId).toMatch(/^test_app_/);
    expect(typeof createRes.body.clientSecret).toBe('string');
    expect(createRes.body.clientSecret.length).toBeGreaterThan(20);
    const id = createRes.body.id;
    // The clientSecretHash on the row should verify against the returned secret.
    expect(
      await bcrypt.compare(createRes.body.clientSecret, createRes.body.clientSecretHash)
    ).toBe(true);

    // LIST
    const listRes = await request(app).get('/api/admin/oauth-clients');
    expect(listRes.status).toBe(200);
    expect(Array.isArray(listRes.body)).toBe(true);
    expect(listRes.body.length).toBe(1);
    expect(listRes.body[0].name).toBe('Test App');

    // CREATE - missing required field returns 400
    const badRes = await request(app)
      .post('/api/admin/oauth-clients')
      .send({ name: 'Bad' });
    expect(badRes.status).toBe(400);

    // UPDATE
    fakeDb._pendingTargetId = id;
    const updateRes = await request(app)
      .put(`/api/admin/oauth-clients/${id}`)
      .send({ name: 'Renamed App', pkceRequired: false });
    expect(updateRes.status).toBe(200);
    expect(updateRes.body.name).toBe('Renamed App');
    expect(updateRes.body.pkceRequired).toBe(false);

    // REGENERATE SECRET
    fakeDb._pendingTargetId = id;
    const regenRes = await request(app).post(
      `/api/admin/oauth-clients/${id}/regenerate-secret`
    );
    expect(regenRes.status).toBe(200);
    expect(typeof regenRes.body.clientSecret).toBe('string');
    expect(regenRes.body.clientSecret).not.toBe(createRes.body.clientSecret);

    // DELETE
    fakeDb._pendingTargetId = id;
    const delRes = await request(app).delete(`/api/admin/oauth-clients/${id}`);
    expect(delRes.status).toBe(200);
    expect(delRes.body.success).toBe(true);
    expect(fakeDb.clients.length).toBe(0);
  });
});
