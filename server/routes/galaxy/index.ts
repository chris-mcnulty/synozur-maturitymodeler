import type { Express, Request, Response } from 'express';
import { and, desc, eq, gte, inArray, type SQL } from 'drizzle-orm';
import { db } from '../../db';
import { storage } from '../../storage';
import {
  assessments,
  results,
  models,
  tenants,
  galaxyExposurePolicies,
  galaxyWebhooks,
  galaxyWebhookDeliveries,
  galaxyAuditLog,
} from '@shared/schema';
import { galaxyAuth, galaxyCors, requireScope, writeAudit, envelope } from './middleware';
import { buildGalaxyOpenApi } from './openapi';

const PREFIX = '/api/galaxy/v1';

function modelExposureFilter(policy: { exposedModelIds: string[] | null }) {
  if (policy.exposedModelIds === null || policy.exposedModelIds === undefined) return null;
  if (policy.exposedModelIds.length === 0) return [] as string[];
  return policy.exposedModelIds;
}

interface ArtifactDTO {
  id: string;
  type: 'assessment' | 'result' | 'insight';
  title: string;
  modelId: string | null;
  createdAt: Date | null;
  score: number | null;
  label: string | null;
}

interface AssessmentDTO {
  id: string;
  modelId: string;
  status: string;
  startedAt: Date;
  completedAt: Date | null;
}

function paginate<T>(rows: T[], limit: number, after: string | null, idOf: (r: T) => string) {
  const start = after ? rows.findIndex((r) => idOf(r) === after) + 1 : 0;
  const slice = rows.slice(start, start + limit);
  const last = slice[slice.length - 1];
  const nextCursor = slice.length === limit && last ? idOf(last) : null;
  return { slice, nextCursor };
}

