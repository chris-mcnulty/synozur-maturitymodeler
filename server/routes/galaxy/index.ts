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
  courses as coursesTable,
  courseTenants,
  galaxyAttestations as attestationsTable,
} from '@shared/schema';
import { galaxyAuth, galaxyCors, requireScope, writeAudit, envelope } from './middleware';
import { buildGalaxyOpenApi } from './openapi';
import { emitGalaxyEvent } from './webhooks';

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

  app.get(
    `${PREFIX}/courses`,
    galaxyAuth,
    requireScope('courses.read'),
    async (req: Request, res: Response) => {
      const ctx = req.galaxy!;
      const policy = ctx.policy!;
      const limit = Math.min(Number(req.query.limit) || 50, 200);
      const after = (req.query.after as string) || null;
      if (!ctx.tenantId || !policy.exposeCourses) {
        return res.json(envelope(req, [], { nextCursor: null, limit }));
      }
      const courses = await storage.getCoursesForTenant(ctx.tenantId, {
        status: 'published',
      });
      const enrollments = await storage.getCourseEnrollmentsByUser(ctx.user.id, ctx.tenantId);
      const enrollByCourse = new Map(enrollments.map((e) => [e.courseId, e]));
      // Map learning-courses EnrollmentStatus → Galaxy contract status
      const galaxyEnrollmentStatus = (s: string): 'not_started' | 'in_progress' | 'completed' => {
        if (s === 'completed') return 'completed';
        if (s === 'in_progress') return 'in_progress';
        return 'not_started';
      };
      const out = courses.map((c) => {
        const e = enrollByCourse.get(c.id) ?? null;
        return {
          id: c.id,
          slug: c.slug,
          title: c.title,
          description: c.description,
          summary: c.summary,
          estimatedMinutes: c.estimatedMinutes,
          imageUrl: c.imageUrl,
          createdAt: c.createdAt,
          updatedAt: c.updatedAt,
          enrollment: e
            ? {
                status: galaxyEnrollmentStatus(e.status),
                progressPercent: e.progressPercent,
                startedAt: e.startedAt,
                completedAt: e.completedAt,
              }
            : { status: 'not_started' as const, progressPercent: 0, startedAt: null, completedAt: null },
        };
      });
      const { slice, nextCursor } = paginate(out, limit, after, (r) => r.id);
      res.json(envelope(req, slice, { nextCursor, limit }));
      writeAudit(req, res, 'course', null);
    },
  );

  app.get(
    `${PREFIX}/attestations`,
    galaxyAuth,
    requireScope('attestations.read'),
    async (req: Request, res: Response) => {
      const ctx = req.galaxy!;
      const policy = ctx.policy!;
      const limit = Math.min(Number(req.query.limit) || 50, 200);
      const after = (req.query.after as string) || null;
      if (!ctx.tenantId || !policy.exposeAttestations) {
        return res.json(envelope(req, [], { nextCursor: null, limit }));
      }
      const atts = await storage.getAttestationsForTenant(ctx.tenantId, {
        status: 'active',
        userRole: ctx.user.role ?? null,
      });
      const sigs = await storage.getAttestationSignaturesByUser(ctx.user.id, ctx.tenantId);
      const sigByAtt = new Map(sigs.map((s) => [s.attestationId, s]));
      const out = atts.map((a) => {
        const s = sigByAtt.get(a.id) ?? null;
        return {
          id: a.id,
          title: a.title,
          body: a.body,
          version: a.version,
          status: a.status,
          createdAt: a.createdAt,
          updatedAt: a.updatedAt,
          signature: s
            ? { signedAt: s.signedAt, signatureText: s.signatureText }
            : null,
          signed: s !== null,
        };
      });
      const { slice, nextCursor } = paginate(out, limit, after, (r) => r.id);
      res.json(envelope(req, slice, { nextCursor, limit }));
      writeAudit(req, res, 'attestation', null);
    },
  );

  app.get(
    `${PREFIX}/certificates`,
    galaxyAuth,
    requireScope('artifacts.read'),
    async (req: Request, res: Response) => {
      const ctx = req.galaxy!;
      const policy = ctx.policy!;
      const limit = Math.min(Number(req.query.limit) || 50, 200);
      const after = (req.query.after as string) || null;
      if (!policy.exposeCertificates || !ctx.tenantId) {
        return res.json(envelope(req, [], { nextCursor: null, limit }));
      }
      const allowed = modelExposureFilter(policy);
      // Empty allowlist means "no models exposed". Match the assessments
      // / results behavior and short-circuit so non-model-bound
      // certificates do not leak through the gate.
      if (allowed && allowed.length === 0) {
        return res.json(envelope(req, [], { nextCursor: null, limit }));
      }
      let rows = await storage.getCertificatesByUser(ctx.user.id, ctx.tenantId);
      if (allowed) {
        const allowedSet = new Set(allowed);
        rows = rows.filter((c) => !c.modelId || allowedSet.has(c.modelId));
      }
      const out = rows.map((c) => ({
        id: c.id,
        title: c.title,
        serialNumber: c.serialNumber,
        sourceType: c.sourceType,
        sourceId: c.sourceId,
        modelId: c.modelId,
        issuedAt: c.issuedAt,
        expiresAt: c.expiresAt,
        pdfUrl: c.pdfUrl,
        revokedAt: c.revokedAt,
      }));
      const { slice, nextCursor } = paginate(out, limit, after, (r) => r.id);
      res.json(envelope(req, slice, { nextCursor, limit }));
      writeAudit(req, res, 'certificate', null);
    },
  );

  // Galaxy mutating endpoints for course progress, attestation signature,
  // and certificate issuance. These transitions are what trigger the
  // course.completed / attestation.signed / certificate.issued webhook
  // events for downstream Galaxy listeners.

  app.post(
    `${PREFIX}/courses/:id/progress`,
    galaxyAuth,
    requireScope('courses.write'),
    async (req: Request, res: Response) => {
      const ctx = req.galaxy!;
      const policy = ctx.policy!;
      if (!ctx.tenantId) return res.status(400).json({ error: 'no_tenant' });
      if (!policy.exposeCourses) {
        return res.status(403).json({ error: 'courses_not_exposed' });
      }
      const body = req.body as {
        status?: 'not_started' | 'in_progress' | 'completed';
        progressPercent?: number;
      };
      const status = body.status ?? 'in_progress';
      if (!['not_started', 'in_progress', 'completed'].includes(status)) {
        return res.status(400).json({ error: 'invalid_status' });
      }
      // Course visibility gate: must be public, owned by tenant, or shared
      // with tenant via courseTenants.
      const [course] = await db
        .select()
        .from(coursesTable)
        .where(eq(coursesTable.id, req.params.id))
        .limit(1);
      if (!course) return res.status(404).json({ error: 'not_found' });
      // Match GET /courses: only published courses are exposed via Galaxy.
      if (course.status !== 'published') {
        return res.status(404).json({ error: 'not_found' });
      }
      const isPublic = course.visibility === 'public';
      const isOwned = course.ownerTenantId === ctx.tenantId;
      let isShared = false;
      if (!isPublic && !isOwned) {
        const [share] = await db
          .select({ id: courseTenants.id })
          .from(courseTenants)
          .where(and(
            eq(courseTenants.courseId, course.id),
            eq(courseTenants.tenantId, ctx.tenantId),
          ))
          .limit(1);
        isShared = !!share;
      }
      if (!isPublic && !isOwned && !isShared) {
        return res.status(404).json({ error: 'not_found' });
      }

      const { enrollment, transitionedToCompleted } = await storage.upsertCourseProgress({
        courseId: course.id,
        userId: ctx.user.id,
        tenantId: ctx.tenantId,
        status,
        progressPercent: body.progressPercent,
      });

      if (transitionedToCompleted) {
        try {
          await emitGalaxyEvent(ctx.tenantId, 'course.completed', {
            courseId: course.id,
            courseTitle: course.title,
            userId: ctx.user.id,
            completedAt: enrollment.completedAt,
          });
        } catch (err) {
          // eslint-disable-next-line no-console
          console.error('[galaxy] course.completed emit failed', err);
        }
        // Auto-issue a certificate when the course has it enabled. This
        // emits certificate.issued for the same transition.
        if (course.certificateEnabled) {
          try {
            await issueCertificateAndEmit({
              tenantId: ctx.tenantId,
              userId: ctx.user.id,
              sourceType: 'course',
              sourceId: course.id,
              title: `${course.title} — Certificate of Completion`,
            });
          } catch (err) {
            // eslint-disable-next-line no-console
            console.error('[galaxy] certificate auto-issue failed', err);
          }
        }
      }

      // Normalize the enrollment status back to the Galaxy contract
      // values so the response shape matches GET /courses and OpenAPI.
      const galaxyStatus: 'not_started' | 'in_progress' | 'completed' =
        enrollment.status === 'completed'
          ? 'completed'
          : enrollment.status === 'in_progress'
            ? 'in_progress'
            : 'not_started';
      res.json(envelope(req, {
        enrollment: {
          id: enrollment.id,
          courseId: enrollment.courseId,
          userId: enrollment.userId,
          status: galaxyStatus,
          progressPercent: enrollment.progressPercent,
          startedAt: enrollment.startedAt,
          completedAt: enrollment.completedAt,
        },
      }));
      writeAudit(req, res, 'course', course.id);
    },
  );

  app.post(
    `${PREFIX}/attestations/:id/sign`,
    galaxyAuth,
    requireScope('attestations.write'),
    async (req: Request, res: Response) => {
      const ctx = req.galaxy!;
      const policy = ctx.policy!;
      if (!ctx.tenantId) return res.status(400).json({ error: 'no_tenant' });
      if (!policy.exposeAttestations) {
        return res.status(403).json({ error: 'attestations_not_exposed' });
      }
      const body = req.body as { signatureText?: string };
      const [att] = await db
        .select()
        .from(attestationsTable)
        .where(and(eq(attestationsTable.id, req.params.id), eq(attestationsTable.tenantId, ctx.tenantId)))
        .limit(1);
      if (!att) return res.status(404).json({ error: 'not_found' });
      // Per-resource audience role gate. Match GET /attestations: when
      // an attestation declares audienceRoles, the caller's role must be
      // included. Return 404 (not 403) so we don't leak existence to
      // out-of-audience users, mirroring how the list endpoint hides it.
      const audienceRoles = att.audienceRoles ?? null;
      if (audienceRoles && audienceRoles.length > 0) {
        const userRole = ctx.user.role ?? null;
        if (!userRole || !audienceRoles.includes(userRole)) {
          return res.status(404).json({ error: 'not_found' });
        }
      }
      if (att.status !== 'active') return res.status(409).json({ error: 'attestation_not_active' });

      const ipRaw = (req.ip || (req.headers['x-forwarded-for'] as string) || '').toString();
      const { signature, created } = await storage.signAttestation({
        attestationId: att.id,
        userId: ctx.user.id,
        tenantId: ctx.tenantId,
        signatureText: body.signatureText ?? null,
        ipAddress: ipRaw ? ipRaw.slice(0, 64) : null,
      });

      if (created) {
        try {
          await emitGalaxyEvent(ctx.tenantId, 'attestation.signed', {
            attestationId: att.id,
            attestationTitle: att.title,
            attestationVersion: att.version,
            userId: ctx.user.id,
            signedAt: signature.signedAt,
          });
        } catch (err) {
          // eslint-disable-next-line no-console
          console.error('[galaxy] attestation.signed emit failed', err);
        }
      }

      res.json(envelope(req, { signature, created }));
      writeAudit(req, res, 'attestation', att.id);
    },
  );
}

