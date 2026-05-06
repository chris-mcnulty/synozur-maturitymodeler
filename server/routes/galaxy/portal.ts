import type { Express, Request, Response, NextFunction } from 'express';
import { createHash, randomBytes } from 'crypto';
import { and, desc, eq, gte, lte, sql } from 'drizzle-orm';
import { db } from '../../db';
import {
  galaxyPortalKeys,
  tenantDomains,
  models,
  courses as coursesTable,
  results,
  assessments,
  trafficVisits,
  modelTenants,
  courseTenants,
} from '@shared/schema';
import { ensureGlobalAdmin } from '../../auth';

const PREFIX = '/api/galaxy/v1/portal';

function hashKey(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}

function generateRawKey(): string {
  return 'gpk_' + randomBytes(24).toString('hex');
}

async function portalKeyAuth(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  let rawKey: string | null = null;
  if (authHeader?.startsWith('ApiKey ')) {
    rawKey = authHeader.slice(7);
  } else if (authHeader?.startsWith('Bearer ')) {
    rawKey = authHeader.slice(7);
  } else {
    const xkey = req.headers['x-galaxy-key'] as string | undefined;
    if (xkey) rawKey = xkey;
  }
  if (!rawKey) {
    return res.status(401).json({ error: 'missing_api_key', message: 'Pass Authorization: ApiKey <key> or X-Galaxy-Key header' });
  }
  try {
    const [keyRow] = await db
      .select()
      .from(galaxyPortalKeys)
      .where(and(eq(galaxyPortalKeys.keyHash, hashKey(rawKey)), eq(galaxyPortalKeys.isActive, true)))
      .limit(1);
    if (!keyRow) {
      return res.status(401).json({ error: 'invalid_api_key' });
    }
    (req as any).portalKey = keyRow;

    const domain = (req.query.domain as string || '').toLowerCase().trim();
    if (domain) {
      if (keyRow.allowedDomains.length > 0 && !keyRow.allowedDomains.includes(domain)) {
        return res.status(403).json({ error: 'domain_not_allowed' });
      }
    }
    (req as any).portalDomain = domain || null;

    const origin = req.headers.origin;
    if (origin && keyRow.allowedOrigins.length > 0 && keyRow.allowedOrigins.includes(origin)) {
      res.setHeader('access-control-allow-origin', origin);
      res.setHeader('vary', 'Origin');
      res.setHeader('access-control-allow-headers', 'authorization, x-galaxy-key, content-type');
      res.setHeader('access-control-allow-methods', 'GET, OPTIONS');
    }

    db.update(galaxyPortalKeys)
      .set({ lastUsedAt: new Date() })
      .where(eq(galaxyPortalKeys.id, keyRow.id))
      .catch(() => {});

    next();
  } catch (err) {
    console.error('[galaxy-portal] auth error', err);
    res.status(500).json({ error: 'server_error' });
  }
}

async function resolveTenantForDomain(domain: string): Promise<string | null> {
  const [row] = await db
    .select({ tenantId: tenantDomains.tenantId })
    .from(tenantDomains)
    .where(eq(tenantDomains.domain, domain))
    .limit(1);
  return row?.tenantId ?? null;
}