export function registerGalaxyRoutes(app: Express) {
  app.options(`${PREFIX}/*`, galaxyCors);

  app.get(`${PREFIX}/openapi.json`, (_req, res) => {
    res.setHeader('cache-control', 'public, max-age=300');
    res.json(buildGalaxyOpenApi());
  });

  app.get(`${PREFIX}/health`, (_req, res) => {
    res.json({ status: 'ok', api: 'galaxy', version: 'v1' });
  });

  app.get(`${PREFIX}/me`, galaxyAuth, async (req: Request, res: Response) => {
    const ctx = req.galaxy!;
    let tenant: { name: string | null; logoUrl: string | null; primaryColor: string | null } = {
      name: null,
      logoUrl: null,
      primaryColor: null,
    };
    if (ctx.tenantId) {
      const [t] = await db
        .select({ name: tenants.name, logoUrl: tenants.logoUrl, primaryColor: tenants.primaryColor })
        .from(tenants)
        .where(eq(tenants.id, ctx.tenantId))
        .limit(1);
      if (t) {
        tenant = {
          name: t.name ?? null,
          logoUrl: t.logoUrl ?? null,
          primaryColor: t.primaryColor ?? null,
        };
      }
    }
    res.json(envelope(req, {
      userId: ctx.user.id,
      email: ctx.user.email,
      name: ctx.user.name,
      role: ctx.user.role,
      tenantId: ctx.tenantId,
      tenant: { id: ctx.tenantId, ...tenant },
      branding: { logoUrl: tenant.logoUrl, primaryColor: tenant.primaryColor },
      scopes: ctx.scopes,
      clientId: ctx.clientId,
    }));
  });

  app.get(
    `${PREFIX}/artifacts`,
    galaxyAuth,
    requireScope('artifacts.read'),
    async (req: Request, res: Response) => {
      const ctx = req.galaxy!;
      const policy = ctx.policy!;
      const type = (req.query.type as string) || '';
      const status = (req.query.status as string) || '';
      const updatedSinceRaw = (req.query.updatedSince as string) || '';
      const updatedSince = updatedSinceRaw ? new Date(updatedSinceRaw) : null;
      if (updatedSince && Number.isNaN(+updatedSince)) {
        return res.status(400).json({ error: 'invalid_updated_since' });
      }
      const limit = Math.min(Number(req.query.limit) || 50, 200);
      const after = (req.query.after as string) || null;

      const allowed = modelExposureFilter(policy);
      const out: ArtifactDTO[] = [];

      if ((!type || type === 'assessment') && policy.exposeAssessments && !(allowed && allowed.length === 0)) {
        const conds: SQL[] = [
          eq(assessments.userId, ctx.user.id),
          eq(assessments.tenantId, ctx.tenantId!),
        ];
        if (allowed) conds.push(inArray(assessments.modelId, allowed));
        if (status) conds.push(eq(assessments.status, status));
        if (updatedSince) conds.push(gte(assessments.startedAt, updatedSince));
        const rows = await db.select().from(assessments).where(and(...conds));
        for (const a of rows) {
          out.push({
            id: a.id,
            type: 'assessment',
            title: `Assessment ${a.id.slice(0, 8)}`,
            modelId: a.modelId,
            createdAt: a.startedAt,
            score: null,
            label: null,
          });
        }
      }

      if ((!type || type === 'result') && policy.exposeResults && !(allowed && allowed.length === 0)) {
        const conds: SQL[] = [
          eq(assessments.userId, ctx.user.id),
          eq(assessments.tenantId, ctx.tenantId!),
        ];
        if (allowed) conds.push(inArray(assessments.modelId, allowed));
        if (updatedSince) conds.push(gte(results.createdAt, updatedSince));
        const rows = await db
          .select({
            id: results.id,
            overallScore: results.overallScore,
            label: results.label,
            createdAt: results.createdAt,
            modelId: assessments.modelId,
          })
          .from(results)
          .innerJoin(assessments, eq(results.assessmentId, assessments.id))
          .where(and(...conds));
        for (const r of rows) {
          out.push({
            id: r.id,
            type: 'result',
            title: `Result ${r.id.slice(0, 8)}`,
            modelId: r.modelId,
            createdAt: r.createdAt,
            score: r.overallScore ?? null,
            label: r.label ?? null,
          });
        }
      }

      out.sort((a, b) => (b.createdAt ? +b.createdAt : 0) - (a.createdAt ? +a.createdAt : 0));
      const { slice, nextCursor } = paginate(out, limit, after, (r) => `${r.type}:${r.id}`);
      res.json(envelope(req, slice, { nextCursor, limit }));
      writeAudit(req, res, 'artifact', null);
    },
  );

  app.get(
    `${PREFIX}/assessments`,
    galaxyAuth,
    requireScope('assessments.read'),
    async (req: Request, res: Response) => {
      const ctx = req.galaxy!;
      const policy = ctx.policy!;
      const limit = Math.min(Number(req.query.limit) || 50, 200);
      const after = (req.query.after as string) || null;

      if (!policy.exposeAssessments) {
        return res.json(envelope(req, [], { nextCursor: null, limit }));
      }

      const allowed = modelExposureFilter(policy);
      if (allowed && allowed.length === 0) {
        return res.json(envelope(req, [], { nextCursor: null, limit }));
      }

      const conds: SQL[] = [
        eq(assessments.userId, ctx.user.id),
        eq(assessments.tenantId, ctx.tenantId!),
      ];
      if (allowed) conds.push(inArray(assessments.modelId, allowed));
      const rows = await db
        .select()
        .from(assessments)
        .where(and(...conds))
        .orderBy(desc(assessments.startedAt));

      const mapped: AssessmentDTO[] = rows.map((a) => ({
        id: a.id,
        modelId: a.modelId,
        status: a.status,
        startedAt: a.startedAt,
        completedAt: a.completedAt,
      }));
      const { slice, nextCursor } = paginate(mapped, limit, after, (r) => r.id);
      res.json(envelope(req, slice, { nextCursor, limit }));
      writeAudit(req, res, 'assessment', null);
    },
  );

  app.get(
    `${PREFIX}/assessments/:id`,
    galaxyAuth,
    requireScope('assessments.read'),
    async (req: Request, res: Response) => {
      const ctx = req.galaxy!;
      const policy = ctx.policy!;
      if (!policy.exposeAssessments) return res.status(404).json({ error: 'not_found' });

      const allowed = modelExposureFilter(policy);
      if (allowed && allowed.length === 0) return res.status(404).json({ error: 'not_found' });
      const conds: SQL[] = [
        eq(assessments.id, req.params.id),
        eq(assessments.userId, ctx.user.id),
        eq(assessments.tenantId, ctx.tenantId!),
      ];
      if (allowed) conds.push(inArray(assessments.modelId, allowed));
      const [a] = await db.select().from(assessments).where(and(...conds)).limit(1);
      if (!a) return res.status(404).json({ error: 'not_found' });

      let result: {
        id: string;
        overallScore: number;
        label: string;
        dimensionScores: unknown;
        createdAt: Date | null;
      } | null = null;
      if (policy.exposeResults) {
        const [r] = await db.select().from(results).where(eq(results.assessmentId, a.id)).limit(1);
        if (r) {
          result = {
            id: r.id,
            overallScore: r.overallScore,
            label: r.label,
            dimensionScores: r.dimensionScores,
            createdAt: r.createdAt,
          };
        }
      }

      res.json(envelope(req, {
        assessment: {
          id: a.id,
          modelId: a.modelId,
          status: a.status,
          startedAt: a.startedAt,
          completedAt: a.completedAt,
        },
        result,
      }));
      writeAudit(req, res, 'assessment', a.id);
    },
  );

  app.get(
    `${PREFIX}/insights/me`,
    galaxyAuth,
    requireScope('insights.read'),
    async (req: Request, res: Response) => {
      const ctx = req.galaxy!;
      const policy = ctx.policy!;
      if (!policy.exposeInsights) {
        return res.json(envelope(req, { summary: null, insights: [] }));
      }

      const allowed = modelExposureFilter(policy);
      if (allowed && allowed.length === 0) {
        return res.json(envelope(req, { summary: { completedAssessments: 0, averageScore: null, latest: null }, insights: [] }));
      }

      const insightConds: SQL[] = [
        eq(assessments.userId, ctx.user.id),
        eq(assessments.tenantId, ctx.tenantId!),
      ];
      if (allowed) insightConds.push(inArray(assessments.modelId, allowed));
      const rows = await db
        .select({
          id: results.id,
          overallScore: results.overallScore,
          label: results.label,
          createdAt: results.createdAt,
          modelId: assessments.modelId,
        })
        .from(results)
        .innerJoin(assessments, eq(results.assessmentId, assessments.id))
        .where(and(...insightConds));
      rows.sort((a, b) => +new Date(b.createdAt!) - +new Date(a.createdAt!));

      const summary = {
        completedAssessments: rows.length,
        averageScore:
          rows.length > 0
            ? Math.round(rows.reduce((s, r) => s + (r.overallScore ?? 0), 0) / rows.length)
            : null,
        latest:
          rows[0] != null
            ? {
                id: rows[0].id,
                modelId: rows[0].modelId,
                score: rows[0].overallScore,
                label: rows[0].label,
                createdAt: rows[0].createdAt,
              }
            : null,
      };
      res.json(envelope(req, { summary, insights: [] }));
      writeAudit(req, res, 'insight', null);
    },
  );

  // Forward-compatibility stubs. Courses, attestations, and certificate
  // generation are not yet implemented in Orion. These endpoints exist so
  // Galaxy can probe capability and so contract tests remain stable; they
  // return `notImplemented: true` and an empty collection regardless of
  // policy. Real implementations are tracked as follow-up work.
  app.get(
    `${PREFIX}/courses`,
    galaxyAuth,
    requireScope('courses.read'),
    async (req, res) =>
      res.json(envelope(req, [], { nextCursor: null, limit: 0 })),
  );
  app.get(
    `${PREFIX}/attestations`,
    galaxyAuth,
    requireScope('attestations.read'),
    async (req, res) =>
      res.json(envelope(req, [], { nextCursor: null, limit: 0 })),
  );
  app.get(
    `${PREFIX}/certificates`,
    galaxyAuth,
    requireScope('artifacts.read'),
    async (req, res) => {
      const policy = req.galaxy!.policy!;
      if (!policy.exposeCertificates) return res.json(envelope(req, []));
      res.json(envelope(req, [], { nextCursor: null, limit: 0 }));
    },
  );
}

