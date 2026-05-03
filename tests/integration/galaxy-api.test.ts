import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import http from 'node:http';
import { createHash, randomBytes } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import { eq, inArray, sql } from 'drizzle-orm';

// Set env vars BEFORE the galaxy modules are loaded. vi.hoisted runs before
// any vi.mock factory or import statement so the webhooks module sees the
// `GALAXY_WEBHOOK_ALLOW_PRIVATE` flag at import time.
vi.hoisted(() => {
  process.env.GALAXY_OAUTH_CLIENT_IDS = 'galaxy-test-client';
  process.env.GALAXY_WEBHOOK_ALLOW_PRIVATE = 'true';
});

// We deliberately do NOT mock server/db. The Galaxy contract suite must
// exercise real Drizzle predicates, joins, ordering, and the Postgres-backed
// rate limiter (which uses db.execute(sql`...`)). A weak fake-db shim would
// hide regressions in those code paths.
import { db } from '../../server/db';
import {
  users,
  tenants,
  models,
  assessments,
  results,
  oauthClients,
  oauthTokens,
  galaxyExposurePolicies,
  galaxyWebhooks,
  galaxyWebhookDeliveries,
  galaxyRateLimits,
  galaxyAuditLog,
} from '../../shared/schema';

const PUBLIC_CLIENT_ID = 'galaxy-test-client';

const SUITE_PREFIX = `gxtest_${randomBytes(4).toString('hex')}`;
let suiteCounter = 0;

interface SeedOverrides {
  policy?: Partial<typeof galaxyExposurePolicies.$inferInsert>;
  user?: Partial<typeof users.$inferInsert>;
  tokenScopes?: string[] | null;
  noToken?: boolean;
  noPolicy?: boolean;
}

interface SeedContext {
  tenantId: string;
  userId: string;
  clientRowId: string;
  accessToken: string;
  accessTokenHash: string;
  modelId: string;
  authHeader: { Authorization: string };
}

// One OAuth client row is shared across the suite because oauth_clients.client_id
// is uniquely indexed and GALAXY_OAUTH_CLIENT_IDS pins us to a single value.
const SHARED_CLIENT_ROW_ID = `${SUITE_PREFIX}_client`;
let sharedClientCreated = false;
async function ensureSharedOauthClient() {
  if (sharedClientCreated) return;
  await db.insert(oauthClients).values({
    id: SHARED_CLIENT_ROW_ID,
    clientId: PUBLIC_CLIENT_ID,
    name: `Galaxy Test ${SHARED_CLIENT_ROW_ID}`,
    environment: 'development',
    redirectUris: ['https://example.com/cb'],
  });
  sharedClientCreated = true;
}

function freshIds(): Pick<SeedContext, 'tenantId' | 'userId' | 'clientRowId' | 'accessToken' | 'accessTokenHash' | 'modelId'> {
  suiteCounter += 1;
  const n = suiteCounter;
  const accessToken = `${SUITE_PREFIX}_token_${n}_${randomBytes(8).toString('hex')}`;
  return {
    tenantId: `${SUITE_PREFIX}_t${n}`,
    userId: `${SUITE_PREFIX}_u${n}`,
    clientRowId: SHARED_CLIENT_ROW_ID,
    accessToken,
    accessTokenHash: createHash('sha256').update(accessToken).digest('hex'),
    modelId: `${SUITE_PREFIX}_m${n}`,
  };
}

