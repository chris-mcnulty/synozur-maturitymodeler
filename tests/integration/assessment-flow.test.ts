import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import session from 'express-session';
import { PgDialect } from 'drizzle-orm/pg-core';

// In-memory state shared between the storage and db mocks.
const state = {
  models: [] as any[],
  dimensions: [] as any[],
  questions: [] as any[],
  answers: [] as any[],
  assessments: [] as any[],
  responses: [] as any[],
  results: [] as any[],
  users: [] as any[],
  nextId: 1,
};

const storageMock = {
  async getModel(id: string) {
    return state.models.find(m => m.id === id);
  },
  async getDimensionsByModelId(modelId: string) {
    return state.dimensions.filter(d => d.modelId === modelId);
  },
  async getQuestionsByModelId(modelId: string) {
    return state.questions.filter(q => q.modelId === modelId);
  },
  async getQuestion(id: string) {
    return state.questions.find(q => q.id === id);
  },
  async getAnswersByQuestionId(qid: string) {
    return state.answers.filter(a => a.questionId === qid);
  },
  async createAssessment(data: any) {
    const a = { id: `a-${state.nextId++}`, status: 'in_progress', ...data };
    state.assessments.push(a);
    return a;
  },
  async getAssessment(id: string) {
    return state.assessments.find(a => a.id === id);
  },
  async updateAssessment(id: string, data: any) {
    const a = state.assessments.find(x => x.id === id);
    if (!a) return undefined;
    Object.assign(a, data);
    return a;
  },
  async getAssessmentResponse(assessmentId: string, questionId: string) {
    return state.responses.find(
      r => r.assessmentId === assessmentId && r.questionId === questionId
    );
  },
  async createAssessmentResponse(data: any) {
    const r = { id: `r-${state.nextId++}`, ...data };
    state.responses.push(r);
    return r;
  },
  async updateAssessmentResponse(id: string, data: any) {
    const r = state.responses.find(x => x.id === id);
    if (!r) return undefined;
    Object.assign(r, data);
    return r;
  },
  async getAssessmentResponses(assessmentId: string) {
    return state.responses.filter(r => r.assessmentId === assessmentId);
  },
  async createResult(data: any) {
    const r = { id: `res-${state.nextId++}`, createdAt: new Date(), ...data };
    state.results.push(r);
    return r;
  },
  async getResult(assessmentId: string) {
    return state.results.find(r => r.assessmentId === assessmentId);
  },
  async getUser(id: string) {
    return state.users.find(u => u.id === id);
  },
};

// Support answer ownership validation and the scoring service's answer lookup.
const dbMock = {
  select: (projection?: any) => ({
    from: () => ({
      where: (cond: any) => {
        if (projection) {
          const [questionId, ...answerIds] = new PgDialect().sqlToQuery(cond).params;
          return Promise.resolve(state.answers.filter(a =>
            a.questionId === questionId && answerIds.includes(a.id)
          ).map(a => ({ id: a.id })));
        }
        return Promise.resolve(state.answers.slice());
      },
    }),
  }),
};

vi.mock('../../server/storage', () => ({ storage: storageMock }));
vi.mock('../../server/db', () => ({ db: dbMock }));
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