export function registerGalaxyPortalRoutes(app: Express) {
  app.options(`${PREFIX}/*`, async (req: Request, res: Response) => {
    const origin = req.headers.origin;
    if (origin) {
      try {
        const [match] = await db
          .select({ id: galaxyPortalKeys.id })
          .from(galaxyPortalKeys)
          .where(and(eq(galaxyPortalKeys.isActive, true), sql`${origin} = ANY(${galaxyPortalKeys.allowedOrigins})`))
          .limit(1);
        if (match) {
          res.setHeader('access-control-allow-origin', origin);
          res.setHeader('vary', 'Origin');
          res.setHeader('access-control-allow-headers', 'authorization, x-galaxy-key, content-type');
          res.setHeader('access-control-allow-methods', 'GET, OPTIONS');
          res.setHeader('access-control-max-age', '600');
        }
      } catch {}
    }
    res.status(204).end();
  });

  // GET /portal/models?domain=synozur.com
  // Returns published assessment models visible to that domain's tenant
  app.get(`${PREFIX}/models`, portalKeyAuth, async (req: Request, res: Response) => {
    const domain = (req as any).portalDomain as string | null;
    if (!domain) return res.status(400).json({ error: 'domain_required' });

    const tenantId = await resolveTenantForDomain(domain);
    if (!tenantId) return res.json({ data: [], domain, tenantFound: false });

    const rows = await db
      .select({
        id: models.id,
        slug: models.slug,
        name: models.name,
        description: models.description,
        estimatedTime: models.estimatedTime,
        imageUrl: models.imageUrl,
        status: models.status,
      })
      .from(models)
      .innerJoin(modelTenants, eq(modelTenants.modelId, models.id))
      .where(and(eq(modelTenants.tenantId, tenantId), eq(models.status, 'published')));

    res.json({ data: rows, domain, tenantId });
  });

  // GET /portal/courses?domain=synozur.com
  // Returns published courses visible to that domain: public ones + tenant-shared ones
  app.get(`${PREFIX}/courses`, portalKeyAuth, async (req: Request, res: Response) => {
    const domain = (req as any).portalDomain as string | null;
    if (!domain) return res.status(400).json({ error: 'domain_required' });

    const tenantId = await resolveTenantForDomain(domain);
    if (!tenantId) return res.json({ data: [], domain, tenantFound: false });

    const cols = {
      id: coursesTable.id,
      slug: coursesTable.slug,
      title: coursesTable.title,
      description: coursesTable.description,
      summary: coursesTable.summary,
      estimatedMinutes: coursesTable.estimatedMinutes,
      imageUrl: coursesTable.imageUrl,
      createdAt: coursesTable.createdAt,
      updatedAt: coursesTable.updatedAt,
    };

    const [publicRows, tenantRows] = await Promise.all([
      db.select(cols)
        .from(coursesTable)
        .where(and(eq(coursesTable.status, 'published'), eq(coursesTable.visibility, 'public'))),
      db.select(cols)
        .from(coursesTable)
        .innerJoin(courseTenants, eq(courseTenants.courseId, coursesTable.id))
        .where(and(eq(coursesTable.status, 'published'), eq(courseTenants.tenantId, tenantId))),
    ]);

    const seen = new Set<string>();
    const out = [...publicRows, ...tenantRows].filter((c) => {
      if (seen.has(c.id)) return false;
      seen.add(c.id);
      return true;
    });
    out.sort((a, b) => +new Date(b.updatedAt ?? b.createdAt ?? 0) - +new Date(a.updatedAt ?? a.createdAt ?? 0));

    res.json({ data: out, domain, tenantId });
  });

  // GET /portal/results?domain=synozur.com&modelId=&limit=&from=
  // Returns aggregate (anonymized) results for users in that domain's tenant
  app.get(`${PREFIX}/results`, portalKeyAuth, async (req: Request, res: Response) => {
    const domain = (req as any).portalDomain as string | null;
    if (!domain) return res.status(400).json({ error: 'domain_required' });

    const tenantId = await resolveTenantForDomain(domain);
    if (!tenantId) return res.json({ data: [], domain, tenantFound: false });

    const modelId = req.query.modelId as string | undefined;
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const fromDate = req.query.from ? new Date(req.query.from as string) : null;

    const conds: ReturnType<typeof eq>[] = [eq(assessments.tenantId, tenantId)];
    if (modelId) conds.push(eq(assessments.modelId, modelId));
    if (fromDate && !isNaN(+fromDate)) conds.push(gte(results.createdAt, fromDate) as any);

    const rows = await db
      .select({
        resultId: results.id,
        modelId: assessments.modelId,
        overallScore: results.overallScore,
        label: results.label,
        createdAt: results.createdAt,
      })
      .from(results)
      .innerJoin(assessments, eq(results.assessmentId, assessments.id))
      .where(and(...(conds as any[])))
      .orderBy(desc(results.createdAt))
      .limit(limit);

    res.json({ data: rows, domain, tenantId });
  });

  // GET /portal/traffic?from=ISO&to=ISO
  // Returns aggregated traffic stats from Orion's trafficVisits for the central reporting app
  // No domain required — returns app-wide traffic
  app.get(`${PREFIX}/traffic`, portalKeyAuth, async (req: Request, res: Response) => {
    const fromDate = req.query.from
      ? new Date(req.query.from as string)
      : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const toDate = req.query.to ? new Date(req.query.to as string) : new Date();

    if (isNaN(+fromDate) || isNaN(+toDate)) {
      return res.status(400).json({ error: 'invalid_date_range' });
    }

    const rows = await db
      .select()
      .from(trafficVisits)
      .where(and(gte(trafficVisits.visitedAt, fromDate), lte(trafficVisits.visitedAt, toDate)))
      .orderBy(desc(trafficVisits.visitedAt));

    const byPage: Record<string, number> = {};
    const byDate: Record<string, number> = {};
    const byCountry: Record<string, number> = {};
    const byDevice: Record<string, number> = {};
    const byBrowser: Record<string, number> = {};

    for (const v of rows) {
      byPage[v.page] = (byPage[v.page] || 0) + 1;
      const d = v.visitedAt.toISOString().slice(0, 10);
      byDate[d] = (byDate[d] || 0) + 1;
      if (v.country) byCountry[v.country] = (byCountry[v.country] || 0) + 1;
      if (v.deviceType) byDevice[v.deviceType] = (byDevice[v.deviceType] || 0) + 1;
      if (v.browser) byBrowser[v.browser] = (byBrowser[v.browser] || 0) + 1;
    }

    const toArr = (rec: Record<string, number>, key: string) =>
      Object.entries(rec)
        .map(([k, count]) => ({ [key]: k, count }))
        .sort((a, b) => b.count - a.count);

    res.json({
      data: {
        totalVisits: rows.length,
        from: fromDate.toISOString(),
        to: toDate.toISOString(),
        byPage: toArr(byPage, 'page'),
        byDate: Object.entries(byDate)
          .map(([date, count]) => ({ date, count }))
          .sort((a, b) => a.date.localeCompare(b.date)),
        byCountry: toArr(byCountry, 'country'),
        byDevice: toArr(byDevice, 'device'),
        byBrowser: toArr(byBrowser, 'browser'),
      },
    });
  });
}

