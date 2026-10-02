import fs from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { and, eq, ilike, sql } from 'drizzle-orm';
import { assertDevelopmentWorkspace } from '../../../courseware/annual-training/shared/dev-guard';

export const stateFile = '/tmp/orion-grameen-report-qa.json';
type State = { tenantId: string; userId: string; modelId: string; assessmentId: string; modelName: string; runId: string };

export function assertGrameenDevelopmentTarget(baseURL: string) {
  assertDevelopmentWorkspace();
  if (process.env.GRAMEEN_REPORT_E2E !== '1') throw new Error('Set GRAMEEN_REPORT_E2E=1 to opt in.');
  const url = new URL(baseURL);
  if (url.origin !== `https://${process.env.REPLIT_DEV_DOMAIN}`) {
    throw new Error('Grameen QA only accepts this workspace’s HTTPS development URL.');
  }
}

// Imports that connect to Postgres are deliberately deferred until after the guard.
export async function setupGrameenFixture(baseURL: string, runId: string) {
  assertGrameenDevelopmentTarget(baseURL);
  const { db } = await import('../../../server/db');
  const s = await import('../../../shared/schema');
  const { hashPassword } = await import('../../../server/utils/password');
  const { providerRegistry } = await import('../../../server/services/ai-providers/registry');
  const config = await providerRegistry.getActiveConfig();
  if (config.providerId !== 'azure-foundry' || !providerRegistry.get(config.providerId)?.isAvailable()) {
    throw new Error('This live check requires the configured Microsoft Foundry provider. No provider settings were changed.');
  }
  const originals = await db.select().from(s.models).where(ilike(s.models.name, 'Personal AI Skills%Grameen%'));
  if (originals.length !== 1) throw new Error('Expected exactly one development Personal AI Skills - Grameen model.');
  const original = originals[0];
  if (original.scoringConfig?.method !== 'mean_answer_values' ||
      !original.maturityScale?.length ||
      Math.max(...original.maturityScale.map(level => level.maxScore)) !== 100) {
    throw new Error('Grameen source must use mean-answer scoring and a 100-point scale.');
  }
  const dimensions = await db.select().from(s.dimensions).where(eq(s.dimensions.modelId, original.id));
  if (dimensions.length < 2) throw new Error('At least two Grameen dimensions are needed to exercise real AI generation.');
  const documents = await db.select().from(s.knowledgeDocuments).where(eq(s.knowledgeDocuments.modelId, original.id));
  const state: State = {
    tenantId: randomUUID(), userId: randomUUID(), modelId: randomUUID(), assessmentId: randomUUID(),
    modelName: `${original.name} (disposable QA ${randomUUID()})`, runId,
  };
  // Journal IDs before writes; a terminated browser/process can be cleaned up later.
  // No passwords or personal/production data are stored in the journal.
  await fs.writeFile(stateFile, JSON.stringify(state), { flag: 'wx', mode: 0o600 });
  const username = `qa-grameen-${state.userId}`;
  const password = randomUUID();
  const hashed = await hashPassword(password);
  const score = 75;
  const label = original.maturityScale.find(level => score >= level.minScore && score <= level.maxScore)?.name;
  if (!label) throw new Error('No Grameen result label covers the fixture score.');
  await db.transaction(async tx => {
    await tx.insert(s.tenants).values({ id: state.tenantId, name: 'Disposable Grameen report QA', autoCreateUsers: false, allowUserSelfProvisioning: false });
    await tx.insert(s.users).values({
      id: state.userId, username, password: hashed, email: `${username}@grameen-qa.invalid`,
      name: 'Disposable Report Owner', role: 'user', tenantId: state.tenantId, emailVerified: true,
      company: 'Disposable QA', jobTitle: 'QA Original Analyst', industry: 'Education',
      companySize: '10-49', country: 'United States', monthlyDigestOptOut: true,
    });
    await tx.insert(s.models).values({
      ...original, id: state.modelId, slug: username, name: state.modelName,
      ownerTenantId: state.tenantId, visibility: 'private', featured: false,
      status: 'published', createdAt: new Date(), updatedAt: new Date(),
    });
    await tx.insert(s.modelTenants).values({ modelId: state.modelId, tenantId: state.tenantId });
    await tx.insert(s.dimensions).values(dimensions.map(dim => ({ ...dim, id: randomUUID(), modelId: state.modelId })));
    // Reuse document reads, never upload/delete source objects.
    if (documents.length) await tx.insert(s.knowledgeDocuments).values(documents.map(doc => ({ ...doc, id: randomUUID(), modelId: state.modelId })));
    await tx.insert(s.assessments).values({
      id: state.assessmentId, userId: state.userId, modelId: state.modelId,
      tenantId: state.tenantId, status: 'completed', completedAt: new Date(),
    });
    await tx.insert(s.results).values({
      assessmentId: state.assessmentId, overallScore: score, label,
      dimensionScores: Object.fromEntries(dimensions.map((dim, i) => [dim.key, i % 2 ? 65 : 85])),
    });
  });
  return { ...state, username, password, score, label, oldTitle: 'QA Original Analyst', newTitle: 'Director of QA Learning Partnerships' };
}