// Internal helper used by admin/issuance flows to mint a certificate and
// emit the corresponding Galaxy webhook. Exported so other services
// (admin routes, future automation) can issue certificates without
// duplicating event-emission logic.
export async function issueCertificateAndEmit(input: {
  tenantId: string;
  userId: string;
  sourceType: 'assessment' | 'course' | 'attestation' | 'manual';
  sourceId?: string | null;
  modelId?: string | null;
  title: string;
  expiresAt?: Date | null;
  pdfUrl?: string | null;
}): Promise<{ certificate: import('@shared/schema').Certificate }> {
  const { certificate, created } = await storage.issueCertificate({
    tenantId: input.tenantId,
    userId: input.userId,
    sourceType: input.sourceType,
    sourceId: input.sourceId ?? null,
    modelId: input.modelId ?? null,
    title: input.title,
    expiresAt: input.expiresAt ?? null,
    pdfUrl: input.pdfUrl ?? null,
  });
  // Only emit certificate.issued the first time the certificate is
  // minted; duplicate auto-issue calls are now no-ops and must not
  // produce additional webhooks.
  if (!created) return { certificate };
  try {
    await emitGalaxyEvent(input.tenantId, 'certificate.issued', {
      certificateId: certificate.id,
      serialNumber: certificate.serialNumber,
      title: certificate.title,
      sourceType: certificate.sourceType,
      sourceId: certificate.sourceId,
      modelId: certificate.modelId,
      userId: certificate.userId,
      issuedAt: certificate.issuedAt,
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[galaxy] certificate.issued emit failed', err);
  }
  return { certificate };
}

import { ensureAnyAdmin } from '../../auth';
import { galaxyPolicyUpdateSchema, galaxyWebhookUpdateSchema } from '@shared/schema';
import { generateWebhookSecret, redeliverGalaxyEvent, validateWebhookUrl } from './webhooks';
export { registerGalaxyPortalRoutes, registerGalaxyPortalAdminRoutes } from './portal';

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