export function registerGalaxyPortalAdminRoutes(app: Express) {
  app.get('/api/admin/galaxy/portal-keys', ensureGlobalAdmin, async (_req: Request, res: Response) => {
    const rows = await db
      .select({
        id: galaxyPortalKeys.id,
        label: galaxyPortalKeys.label,
        allowedDomains: galaxyPortalKeys.allowedDomains,
        allowedOrigins: galaxyPortalKeys.allowedOrigins,
        isActive: galaxyPortalKeys.isActive,
        createdAt: galaxyPortalKeys.createdAt,
        lastUsedAt: galaxyPortalKeys.lastUsedAt,
      })
      .from(galaxyPortalKeys)
      .orderBy(desc(galaxyPortalKeys.createdAt));
    res.json({ keys: rows });
  });

  app.post('/api/admin/galaxy/portal-keys', ensureGlobalAdmin, async (req: Request, res: Response) => {
    const { label, allowedDomains, allowedOrigins } = req.body as {
      label?: string;
      allowedDomains?: string[];
      allowedOrigins?: string[];
    };
    if (!label?.trim()) return res.status(400).json({ error: 'label_required' });

    const rawKey = generateRawKey();
    const [row] = await db
      .insert(galaxyPortalKeys)
      .values({
        label: label.trim(),
        keyHash: hashKey(rawKey),
        allowedDomains: Array.isArray(allowedDomains) ? allowedDomains.map((d) => d.toLowerCase().trim()).filter(Boolean) : [],
        allowedOrigins: Array.isArray(allowedOrigins) ? allowedOrigins.map((o) => o.trim()).filter(Boolean) : [],
        createdBy: (req.user as { id: string } | undefined)?.id ?? null,
      })
      .returning({
        id: galaxyPortalKeys.id,
        label: galaxyPortalKeys.label,
        allowedDomains: galaxyPortalKeys.allowedDomains,
        allowedOrigins: galaxyPortalKeys.allowedOrigins,
        isActive: galaxyPortalKeys.isActive,
        createdAt: galaxyPortalKeys.createdAt,
      });

    res.status(201).json({
      key: row,
      rawKey,
      warning: 'Copy the rawKey now — it cannot be retrieved again.',
    });
  });

  app.patch('/api/admin/galaxy/portal-keys/:id', ensureGlobalAdmin, async (req: Request, res: Response) => {
    const { label, allowedDomains, allowedOrigins, isActive } = req.body as {
      label?: string;
      allowedDomains?: string[];
      allowedOrigins?: string[];
      isActive?: boolean;
    };
    const patch: Record<string, unknown> = {};
    if (label !== undefined) patch.label = label.trim();
    if (Array.isArray(allowedDomains)) patch.allowedDomains = allowedDomains.map((d) => d.toLowerCase().trim()).filter(Boolean);
    if (Array.isArray(allowedOrigins)) patch.allowedOrigins = allowedOrigins.map((o) => o.trim()).filter(Boolean);
    if (isActive !== undefined) patch.isActive = Boolean(isActive);

    const [updated] = await db
      .update(galaxyPortalKeys)
      .set(patch)
      .where(eq(galaxyPortalKeys.id, req.params.id))
      .returning();
    if (!updated) return res.status(404).json({ error: 'not_found' });

    res.json({
      key: {
        id: updated.id,
        label: updated.label,
        allowedDomains: updated.allowedDomains,
        allowedOrigins: updated.allowedOrigins,
        isActive: updated.isActive,
        createdAt: updated.createdAt,
        lastUsedAt: updated.lastUsedAt,
      },
    });
  });

  app.delete('/api/admin/galaxy/portal-keys/:id', ensureGlobalAdmin, async (req: Request, res: Response) => {
    const [deleted] = await db
      .delete(galaxyPortalKeys)
      .where(eq(galaxyPortalKeys.id, req.params.id))
      .returning({ id: galaxyPortalKeys.id });
    if (!deleted) return res.status(404).json({ error: 'not_found' });
    res.json({ ok: true });
  });
}