async function seed(over: SeedOverrides = {}): Promise<SeedContext> {
  const ids = freshIds();

  await db.insert(tenants).values({
    id: ids.tenantId,
    name: 'Galaxy Tenant',
    logoUrl: 'https://example.com/logo.png',
    primaryColor: '#112233',
  });

  await db.insert(users).values({
    id: ids.userId,
    username: ids.userId,
    password: 'x',
    email: `${ids.userId}@example.com`,
    name: 'Galaxy User',
    role: 'user',
    tenantId: ids.tenantId,
    emailVerified: true,
    ...(over.user ?? {}),
  });

  await db.insert(models).values({
    id: ids.modelId,
    slug: ids.modelId,
    name: 'Galaxy Test Model',
    description: 'test',
    status: 'published',
  });

  await ensureSharedOauthClient();

  if (!over.noToken) {
    await db.insert(oauthTokens).values({
      userId: ids.userId,
      clientId: ids.clientRowId,
      accessTokenHash: ids.accessTokenHash,
      tokenType: 'Bearer',
      scopes: over.tokenScopes ?? [
        'galaxy_portal',
        'artifacts.read',
        'assessments.read',
        'insights.read',
        'courses.read',
        'attestations.read',
      ],
      expiresAt: new Date(Date.now() + 3_600_000),
    });
  }

  if (!over.noPolicy) {
    await db.insert(galaxyExposurePolicies).values({
      tenantId: ids.tenantId,
      enabled: true,
      exposeAssessments: true,
      exposeResults: true,
      exposeRecommendations: true,
      exposeInsights: true,
      exposeCertificates: false,
      exposedModelIds: null,
      audienceMode: 'all',
      rateLimitPerMinute: 120,
      ...(over.policy ?? {}),
    });
  }

  return {
    ...ids,
    authHeader: { Authorization: `Bearer ${ids.accessToken}` },
  };
}

const seededTenantIds: string[] = [];
const seededUserIds: string[] = [];
const seededModelIds: string[] = [];

function track(ctx: SeedContext) {
  seededTenantIds.push(ctx.tenantId);
  seededUserIds.push(ctx.userId);
  seededModelIds.push(ctx.modelId);
  return ctx;
}

async function buildGalaxyApp() {
  const app = express();
  app.use(express.json());
  const { registerGalaxyRoutes } = await import('../../server/routes/galaxy');
  registerGalaxyRoutes(app);
  return app;
}

async function cleanupAll() {
  if (seededTenantIds.length === 0) return;
  // Order matters: deliveries -> webhooks -> audit -> policies -> tokens ->
  // results -> assessments -> models -> users -> tenants. Most have FK
  // cascades from tenants, but explicit deletes make this resilient to
  // schema changes.
  const ts = seededTenantIds;
  const us = seededUserIds;
  const ms = seededModelIds;
  await db.delete(galaxyWebhookDeliveries).where(inArray(galaxyWebhookDeliveries.tenantId, ts));
  await db.delete(galaxyWebhooks).where(inArray(galaxyWebhooks.tenantId, ts));
  await db.delete(galaxyAuditLog).where(inArray(galaxyAuditLog.tenantId, ts));
  await db.delete(galaxyExposurePolicies).where(inArray(galaxyExposurePolicies.tenantId, ts));
  await db.delete(galaxyRateLimits).where(sql`${galaxyRateLimits.key} LIKE ${`${SUITE_PREFIX}_%`}`);
  await db.delete(oauthTokens).where(inArray(oauthTokens.userId, us));
  await db.delete(oauthClients).where(eq(oauthClients.id, SHARED_CLIENT_ROW_ID));
  await db.delete(assessments).where(inArray(assessments.tenantId, ts));
  await db.delete(models).where(inArray(models.id, ms));
  await db.delete(users).where(inArray(users.id, us));
  await db.delete(tenants).where(inArray(tenants.id, ts));
}

afterAll(async () => {
  await cleanupAll();
});