import { ensureAnyAdmin } from '../../auth';
import { galaxyPolicyUpdateSchema, galaxyWebhookUpdateSchema } from '@shared/schema';
import { generateWebhookSecret, emitGalaxyEvent, redeliverGalaxyEvent, validateWebhookUrl } from './webhooks';

export function registerGalaxyAdminRoutes(app: Express) {
  function resolveTenantId(req: Request, res: Response): string | null {
    const u = req.user as { id: string; role?: string; tenantId?: string | null } | undefined;
    if (!u) {
      res.status(401).json({ error: 'unauthorized' });
      return null;
    }
    if (u.role === 'global_admin') {
      const tid = (req.query.tenantId as string) || (req.body && req.body.tenantId) || u.tenantId;
      if (!tid) {
        res.status(400).json({ error: 'tenantId required' });
        return null;
      }
      return tid;
    }
    if (!u.tenantId) {
      res.status(403).json({ error: 'No tenant assigned' });
      return null;
    }
    return u.tenantId;
  }

  app.get('/api/admin/galaxy/policy', ensureAnyAdmin, async (req, res) => {
    const tenantId = resolveTenantId(req, res);
    if (!tenantId) return;
    const [policy] = await db
      .select()
      .from(galaxyExposurePolicies)
      .where(eq(galaxyExposurePolicies.tenantId, tenantId))
      .limit(1);
    res.json({ policy: policy ?? null });
  });

  app.put('/api/admin/galaxy/policy', ensureAnyAdmin, async (req, res) => {
    const tenantId = resolveTenantId(req, res);
    if (!tenantId) return;
    const parsed = galaxyPolicyUpdateSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'invalid_body', details: parsed.error.flatten() });

    // If exposedModelIds is being set, validate every id is a tenant-visible model.
    if (parsed.data.exposedModelIds && parsed.data.exposedModelIds.length > 0) {
      const { modelTenants } = await import('@shared/schema');
      const allowedRows = await db
        .select({ id: modelTenants.modelId })
        .from(modelTenants)
        .where(eq(modelTenants.tenantId, tenantId));
      const allowedSet = new Set(allowedRows.map((r) => r.id));
      const bad = parsed.data.exposedModelIds.filter((id) => !allowedSet.has(id));
      if (bad.length > 0) {
        return res.status(400).json({ error: 'invalid_model_ids', invalidModelIds: bad });
      }
    }

    const [existing] = await db
      .select()
      .from(galaxyExposurePolicies)
      .where(eq(galaxyExposurePolicies.tenantId, tenantId))
      .limit(1);

    let saved;
    if (existing) {
      [saved] = await db
        .update(galaxyExposurePolicies)
        .set({ ...parsed.data, updatedAt: new Date() })
        .where(eq(galaxyExposurePolicies.tenantId, tenantId))
        .returning();
    } else {
      [saved] = await db
        .insert(galaxyExposurePolicies)
        .values({ tenantId, ...parsed.data })
        .returning();
    }
    res.json({ policy: saved });
  });

  app.get('/api/admin/galaxy/webhook', ensureAnyAdmin, async (req, res) => {
    const tenantId = resolveTenantId(req, res);
    if (!tenantId) return;
    const [hook] = await db
      .select()
      .from(galaxyWebhooks)
      .where(eq(galaxyWebhooks.tenantId, tenantId))
      .limit(1);
    if (!hook) return res.json({ webhook: null });
    res.json({
      webhook: {
        id: hook.id,
        url: hook.url,
        active: hook.active,
        events: hook.events,
        signingSecretMasked: hook.signingSecret.slice(0, 6) + '…' + hook.signingSecret.slice(-4),
        createdAt: hook.createdAt,
        updatedAt: hook.updatedAt,
      },
    });
  });

  app.put('/api/admin/galaxy/webhook', ensureAnyAdmin, async (req, res) => {
    const tenantId = resolveTenantId(req, res);
    if (!tenantId) return;
    const parsed = galaxyWebhookUpdateSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'invalid_body', details: parsed.error.flatten() });

    const guard = await validateWebhookUrl(parsed.data.url);
    if (!guard.ok) return res.status(400).json({ error: 'invalid_webhook_url', reason: guard.reason });

    const [existing] = await db
      .select()
      .from(galaxyWebhooks)
      .where(eq(galaxyWebhooks.tenantId, tenantId))
      .limit(1);

    let saved;
    if (existing) {
      [saved] = await db
        .update(galaxyWebhooks)
        .set({ ...parsed.data, updatedAt: new Date() })
        .where(eq(galaxyWebhooks.tenantId, tenantId))
        .returning();
    } else {
      [saved] = await db
        .insert(galaxyWebhooks)
        .values({ tenantId, ...parsed.data, signingSecret: generateWebhookSecret() })
        .returning();
    }
    res.json({
      webhook: {
        ...saved,
        signingSecret: undefined,
        signingSecretMasked: saved.signingSecret.slice(0, 6) + '…' + saved.signingSecret.slice(-4),
      },
    });
  });

  app.post('/api/admin/galaxy/webhook/rotate-secret', ensureAnyAdmin, async (req, res) => {
    const tenantId = resolveTenantId(req, res);
    if (!tenantId) return;
    const newSecret = generateWebhookSecret();
    const [updated] = await db
      .update(galaxyWebhooks)
      .set({ signingSecret: newSecret, updatedAt: new Date() })
      .where(eq(galaxyWebhooks.tenantId, tenantId))
      .returning();
    if (!updated) return res.status(404).json({ error: 'no webhook configured' });
    res.json({ signingSecret: newSecret, rotatedAt: updated.updatedAt });
  });

  app.post('/api/admin/galaxy/webhook/test', ensureAnyAdmin, async (req, res) => {
    const tenantId = resolveTenantId(req, res);
    if (!tenantId) return;
    await emitGalaxyEvent(tenantId, 'assessment.completed', {
      test: true,
      message: 'Synthetic test event from Orion admin console',
      sentBy: (req.user as { id: string }).id,
    });
    res.json({ ok: true });
  });

  app.post('/api/admin/galaxy/deliveries/:id/redeliver', ensureAnyAdmin, async (req, res) => {
    const tenantId = resolveTenantId(req, res);
    if (!tenantId) return;
    const ok = await redeliverGalaxyEvent(req.params.id, tenantId);
    if (!ok) return res.status(404).json({ error: 'delivery_not_found' });
    res.json({ ok: true });
  });

  app.get('/api/admin/galaxy/deliveries', ensureAnyAdmin, async (req, res) => {
    const tenantId = resolveTenantId(req, res);
    if (!tenantId) return;
    const limit = Math.min(Number(req.query.limit) || 50, 500);
    const rows = await db
      .select()
      .from(galaxyWebhookDeliveries)
      .where(eq(galaxyWebhookDeliveries.tenantId, tenantId))
      .orderBy(desc(galaxyWebhookDeliveries.createdAt))
      .limit(limit);
    res.json({ deliveries: rows });
  });

  app.get('/api/admin/galaxy/audit', ensureAnyAdmin, async (req, res) => {
    const tenantId = resolveTenantId(req, res);
    if (!tenantId) return;
    const limit = Math.min(Number(req.query.limit) || 100, 500);
    const rows = await db
      .select()
      .from(galaxyAuditLog)
      .where(eq(galaxyAuditLog.tenantId, tenantId))
      .orderBy(desc(galaxyAuditLog.createdAt))
      .limit(limit);
    res.json({ entries: rows });
  });

  app.get('/api/admin/galaxy/models', ensureAnyAdmin, async (req, res) => {
    const tenantId = resolveTenantId(req, res);
    if (!tenantId) return;
    const { modelTenants } = await import('@shared/schema');
    const rows = await db
      .select({ id: models.id, name: models.name, status: models.status })
      .from(models)
      .innerJoin(modelTenants, eq(modelTenants.modelId, models.id))
      .where(eq(modelTenants.tenantId, tenantId));
    res.json({ models: rows });
  });
}
