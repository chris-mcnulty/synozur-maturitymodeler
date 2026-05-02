import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { scrypt, randomBytes } from 'crypto';
import { promisify } from 'util';

const scryptAsync = promisify(scrypt);

// A real-style password hasher matching server/auth.ts
async function hashPasswordReal(password: string) {
  const salt = randomBytes(16).toString('hex');
  const buf = (await scryptAsync(password, salt, 64)) as Buffer;
  return `${buf.toString('hex')}.${salt}`;
}

const state = {
  users: [] as any[],
};

const storageMock: any = {
  sessionStore: undefined,
  async getUser(id: string) {
    return state.users.find(u => u.id === id);
  },
  async getUserByUsername(username: string) {
    return state.users.find(u => u.username === username);
  },
  async getUserByEmail(email: string) {
    return state.users.find(u => u.email === email);
  },
  async createUser(data: any) {
    const u = { id: `u-${state.users.length + 1}`, ...data };
    state.users.push(u);
    return u;
  },
  async updateUser(id: string, data: any) {
    const u = state.users.find(x => x.id === id);
    if (!u) return undefined;
    Object.assign(u, data);
    return u;
  },
};

const dbMock = {
  select: () => ({
    from: () => ({
      where: (_cond: any) => {
        // The change-password route does:
        //   db.select().from(users).where(eq(users.id, req.user.id))
        // We approximate by returning all users; the route will pick [0].
        const arr = state.users.slice();
        (arr as any).then = undefined;
        return Promise.resolve(arr);
      },
    }),
  }),
  update: (_table: any) => ({
    set: (vals: any) => ({
      where: (_cond: any) => {
        // For the test, we always update the only user we created.
        if (state.users.length > 0) {
          Object.assign(state.users[0], vals);
        }
        return Promise.resolve();
      },
    }),
  }),
};

vi.mock('../../server/storage', () => ({ storage: storageMock }));
vi.mock('../../server/db', () => ({ db: dbMock, pool: {} as any }));
vi.mock('../../server/permissions', () => ({
  canAccessModel: async () => true,
  canManageUsers: () => true,
  canAssignRole: () => true,
  checkIsGlobalAdmin: () => false,
  getAccessibleTenantIds: () => null,
  hasAdminAccess: () => false,
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
  startSsoStateCleanup: () => {},
}));
vi.mock('../../server/services/email-verification', () => ({
  generateVerificationToken: async () => 'tok',
  sendVerificationEmail: async () => {},
  getUserByEmail: async (email: string) => state.users.find(u => u.email === email),
  verifyEmailToken: async () => ({ success: true }),
}));
vi.mock('../../server/sendgrid', () => ({
  sendEmail: async () => true,
  sendPasswordResetEmail: async () => true,
}));

describe('login + change password flow', () => {
  process.env.SESSION_SECRET = 'test-secret-do-not-use';

  beforeEach(async () => {
    state.users.length = 0;
    state.users.push({
      id: 'u-1',
      username: 'alice',
      email: 'alice@example.com',
      password: await hashPasswordReal('OldPass!1'),
      role: 'user',
      tenantId: null,
      emailVerified: true,
    });
  });

  async function buildApp() {
    // Use the real setupAuth + the real auth-users-routes so we exercise the
    // production passport-local + change-password handlers. Storage is mocked
    // (so its .sessionStore is undefined); express-session falls back to its
    // built-in MemoryStore, which is fine for tests.
    const express = (await import('express')).default;
    const { setupAuth } = await import('../../server/auth');
    const { registerAuthUsersRoutes } = await import(
      '../../server/routes/auth-users-routes'
    );
    const app = express();
    app.use(express.json());
    setupAuth(app);
    registerAuthUsersRoutes(app);
    return app;
  }

  it('rejects login with the wrong password', async () => {
    const app = await buildApp();
    const res = await request(app)
      .post('/api/login')
      .send({ username: 'alice', password: 'wrong' });
    expect(res.status).toBe(401);
  });

  it('logs in with the correct password and returns a session cookie', async () => {
    const app = await buildApp();
    const res = await request(app)
      .post('/api/login')
      .send({ username: 'alice', password: 'OldPass!1' });
    expect(res.status).toBe(200);
    expect(res.body.username).toBe('alice');
    expect(res.body.password).toBeUndefined();
    expect(res.headers['set-cookie']).toBeDefined();
  });

  it('changes password successfully and the new password works for login', async () => {
    const app = await buildApp();
    const agent = request.agent(app);

    // login first
    const login = await agent
      .post('/api/login')
      .send({ username: 'alice', password: 'OldPass!1' });
    expect(login.status).toBe(200);

    // change password
    const change = await agent
      .post('/api/auth/change-password')
      .send({ currentPassword: 'OldPass!1', newPassword: 'NewPass!2' });
    expect(change.status).toBe(200);
    expect(change.body.success).toBe(true);

    // login again with new password using a fresh agent
    const fresh = request.agent(app);
    const reLogin = await fresh
      .post('/api/login')
      .send({ username: 'alice', password: 'NewPass!2' });
    expect(reLogin.status).toBe(200);
  });

  it('rejects change-password when current password is wrong', async () => {
    const app = await buildApp();
    const agent = request.agent(app);
    await agent
      .post('/api/login')
      .send({ username: 'alice', password: 'OldPass!1' });
    const res = await agent
      .post('/api/auth/change-password')
      .send({ currentPassword: 'WRONG!1', newPassword: 'NewPass!2' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/current password is incorrect/i);
  });

  it('rejects change-password when not logged in', async () => {
    const app = await buildApp();
    const res = await request(app)
      .post('/api/auth/change-password')
      .send({ currentPassword: 'OldPass!1', newPassword: 'NewPass!2' });
    expect(res.status).toBe(401);
  });

  it('rejects change-password when new password fails complexity rules', async () => {
    const app = await buildApp();
    const agent = request.agent(app);
    await agent
      .post('/api/login')
      .send({ username: 'alice', password: 'OldPass!1' });
    const res = await agent
      .post('/api/auth/change-password')
      .send({ currentPassword: 'OldPass!1', newPassword: 'short' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/invalid/i);
  });
});