describe('Galaxy API contract (real DB)', () => {
  describe('public endpoints', () => {
    it('GET /api/galaxy/v1/health returns ok without a token', async () => {
      const app = await buildGalaxyApp();
      const res = await request(app).get('/api/galaxy/v1/health');
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ status: 'ok', api: 'galaxy', version: 'v1' });
    });

    it('GET /api/galaxy/v1/openapi.json returns the OpenAPI document', async () => {
      const app = await buildGalaxyApp();
      const res = await request(app).get('/api/galaxy/v1/openapi.json');
      expect(res.status).toBe(200);
      expect(res.body.openapi).toBe('3.1.0');
      expect(res.body.info.title).toMatch(/Galaxy/);
      expect(res.body.paths['/me']).toBeDefined();
      expect(res.body.paths['/artifacts']).toBeDefined();
      expect(res.body.paths['/assessments']).toBeDefined();
      expect(res.body.paths['/assessments/{id}']).toBeDefined();
      expect(res.body.paths['/insights/me']).toBeDefined();
    });
  });

  describe('authentication', () => {
    it('rejects requests without a bearer token (401)', async () => {
      const app = await buildGalaxyApp();
      const res = await request(app).get('/api/galaxy/v1/me');
      expect(res.status).toBe(401);
      expect(res.body.error).toBe('invalid_request');
    });

    it('rejects requests with an unknown / expired token (401)', async () => {
      const app = await buildGalaxyApp();
      const res = await request(app).get('/api/galaxy/v1/me').set({ Authorization: 'Bearer garbage-token-does-not-exist' });
      expect(res.status).toBe(401);
      expect(res.body.error).toBe('invalid_token');
    });

    it('returns 503 when GALAXY_OAUTH_CLIENT_IDS is not configured', async () => {
      const ctx = track(await seed());
      const prev = process.env.GALAXY_OAUTH_CLIENT_IDS;
      delete process.env.GALAXY_OAUTH_CLIENT_IDS;
      try {
        const app = await buildGalaxyApp();
        const res = await request(app).get('/api/galaxy/v1/me').set(ctx.authHeader);
        expect(res.status).toBe(503);
        expect(res.body.error).toBe('galaxy_not_configured');
      } finally {
        process.env.GALAXY_OAUTH_CLIENT_IDS = prev;
      }
    });

    it('returns 403 when the OAuth client is not in the Galaxy allowlist', async () => {
      const ctx = track(await seed());
      const prev = process.env.GALAXY_OAUTH_CLIENT_IDS;
      process.env.GALAXY_OAUTH_CLIENT_IDS = 'some-other-client';
      try {
        const app = await buildGalaxyApp();
        const res = await request(app).get('/api/galaxy/v1/me').set(ctx.authHeader);
        expect(res.status).toBe(403);
        expect(res.body.error).toBe('unauthorized_client');
      } finally {
        process.env.GALAXY_OAUTH_CLIENT_IDS = prev;
      }
    });

    it('returns 403 when the token is missing the galaxy_portal scope', async () => {
      const ctx = track(await seed({ tokenScopes: ['artifacts.read'] }));
      const app = await buildGalaxyApp();
      const res = await request(app).get('/api/galaxy/v1/me').set(ctx.authHeader);
      expect(res.status).toBe(403);
      expect(res.body.error).toBe('insufficient_scope');
    });

    it('returns 403 when the tenant exposure policy is disabled', async () => {
      const ctx = track(await seed({ policy: { enabled: false } }));
      const app = await buildGalaxyApp();
      const res = await request(app).get('/api/galaxy/v1/me').set(ctx.authHeader);
      expect(res.status).toBe(403);
      expect(res.body.error).toBe('tenant_disabled');
    });

    it('returns 403 when no policy exists for the tenant', async () => {
      const ctx = track(await seed({ noPolicy: true }));
      const app = await buildGalaxyApp();
      const res = await request(app).get('/api/galaxy/v1/me').set(ctx.authHeader);
      expect(res.status).toBe(403);
      expect(res.body.error).toBe('tenant_disabled');
    });

    it('returns 403 when audienceMode=roles excludes the user', async () => {
      const ctx = track(
        await seed({
          policy: { audienceMode: 'roles', audienceRoles: ['tenant_admin'] },
          user: { role: 'user' },
        }),
      );
      const app = await buildGalaxyApp();
      const res = await request(app).get('/api/galaxy/v1/me').set(ctx.authHeader);
      expect(res.status).toBe(403);
      expect(res.body.error).toBe('audience_excluded');
    });

    it('admits the user when audienceMode=roles includes the user role', async () => {
      const ctx = track(
        await seed({
          policy: { audienceMode: 'roles', audienceRoles: ['user'] },
        }),
      );
      const app = await buildGalaxyApp();
      const res = await request(app).get('/api/galaxy/v1/me').set(ctx.authHeader);
      expect(res.status).toBe(200);
    });
  });

  describe('rate limiting (Postgres-backed)', () => {
    it('returns 429 once the per-user limit is exceeded and persists a counter row', async () => {
      const ctx = track(await seed({ policy: { rateLimitPerMinute: 2 } }));
      const app = await buildGalaxyApp();

      const a = await request(app).get('/api/galaxy/v1/me').set(ctx.authHeader);
      const b = await request(app).get('/api/galaxy/v1/me').set(ctx.authHeader);
      const c = await request(app).get('/api/galaxy/v1/me').set(ctx.authHeader);
      expect(a.status).toBe(200);
      expect(b.status).toBe(200);
      expect(c.status).toBe(429);
      expect(c.body.error).toBe('rate_limited');
      expect(c.headers['x-ratelimit-limit']).toBe('2');
      expect(c.headers['x-ratelimit-remaining']).toBe('0');

      // Verify the *Postgres-backed* limiter actually ran. The middleware
      // logs a warning and falls back to the in-memory limiter only when
      // `db.execute(...)` fails — so a row in galaxy_rate_limits with count=3
      // proves we exercised the production code path, not the fallback.
      const [row] = await db
        .select()
        .from(galaxyRateLimits)
        .where(eq(galaxyRateLimits.key, `${ctx.tenantId}:${ctx.userId}`))
        .limit(1);
      expect(row).toBeDefined();
      expect(row.count).toBe(3);
      expect(row.resetAt instanceof Date).toBe(true);
    });
  });

  describe('GET /me', () => {
    it('returns the user, tenant, scopes, and clientId in the envelope', async () => {
      const ctx = track(await seed());
      const app = await buildGalaxyApp();
      const res = await request(app).get('/api/galaxy/v1/me').set(ctx.authHeader);
      expect(res.status).toBe(200);
      expect(res.body.data).toMatchObject({
        userId: ctx.userId,
        tenantId: ctx.tenantId,
        clientId: PUBLIC_CLIENT_ID,
      });
      expect(res.body.data.scopes).toContain('galaxy_portal');
      expect(res.body.data.tenant).toMatchObject({
        id: ctx.tenantId,
        name: 'Galaxy Tenant',
      });
      expect(res.body.meta.requestId).toBeTruthy();
      expect(res.headers['x-request-id']).toBe(res.body.meta.requestId);
    });
  });

  describe('scope-protected endpoints', () => {
    it('GET /artifacts requires the artifacts.read scope', async () => {
      const ctx = track(await seed({ tokenScopes: ['galaxy_portal'] }));
      const app = await buildGalaxyApp();
      const res = await request(app).get('/api/galaxy/v1/artifacts').set(ctx.authHeader);
      expect(res.status).toBe(403);
      expect(res.body.error).toBe('insufficient_scope');
    });

    it('GET /assessments requires the assessments.read scope', async () => {
      const ctx = track(await seed({ tokenScopes: ['galaxy_portal', 'artifacts.read'] }));
      const app = await buildGalaxyApp();
      const res = await request(app).get('/api/galaxy/v1/assessments').set(ctx.authHeader);
      expect(res.status).toBe(403);
      expect(res.body.error).toBe('insufficient_scope');
    });

    it('GET /insights/me requires the insights.read scope', async () => {
      const ctx = track(await seed({ tokenScopes: ['galaxy_portal'] }));
      const app = await buildGalaxyApp();
      const res = await request(app).get('/api/galaxy/v1/insights/me').set(ctx.authHeader);
      expect(res.status).toBe(403);
    });

    it('GET /artifacts succeeds with a valid scope and returns the envelope', async () => {
      const ctx = track(await seed());
      const app = await buildGalaxyApp();
      const res = await request(app).get('/api/galaxy/v1/artifacts').set(ctx.authHeader);
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.pagination).toMatchObject({ limit: expect.any(Number) });
      expect(res.body.meta.tenantId).toBe(ctx.tenantId);
    });

    it('GET /assessments only returns rows for the calling user (scoped predicate)', async () => {
      const ctx = track(await seed());
      // Create an assessment for the calling user
      await db.insert(assessments).values({
        id: `${ctx.tenantId}_a_mine`,
        userId: ctx.userId,
        tenantId: ctx.tenantId,
        modelId: ctx.modelId,
        status: 'completed',
        startedAt: new Date(),
        completedAt: new Date(),
      });
      // And one for a *different* user in the same tenant — must NOT leak
      const otherUserId = `${ctx.userId}_other`;
      await db.insert(users).values({
        id: otherUserId,
        username: otherUserId,
        password: 'x',
        email: `${otherUserId}@example.com`,
        role: 'user',
        tenantId: ctx.tenantId,
        emailVerified: true,
      });
      seededUserIds.push(otherUserId);
      await db.insert(assessments).values({
        id: `${ctx.tenantId}_a_other`,
        userId: otherUserId,
        tenantId: ctx.tenantId,
        modelId: ctx.modelId,
        status: 'completed',
        startedAt: new Date(),
        completedAt: new Date(),
      });

      const app = await buildGalaxyApp();
      const res = await request(app).get('/api/galaxy/v1/assessments').set(ctx.authHeader);
      expect(res.status).toBe(200);
      const ids = (res.body.data as Array<{ id: string }>).map((r) => r.id);
      expect(ids).toContain(`${ctx.tenantId}_a_mine`);
      expect(ids).not.toContain(`${ctx.tenantId}_a_other`);
    });
  });

  describe('tenant exposure policy enforcement', () => {
    it('hides assessments when exposedModelIds=[] (no models exposed)', async () => {
      const ctx = track(await seed({ policy: { exposedModelIds: [] } }));
      await db.insert(assessments).values({
        id: `${ctx.tenantId}_a1`,
        userId: ctx.userId,
        tenantId: ctx.tenantId,
        modelId: ctx.modelId,
        status: 'completed',
        startedAt: new Date(),
        completedAt: new Date(),
      });
      const app = await buildGalaxyApp();
      const res = await request(app).get('/api/galaxy/v1/assessments').set(ctx.authHeader);
      expect(res.status).toBe(200);
      expect(res.body.data).toEqual([]);
    });

    it('returns assessments when exposedModelIds=null (all models exposed)', async () => {
      const ctx = track(await seed());
      await db.insert(assessments).values({
        id: `${ctx.tenantId}_a1`,
        userId: ctx.userId,
        tenantId: ctx.tenantId,
        modelId: ctx.modelId,
        status: 'completed',
        startedAt: new Date(),
      });
      const app = await buildGalaxyApp();
      const res = await request(app).get('/api/galaxy/v1/assessments').set(ctx.authHeader);
      expect(res.status).toBe(200);
      expect(res.body.data.length).toBe(1);
      expect(res.body.data[0]).toMatchObject({ id: `${ctx.tenantId}_a1`, modelId: ctx.modelId });
    });

    it('exposedModelIds enforces an allowlist (inArray predicate)', async () => {
      const ctx = track(await seed());
      // Create a *second* model and assessment that the policy will NOT allow
      const otherModelId = `${ctx.modelId}_other`;
      await db.insert(models).values({
        id: otherModelId,
        slug: otherModelId,
        name: 'Other',
        description: 'x',
        status: 'published',
      });
      seededModelIds.push(otherModelId);
      await db.insert(assessments).values({
        id: `${ctx.tenantId}_a_allowed`,
        userId: ctx.userId,
        tenantId: ctx.tenantId,
        modelId: ctx.modelId,
        status: 'completed',
        startedAt: new Date(),
      });
      await db.insert(assessments).values({
        id: `${ctx.tenantId}_a_blocked`,
        userId: ctx.userId,
        tenantId: ctx.tenantId,
        modelId: otherModelId,
        status: 'completed',
        startedAt: new Date(),
      });
      // Restrict policy to just ctx.modelId
      await db
        .update(galaxyExposurePolicies)
        .set({ exposedModelIds: [ctx.modelId] })
        .where(eq(galaxyExposurePolicies.tenantId, ctx.tenantId));

      const app = await buildGalaxyApp();
      const res = await request(app).get('/api/galaxy/v1/assessments').set(ctx.authHeader);
      expect(res.status).toBe(200);
      const ids = (res.body.data as Array<{ id: string }>).map((r) => r.id);
      expect(ids).toContain(`${ctx.tenantId}_a_allowed`);
      expect(ids).not.toContain(`${ctx.tenantId}_a_blocked`);
    });

    it('returns empty assessments list when exposeAssessments=false', async () => {
      const ctx = track(await seed({ policy: { exposeAssessments: false } }));
      await db.insert(assessments).values({
        id: `${ctx.tenantId}_a1`,
        userId: ctx.userId,
        tenantId: ctx.tenantId,
        modelId: ctx.modelId,
        status: 'completed',
        startedAt: new Date(),
      });
      const app = await buildGalaxyApp();
      const res = await request(app).get('/api/galaxy/v1/assessments').set(ctx.authHeader);
      expect(res.status).toBe(200);
      expect(res.body.data).toEqual([]);
    });
  });

  describe('GET /assessments/:id', () => {
    it('returns 404 when the assessment is not found / not visible', async () => {
      const ctx = track(await seed());
      const app = await buildGalaxyApp();
      const res = await request(app).get('/api/galaxy/v1/assessments/missing-id').set(ctx.authHeader);
      expect(res.status).toBe(404);
      expect(res.body.error).toBe('not_found');
    });

    it('returns the assessment plus result when exposeResults=true (innerJoin)', async () => {
      const ctx = track(await seed());
      const aId = `${ctx.tenantId}_a1`;
      const rId = `${ctx.tenantId}_r1`;
      await db.insert(assessments).values({
        id: aId,
        userId: ctx.userId,
        tenantId: ctx.tenantId,
        modelId: ctx.modelId,
        status: 'completed',
        startedAt: new Date('2024-01-01'),
        completedAt: new Date('2024-01-02'),
      });
      await db.insert(results).values({
        id: rId,
        assessmentId: aId,
        overallScore: 87,
        label: 'Optimized',
        dimensionScores: { foo: 80 },
      });

      const app = await buildGalaxyApp();
      const res = await request(app).get(`/api/galaxy/v1/assessments/${aId}`).set(ctx.authHeader);
      expect(res.status).toBe(200);
      expect(res.body.data.assessment).toMatchObject({ id: aId, modelId: ctx.modelId });
      expect(res.body.data.result).toMatchObject({ id: rId, overallScore: 87, label: 'Optimized' });
    });

    it('omits the result when exposeResults=false', async () => {
      const ctx = track(await seed({ policy: { exposeResults: false } }));
      const aId = `${ctx.tenantId}_a1`;
      await db.insert(assessments).values({
        id: aId,
        userId: ctx.userId,
        tenantId: ctx.tenantId,
        modelId: ctx.modelId,
        status: 'completed',
        startedAt: new Date(),
        completedAt: new Date(),
      });
      await db.insert(results).values({
        id: `${ctx.tenantId}_r1`,
        assessmentId: aId,
        overallScore: 50,
        label: 'Developing',
        dimensionScores: {},
      });
      const app = await buildGalaxyApp();
      const res = await request(app).get(`/api/galaxy/v1/assessments/${aId}`).set(ctx.authHeader);
      expect(res.status).toBe(200);
      expect(res.body.data.result).toBeNull();
    });
  });

  describe('GET /insights/me', () => {
    it('summarises completed assessments + average score', async () => {
      const ctx = track(await seed());
      const aId = `${ctx.tenantId}_a1`;
      const rId = `${ctx.tenantId}_r1`;
      await db.insert(assessments).values({
        id: aId,
        userId: ctx.userId,
        tenantId: ctx.tenantId,
        modelId: ctx.modelId,
        status: 'completed',
        startedAt: new Date('2024-01-01'),
        completedAt: new Date('2024-01-02'),
      });
      await db.insert(results).values({
        id: rId,
        assessmentId: aId,
        overallScore: 80,
        label: 'Advanced',
        dimensionScores: {},
      });

      const app = await buildGalaxyApp();
      const res = await request(app).get('/api/galaxy/v1/insights/me').set(ctx.authHeader);
      expect(res.status).toBe(200);
      expect(res.body.data.summary.completedAssessments).toBe(1);
      expect(res.body.data.summary.averageScore).toBe(80);
      expect(res.body.data.summary.latest).toMatchObject({ id: rId, score: 80, label: 'Advanced' });
    });

    it('returns null summary when exposeInsights=false', async () => {
      const ctx = track(await seed({ policy: { exposeInsights: false } }));
      const app = await buildGalaxyApp();
      const res = await request(app).get('/api/galaxy/v1/insights/me').set(ctx.authHeader);
      expect(res.status).toBe(200);
      expect(res.body.data.summary).toBeNull();
    });
  });

  describe('forward-compat stubs', () => {
    it('GET /courses returns an empty envelope', async () => {
      const ctx = track(await seed());
      const app = await buildGalaxyApp();
      const res = await request(app).get('/api/galaxy/v1/courses').set(ctx.authHeader);
      expect(res.status).toBe(200);
      expect(res.body.data).toEqual([]);
    });

    it('GET /attestations returns an empty envelope', async () => {
      const ctx = track(await seed());
      const app = await buildGalaxyApp();
      const res = await request(app).get('/api/galaxy/v1/attestations').set(ctx.authHeader);
      expect(res.status).toBe(200);
      expect(res.body.data).toEqual([]);
    });

    it('GET /certificates returns an empty envelope', async () => {
      const ctx = track(await seed());
      const app = await buildGalaxyApp();
      const res = await request(app).get('/api/galaxy/v1/certificates').set(ctx.authHeader);
      expect(res.status).toBe(200);
      expect(res.body.data).toEqual([]);
    });
  });
});