function seedModel() {
  state.models.push({
    id: 'model-1',
    slug: 'ai-readiness',
    name: 'AI Readiness',
    description: 'desc',
    visibility: 'public',
    maturityScale: [
      { id: '1', name: 'Nascent', description: '', minScore: 100, maxScore: 199 },
      { id: '2', name: 'Experimental', description: '', minScore: 200, maxScore: 299 },
      { id: '3', name: 'Operational', description: '', minScore: 300, maxScore: 399 },
      { id: '4', name: 'Strategic', description: '', minScore: 400, maxScore: 449 },
      { id: '5', name: 'Transformational', description: '', minScore: 450, maxScore: 500 },
    ],
  });
  state.dimensions.push({ id: 'dim-strategy', modelId: 'model-1', key: 'strategy' });
  state.questions.push(
    { id: 'q1', modelId: 'model-1', dimensionId: 'dim-strategy', type: 'multiple_choice', minValue: null, maxValue: null },
    { id: 'q2', modelId: 'model-1', dimensionId: 'dim-strategy', type: 'multiple_choice', minValue: null, maxValue: null }
  );
  state.answers.push(
    { id: 'q1-a0', questionId: 'q1', score: 100 },
    { id: 'q1-a4', questionId: 'q1', score: 500 },
    { id: 'q2-a0', questionId: 'q2', score: 100 },
    { id: 'q2-a4', questionId: 'q2', score: 500 }
  );
}

