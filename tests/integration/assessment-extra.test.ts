import { afterAll, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { and, eq, inArray, like } from 'drizzle-orm';
import { db } from '../../server/db';
import { storage } from '../../server/storage';
import * as schema from '../../shared/schema';
import { SeedHarness } from './helpers/seed';

vi.mock('../../server/permissions', () => ({
  canAccessModel: async () => true,
  canManageUsers: () => true,
  canAssignRole: () => true,
  checkIsGlobalAdmin: (u: any) => u?.role === 'global_admin',
  getAccessibleTenantIds: (u: any) => {
    if (u?.role === 'global_admin') return null;
    if (
      (u?.role === 'tenant_admin' || u?.role === 'tenant_modeler') &&
      u.tenantId
    ) {
      return [u.tenantId];
    }
    return [];
  },
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
const tenantIds = new Set<string>();

afterAll(async () => {
  await db
    .delete(schema.assessmentTags)
    .where(like(schema.assessmentTags.name, `${harness.prefix}%`));
  await harness.cleanup();
  if (tenantIds.size > 0) {
    await db
      .delete(schema.tenants)
      .where(inArray(schema.tenants.id, [...tenantIds]));
  }
});

async function buildApp(userId: string, role = 'user', tenantId: string | null = null) {
  const { buildTestApp } = await import('./helpers/app');
  const { registerAssessmentRoutes } = await import(
    '../../server/routes/assessment-routes'
  );
  const app = buildTestApp({
    user: { id: userId, username: 'alice', password: 'x', role, tenantId },
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

describe('Bulk assessment result tagging', () => {
  it('applies and removes one tag while preserving unrelated assignments', async () => {
    const user = await harness.createUser('global_admin');
    const model = await harness.createModel();
    const firstAssessment = await storage.createAssessment({
      modelId: model.id,
      userId: user.id,
      status: 'completed',
    });
    const secondAssessment = await storage.createAssessment({
      modelId: model.id,
      userId: user.id,
      status: 'completed',
    });
    const [targetTag, existingTag] = await db
      .insert(schema.assessmentTags)
      .values([
        { name: harness.next(), color: '#2563eb', createdBy: user.id },
        { name: harness.next(), color: '#16a34a', createdBy: user.id },
      ])
      .returning();

    await db.insert(schema.assessmentTagAssignments).values([
      {
        assessmentId: firstAssessment.id,
        tagId: existingTag.id,
        assignedBy: user.id,
      },
      {
        assessmentId: secondAssessment.id,
        tagId: targetTag.id,
        assignedBy: user.id,
      },
    ]);

    const app = await buildApp(user.id, 'global_admin');
    const assessmentIds = [firstAssessment.id, secondAssessment.id];
    const applyResponse = await request(app)
      .post('/api/admin/assessments/bulk-tags')
      .send({ assessmentIds, tagId: targetTag.id, action: 'apply' });

    expect(applyResponse.status).toBe(200);
    expect(applyResponse.body).toMatchObject({
      success: true,
      action: 'apply',
      assessmentCount: 2,
    });

    const afterApply = await db
      .select({
        assessmentId: schema.assessmentTagAssignments.assessmentId,
        tagId: schema.assessmentTagAssignments.tagId,
      })
      .from(schema.assessmentTagAssignments)
      .where(inArray(schema.assessmentTagAssignments.assessmentId, assessmentIds));
    expect(afterApply).toEqual(expect.arrayContaining([
      { assessmentId: firstAssessment.id, tagId: existingTag.id },
      { assessmentId: firstAssessment.id, tagId: targetTag.id },
      { assessmentId: secondAssessment.id, tagId: targetTag.id },
    ]));
    expect(afterApply).toHaveLength(3);

    const removeResponse = await request(app)
      .post('/api/admin/assessments/bulk-tags')
      .send({ assessmentIds, tagId: targetTag.id, action: 'remove' });

    expect(removeResponse.status).toBe(200);
    const afterRemove = await db
      .select({
        assessmentId: schema.assessmentTagAssignments.assessmentId,
        tagId: schema.assessmentTagAssignments.tagId,
      })
      .from(schema.assessmentTagAssignments)
      .where(inArray(schema.assessmentTagAssignments.assessmentId, assessmentIds));
    expect(afterRemove).toEqual([
      { assessmentId: firstAssessment.id, tagId: existingTag.id },
    ]);
  });

  it('rejects empty or invalid selections without partially applying a tag', async () => {
    const user = await harness.createUser('global_admin');
    const model = await harness.createModel();
    const assessment = await storage.createAssessment({
      modelId: model.id,
      userId: user.id,
    });
    const [tag] = await db
      .insert(schema.assessmentTags)
      .values({ name: harness.next(), color: '#9333ea', createdBy: user.id })
      .returning();
    const app = await buildApp(user.id, 'global_admin');

    const emptyResponse = await request(app)
      .post('/api/admin/assessments/bulk-tags')
      .send({ assessmentIds: [], tagId: tag.id, action: 'apply' });
    expect(emptyResponse.status).toBe(400);

    const invalidResponse = await request(app)
      .post('/api/admin/assessments/bulk-tags')
      .send({
        assessmentIds: [assessment.id, `${harness.prefix}_missing`],
        tagId: tag.id,
        action: 'apply',
      });
    expect(invalidResponse.status).toBe(400);

    const assignments = await db
      .select()
      .from(schema.assessmentTagAssignments)
      .where(and(
        eq(schema.assessmentTagAssignments.assessmentId, assessment.id),
        eq(schema.assessmentTagAssignments.tagId, tag.id),
      ));
    expect(assignments).toHaveLength(0);

    const missingTagResponse = await request(app)
      .post('/api/admin/assessments/bulk-tags')
      .send({
        assessmentIds: [assessment.id],
        tagId: `${harness.prefix}_missing`,
        action: 'remove',
      });
    expect(missingTagResponse.status).toBe(404);
  });

  it('uses the existing admin/modeler authorization boundary', async () => {
    const user = await harness.createUser('user');
    const app = await buildApp(user.id, 'user');

    const response = await request(app)
      .post('/api/admin/assessments/bulk-tags')
      .send({
        assessmentIds: [`${harness.prefix}_assessment`],
        tagId: `${harness.prefix}_tag`,
        action: 'apply',
      });

    expect(response.status).toBe(401);
  });

  it('preserves global bulk access for legacy admin and modeler roles', async () => {
    const legacyAdmin = await harness.createUser('admin');
    const legacyModeler = await harness.createUser('modeler');
    const model = await harness.createModel();
    const assessment = await storage.createAssessment({
      modelId: model.id,
      userId: legacyAdmin.id,
    });
    const [tag] = await db
      .insert(schema.assessmentTags)
      .values({ name: harness.next(), color: '#0891b2', createdBy: legacyAdmin.id })
      .returning();

    const adminApp = await buildApp(legacyAdmin.id, 'admin');
    const applyResponse = await request(adminApp)
      .post('/api/admin/assessments/bulk-tags')
      .send({
        assessmentIds: [assessment.id],
        tagId: tag.id,
        action: 'apply',
      });
    expect(applyResponse.status).toBe(200);

    const modelerApp = await buildApp(legacyModeler.id, 'modeler');
    const removeResponse = await request(modelerApp)
      .post('/api/admin/assessments/bulk-tags')
      .send({
        assessmentIds: [assessment.id],
        tagId: tag.id,
        action: 'remove',
      });
    expect(removeResponse.status).toBe(200);

    const assignments = await db
      .select()
      .from(schema.assessmentTagAssignments)
      .where(eq(schema.assessmentTagAssignments.tagId, tag.id));
    expect(assignments).toHaveLength(0);
  });

  it('atomically rejects tenant-scoped requests containing an out-of-tenant assessment', async () => {
    const [firstTenant, secondTenant] = await db
      .insert(schema.tenants)
      .values([
        { name: `Tenant ${harness.next()}` },
        { name: `Tenant ${harness.next()}` },
      ])
      .returning();
    tenantIds.add(firstTenant.id);
    tenantIds.add(secondTenant.id);

    const adminUsername = harness.next();
    const tenantAdmin = await storage.createUser({
      username: adminUsername,
      password: 'x',
      email: `${adminUsername}@example.test`,
      name: 'Tenant Admin',
      role: 'tenant_admin',
      tenantId: firstTenant.id,
    });
    harness.trackUser(tenantAdmin.id);

    const modelerUsername = harness.next();
    const tenantModeler = await storage.createUser({
      username: modelerUsername,
      password: 'x',
      email: `${modelerUsername}@example.test`,
      name: 'Tenant Modeler',
      role: 'tenant_modeler',
      tenantId: firstTenant.id,
    });
    harness.trackUser(tenantModeler.id);

    const model = await harness.createModel();
    const accessibleAssessment = await storage.createAssessment({
      modelId: model.id,
      userId: tenantAdmin.id,
      tenantId: firstTenant.id,
    });
    const inaccessibleAssessment = await storage.createAssessment({
      modelId: model.id,
      userId: tenantAdmin.id,
      tenantId: secondTenant.id,
    });
    const [tag] = await db
      .insert(schema.assessmentTags)
      .values({ name: harness.next(), color: '#dc2626', createdBy: tenantAdmin.id })
      .returning();

    for (const scopedUser of [
      { id: tenantAdmin.id, role: 'tenant_admin' },
      { id: tenantModeler.id, role: 'tenant_modeler' },
    ]) {
      const app = await buildApp(scopedUser.id, scopedUser.role, firstTenant.id);
      const response = await request(app)
        .post('/api/admin/assessments/bulk-tags')
        .send({
          assessmentIds: [accessibleAssessment.id, inaccessibleAssessment.id],
          tagId: tag.id,
          action: 'apply',
        });
      expect(response.status).toBe(400);
    }

    const assignmentsAfterRejectedRequests = await db
      .select()
      .from(schema.assessmentTagAssignments)
      .where(eq(schema.assessmentTagAssignments.tagId, tag.id));
    expect(assignmentsAfterRejectedRequests).toHaveLength(0);

    const modelerApp = await buildApp(
      tenantModeler.id,
      'tenant_modeler',
      firstTenant.id,
    );
    const allowedResponse = await request(modelerApp)
      .post('/api/admin/assessments/bulk-tags')
      .send({
        assessmentIds: [accessibleAssessment.id],
        tagId: tag.id,
        action: 'apply',
      });
    expect(allowedResponse.status).toBe(200);

    const assignmentsAfterAllowedRequest = await db
      .select()
      .from(schema.assessmentTagAssignments)
      .where(eq(schema.assessmentTagAssignments.tagId, tag.id));
    expect(assignmentsAfterAllowedRequest).toEqual([
      expect.objectContaining({ assessmentId: accessibleAssessment.id }),
    ]);
  });
});