export async function seedStaleSummaryCaches(baseURL: string, modelName: string, oldTitle: string) {
  assertGrameenDevelopmentTarget(baseURL);
  const state = JSON.parse(await fs.readFile(stateFile, 'utf8')) as State;
  if (state.modelName !== modelName) throw new Error('Stale-cache fixture must belong to this QA journal.');
  const { db } = await import('../../../server/db');
  const s = await import('../../../shared/schema');
  const entries = await db.select().from(s.aiGeneratedContent).where(sql`(
    ${s.aiGeneratedContent.metadata}->>'modelName' = ${modelName}
    or ${s.aiGeneratedContent.metadata}->'context'->>'modelName' = ${modelName}
  )`);
  const stale = `${oldTitle}: stale QA organizational report, 75 out of 500.`;
  for (const entry of entries) {
    await db.update(s.aiGeneratedContent).set({
      content: entry.type === 'maturity_summary' ? { text: stale } : stale,
    }).where(eq(s.aiGeneratedContent.id, entry.id));
  }
  return entries.map(entry => entry.type);
}

export async function cleanupGrameenFixture(baseURL: string, expectedRunId?: string) {
  assertGrameenDevelopmentTarget(baseURL);
  const text = await fs.readFile(stateFile, 'utf8').catch((error: NodeJS.ErrnoException) => {
    if (error.code === 'ENOENT') return null;
    throw error;
  });
  if (!text) return;
  const state = JSON.parse(text) as State;
  // A concurrent run that failed to acquire the journal must not clean up its owner.
  if (expectedRunId && state.runId !== expectedRunId) return;
  if (![state.tenantId, state.userId, state.modelId, state.assessmentId].every(id => /^[0-9a-f-]{36}$/.test(id)) ||
      !state.modelName?.includes('(disposable QA ')) throw new Error('Invalid QA cleanup journal.');
  const { db } = await import('../../../server/db');
  const s = await import('../../../shared/schema');
  await db.transaction(async tx => {
    await tx.delete(s.aiGeneratedContent).where(sql`(
      ${s.aiGeneratedContent.metadata}->>'modelName' = ${state.modelName}
      or ${s.aiGeneratedContent.metadata}->'context'->>'modelName' = ${state.modelName}
    )`);
    await tx.delete(s.aiUsageLog).where(eq(s.aiUsageLog.userId, state.userId));
    await tx.execute(sql`delete from session where sess->'passport'->>'user' = ${state.userId}`);
    await tx.delete(s.knowledgeDocuments).where(eq(s.knowledgeDocuments.modelId, state.modelId));
    await tx.delete(s.models).where(and(eq(s.models.id, state.modelId), eq(s.models.ownerTenantId, state.tenantId), eq(s.models.name, state.modelName)));
    await tx.delete(s.users).where(and(eq(s.users.id, state.userId), eq(s.users.tenantId, state.tenantId)));
    await tx.delete(s.tenants).where(eq(s.tenants.id, state.tenantId));
    const remaining = await tx.select({ id: s.assessments.id }).from(s.assessments).where(eq(s.assessments.id, state.assessmentId));
    if (remaining.length) throw new Error('Fixture assessment was not removed; cleanup journal retained.');
  });
  await fs.unlink(stateFile);
}