describe('Galaxy webhook delivery (real DB + local listener)', () => {
  let server: http.Server;
  let port: number;
  let received: Array<{ headers: http.IncomingHttpHeaders; body: string }>;
  let respondWith: { status: number; body: string } = { status: 200, body: 'ok' };

  beforeAll(async () => {
    server = http.createServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on('data', (c: Buffer) => chunks.push(c));
      req.on('end', () => {
        const body = Buffer.concat(chunks).toString('utf8');
        received.push({ headers: req.headers, body });
        res.writeHead(respondWith.status, { 'content-type': 'text/plain' });
        res.end(respondWith.body);
      });
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
    port = (server.address() as AddressInfo).port;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  beforeEach(() => {
    received = [];
    respondWith = { status: 200, body: 'ok' };
  });

  it('emits an event, signs it with HMAC-SHA256, and records a delivered row', async () => {
    const ctx = track(await seed());
    const secret = 'gx_unit_secret';
    await db.insert(galaxyWebhooks).values({
      tenantId: ctx.tenantId,
      url: `http://127.0.0.1:${port}/hook`,
      signingSecret: secret,
      active: true,
      events: null,
    });

    const { emitGalaxyEvent, signPayload } = await import('../../server/routes/galaxy/webhooks');
    await emitGalaxyEvent(ctx.tenantId, 'assessment.completed', {
      assessmentId: 'a1',
      score: 87,
    });

    expect(received.length).toBe(1);
    const got = received[0];
    expect(got.headers['x-galaxy-event']).toBe('assessment.completed');
    expect(typeof got.headers['x-galaxy-signature']).toBe('string');
    expect(typeof got.headers['x-galaxy-timestamp']).toBe('string');
    expect(typeof got.headers['x-galaxy-event-id']).toBe('string');

    const ts = Number(got.headers['x-galaxy-timestamp']);
    const expected = signPayload(secret, ts, got.body);
    expect(got.headers['x-galaxy-signature']).toBe(expected);

    const payload = JSON.parse(got.body);
    expect(payload.type).toBe('assessment.completed');
    expect(payload.tenantId).toBe(ctx.tenantId);
    expect(payload.data).toMatchObject({ assessmentId: 'a1', score: 87 });

    const deliveries = await db
      .select()
      .from(galaxyWebhookDeliveries)
      .where(eq(galaxyWebhookDeliveries.tenantId, ctx.tenantId));
    expect(deliveries.length).toBe(1);
    expect(deliveries[0].status).toBe('delivered');
    expect(deliveries[0].responseStatus).toBe(200);
    expect(deliveries[0].eventType).toBe('assessment.completed');
  });

  it('does not deliver when the webhook is inactive', async () => {
    const ctx = track(await seed());
    await db.insert(galaxyWebhooks).values({
      tenantId: ctx.tenantId,
      url: `http://127.0.0.1:${port}/hook`,
      signingSecret: 'secret',
      active: false,
      events: null,
    });
    const { emitGalaxyEvent } = await import('../../server/routes/galaxy/webhooks');
    await emitGalaxyEvent(ctx.tenantId, 'assessment.completed', {});
    expect(received.length).toBe(0);
    const deliveries = await db
      .select()
      .from(galaxyWebhookDeliveries)
      .where(eq(galaxyWebhookDeliveries.tenantId, ctx.tenantId));
    expect(deliveries.length).toBe(0);
  });

  it('skips events not in the subscribed events list', async () => {
    const ctx = track(await seed());
    await db.insert(galaxyWebhooks).values({
      tenantId: ctx.tenantId,
      url: `http://127.0.0.1:${port}/hook`,
      signingSecret: 'secret',
      active: true,
      events: ['attestation.signed'],
    });
    const { emitGalaxyEvent } = await import('../../server/routes/galaxy/webhooks');
    await emitGalaxyEvent(ctx.tenantId, 'assessment.completed', {});
    expect(received.length).toBe(0);
  });

  it('records a non-2xx response as a (still pending) failed attempt with response status', async () => {
    const ctx = track(await seed());
    respondWith = { status: 500, body: 'boom' };
    await db.insert(galaxyWebhooks).values({
      tenantId: ctx.tenantId,
      url: `http://127.0.0.1:${port}/hook`,
      signingSecret: 'secret',
      active: true,
      events: null,
    });
    const { emitGalaxyEvent } = await import('../../server/routes/galaxy/webhooks');
    await emitGalaxyEvent(ctx.tenantId, 'assessment.completed', {});
    expect(received.length).toBe(1);
    const deliveries = await db
      .select()
      .from(galaxyWebhookDeliveries)
      .where(eq(galaxyWebhookDeliveries.tenantId, ctx.tenantId));
    expect(deliveries.length).toBe(1);
    expect(deliveries[0].responseStatus).toBe(500);
    expect(deliveries[0].status).toBe('pending'); // will retry; not 'delivered'
  });

  it('validates webhook URL: blocks non-https when private addresses are not allowed', async () => {
    const prev = process.env.GALAXY_WEBHOOK_ALLOW_PRIVATE;
    process.env.GALAXY_WEBHOOK_ALLOW_PRIVATE = 'false';
    try {
      vi.resetModules();
      const { validateWebhookUrl } = await import('../../server/routes/galaxy/webhooks');
      const r = await validateWebhookUrl('http://example.com/hook');
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.reason).toBe('https_required');
    } finally {
      process.env.GALAXY_WEBHOOK_ALLOW_PRIVATE = prev;
      vi.resetModules();
    }
  });
});