describe('Assessment end-to-end flow', () => {
  beforeEach(() => {
    state.models.length = 0;
    state.dimensions.length = 0;
    state.questions.length = 0;
    state.answers.length = 0;
    state.assessments.length = 0;
    state.responses.length = 0;
    state.results.length = 0;
    state.users.length = 0;
    state.nextId = 1;
    seedModel();
  });

  async function buildApp() {
    const { buildTestApp } = await import('./helpers/app');
    const { registerAssessmentRoutes } = await import(
      '../../server/routes/assessment-routes'
    );
    const app = buildTestApp({
      user: {
        id: 'user-1',
        username: 'alice',
        password: 'x',
        role: 'user',
        tenantId: null,
      },
    });
    registerAssessmentRoutes(app);
    return app;
  }

  it('rejects assessments against unknown models with 404', async () => {
    const app = await buildApp();
    const res = await request(app).post('/api/assessments').send({
      modelId: 'nope',
    });
    expect(res.status).toBe(404);
  });

  async function buildAnonymousApp(secure = false, store?: session.Store) {
    const { registerAssessmentRoutes } = await import('../../server/routes/assessment-routes');
    const app = express();
    app.set('trust proxy', 1);
    app.use(express.json());
    app.use(session({
      secret: 'anonymous-assessment-test',
      resave: false,
      saveUninitialized: false,
      store,
      cookie: { secure, httpOnly: true, sameSite: 'lax' },
    }));
    app.use((req, _res, next) => {
      req.isAuthenticated = (() => false) as typeof req.isAuthenticated;
      next();
    });
    registerAssessmentRoutes(app);
    return app;
  }

  it('persists a fresh anonymous session through launch, responses and results', async () => {
    const app = await buildAnonymousApp();
    const browser = request.agent(app);
    const start = await browser.post('/api/assessments').send({ modelId: 'model-1' });
    expect(start.status).toBe(200);
    expect(start.headers['set-cookie']).toBeDefined();
    expect(start.body.userId).toBeNull();
    const id = start.body.id;
    expect((await browser.get(`/api/assessments/${id}`)).status).toBe(200);
    expect((await browser.get(`/api/assessments/${id}/responses`)).status).toBe(200);
    for (const questionId of ['q1', 'q2']) {
      expect((await browser.post(`/api/assessments/${id}/responses`)
        .send({ questionId, answerId: `${questionId}-a4` })).status).toBe(200);
    }
    expect((await browser.post(`/api/assessments/${id}/calculate`)).status).toBe(200);
    expect((await browser.get(`/api/results/${id}`)).status).toBe(200);

    // Knowing an assessment ID never grants another browser access.
    expect((await request(app).get(`/api/assessments/${id}`)).status).toBe(404);
    expect((await request(app).post(`/api/assessments/${id}/responses`)
      .send({ questionId: 'q1', answerId: 'q1-a0' })).status).toBe(404);
  });

  it('issues a secure session cookie on anonymous launch behind the production HTTPS proxy', async () => {
    const app = await buildAnonymousApp(true);
    const start = await request(app).post('/api/assessments')
      .set('X-Forwarded-Proto', 'https').send({ modelId: 'model-1' });
    expect(start.status).toBe(200);
    const cookie = start.headers['set-cookie']?.[0];
    expect(cookie).toMatch(/;\s*Secure/i);
    expect(cookie).toMatch(/;\s*HttpOnly/i);
    expect(cookie).toMatch(/;\s*SameSite=Lax/i);
    const read = await request(app).get(`/api/assessments/${start.body.id}`)
      .set('X-Forwarded-Proto', 'https').set('Cookie', cookie.split(';')[0]);
    expect(read.status).toBe(200);
  });

  it('does not create an inaccessible assessment when session persistence fails', async () => {
    const store = new session.MemoryStore();
    vi.spyOn(store, 'set').mockImplementation((_id, _data, callback) => {
      callback?.(new Error('session store unavailable'));
    });
    const app = await buildAnonymousApp(false, store);
    const start = await request(app).post('/api/assessments').send({ modelId: 'model-1' });
    expect(start.status).toBe(503);
    expect(state.assessments).toHaveLength(0);
  });

  it('creates an assessment, saves responses, calculates results, and exposes them via /api/results', async () => {
    const app = await buildApp();

    // Start assessment
    const startRes = await request(app)
      .post('/api/assessments')
      .send({ modelId: 'model-1' });
    expect(startRes.status).toBe(200);
    const assessmentId = startRes.body.id;
    expect(state.assessments.length).toBe(1);
    expect(state.assessments[0].userId).toBe('user-1');

    // Save two top responses
    const r1 = await request(app)
      .post(`/api/assessments/${assessmentId}/responses`)
      .send({ questionId: 'q1', answerId: 'q1-a4' });
    expect(r1.status).toBe(200);

    const r2 = await request(app)
      .post(`/api/assessments/${assessmentId}/responses`)
      .send({ questionId: 'q2', answerId: 'q2-a4' });
    expect(r2.status).toBe(200);

    // List responses
    const listRes = await request(app).get(`/api/assessments/${assessmentId}/responses`);
    expect(listRes.status).toBe(200);
    expect(listRes.body.length).toBe(2);

    // Updating an existing response should not duplicate
    const r1Update = await request(app)
      .post(`/api/assessments/${assessmentId}/responses`)
      .send({ questionId: 'q1', answerId: 'q1-a0' });
    expect(r1Update.status).toBe(200);
    expect(state.responses.length).toBe(2);

    // Reset back to top so we can predict the calculated label.
    await request(app)
      .post(`/api/assessments/${assessmentId}/responses`)
      .send({ questionId: 'q1', answerId: 'q1-a4' });

    // Calculate results
    const calcRes = await request(app).post(
      `/api/assessments/${assessmentId}/calculate`
    );
    expect(calcRes.status).toBe(200);
    expect(calcRes.body.overallScore).toBe(500);
    expect(calcRes.body.label).toBe('Transformational');
    expect(calcRes.body.dimensionScores).toEqual({ strategy: 500 });

    // Assessment should now be completed.
    const a = state.assessments[0];
    expect(a.status).toBe('completed');
    expect(a.completedAt).toBeTruthy();

    // View results
    const resultRes = await request(app).get(`/api/results/${assessmentId}`);
    expect(resultRes.status).toBe(200);
    expect(resultRes.body.overallScore).toBe(500);
  });

  it('calculate returns 400 when there are no responses', async () => {
    const app = await buildApp();
    const a = await request(app).post('/api/assessments').send({ modelId: 'model-1' });
    const calcRes = await request(app).post(`/api/assessments/${a.body.id}/calculate`);
    expect(calcRes.status).toBe(400);
  });

  it('GET /api/results/:assessmentId returns 404 when no result exists', async () => {
    const app = await buildApp();
    const res = await request(app).get('/api/results/nonexistent');
    expect(res.status).toBe(404);
  });
});
