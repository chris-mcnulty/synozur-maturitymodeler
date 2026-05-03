import type { Request, Response, NextFunction } from 'express';
import { createHash, randomUUID } from 'crypto';
import { and, eq, gte, isNull, sql } from 'drizzle-orm';
import { db } from '../../db';
import {
  oauthTokens,
  oauthClients,
  users,
  galaxyExposurePolicies,
  galaxyAuditLog,
  type GalaxyScope,
} from '@shared/schema';
import { storage } from '../../storage';

export interface GalaxyAuthContext {
  userId: string;
  user: typeof users.$inferSelect;
  tenantId: string | null;
  clientId: string;
  scopes: string[];
  policy: typeof galaxyExposurePolicies.$inferSelect | null;
  requestId: string;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      galaxy?: GalaxyAuthContext;
    }
  }
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function jsonError(res: Response, status: number, error: string, description: string) {
  return res.status(status).json({ error, error_description: description });
}

const RATE_BUCKETS: Map<string, { count: number; resetAt: number }> = new Map();
function checkRateLimit(key: string, limit: number): { allowed: boolean; remaining: number; resetAt: number } {
  const now = Date.now();
  const bucket = RATE_BUCKETS.get(key);
  if (!bucket || bucket.resetAt < now) {
    const fresh = { count: 1, resetAt: now + 60_000 };
    RATE_BUCKETS.set(key, fresh);
    return { allowed: true, remaining: Math.max(0, limit - 1), resetAt: fresh.resetAt };
  }
  bucket.count += 1;
  return {
    allowed: bucket.count <= limit,
    remaining: Math.max(0, limit - bucket.count),
    resetAt: bucket.resetAt,
  };
}

function galaxyClientAllowlist(): string[] {
  const v = process.env.GALAXY_OAUTH_CLIENT_IDS;
  if (!v) return [];
  return v.split(',').map((s) => s.trim()).filter(Boolean);
}

function applyCorsHeaders(res: Response, origin: string) {
  res.setHeader('access-control-allow-origin', origin);
  res.setHeader('vary', 'Origin');
  res.setHeader('access-control-allow-credentials', 'true');
  res.setHeader('access-control-allow-headers', 'authorization, content-type, x-request-id');
  res.setHeader('access-control-allow-methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('access-control-max-age', '600');
}

// Preflight handler. Looks up *any* tenant exposure policy whose
// allowedOrigins contains the requested Origin and reflects the header
// when found. Runs without an authenticated context because preflight
// requests do not carry a bearer token.
export async function galaxyCors(req: Request, res: Response) {
  const origin = req.headers.origin as string | undefined;
  if (!origin) return res.status(204).end();
  try {
    const [match] = await db
      .select({ id: galaxyExposurePolicies.id })
      .from(galaxyExposurePolicies)
      .where(and(eq(galaxyExposurePolicies.enabled, true), sql`${origin} = ANY(${galaxyExposurePolicies.allowedOrigins})`))
      .limit(1);
    if (match) applyCorsHeaders(res, origin);
  } catch {}
  return res.status(204).end();
}

export async function galaxyAuth(req: Request, res: Response, next: NextFunction) {
  const requestId = (req.headers['x-request-id'] as string) || randomUUID();
  res.setHeader('x-request-id', requestId);

  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return jsonError(res, 401, 'invalid_request', 'Missing bearer token');
    }
    const accessToken = authHeader.slice(7);

    // Resolve the token AND the public OAuth client_id in one query.
    const tokenRow = await db
      .select({
        token: oauthTokens,
        publicClientId: oauthClients.clientId,
      })
      .from(oauthTokens)
      .innerJoin(oauthClients, eq(oauthClients.id, oauthTokens.clientId))
      .where(and(
        eq(oauthTokens.accessTokenHash, hashToken(accessToken)),
        gte(oauthTokens.expiresAt, new Date()),
        isNull(oauthTokens.revokedAt),
      ))
      .limit(1);
    const tokenRecord = tokenRow[0]?.token;
    const publicClientId = tokenRow[0]?.publicClientId;
    if (!tokenRecord || !publicClientId) {
      return jsonError(res, 401, 'invalid_token', 'Invalid or expired access token');
    }

    // Galaxy client binding is mandatory: the deployment MUST list one or more
    // OAuth client_ids in GALAXY_OAUTH_CLIENT_IDS; otherwise the API is closed.
    const allowlist = galaxyClientAllowlist();
    if (allowlist.length === 0) {
      return jsonError(
        res,
        503,
        'galaxy_not_configured',
        'GALAXY_OAUTH_CLIENT_IDS is not configured on this deployment',
      );
    }
    if (!allowlist.includes(publicClientId)) {
      return jsonError(res, 403, 'unauthorized_client', 'OAuth client is not allowed to call the Galaxy API');
    }

    const user = await db.query.users.findFirst({ where: eq(users.id, tokenRecord.userId) });
    if (!user) return jsonError(res, 401, 'invalid_token', 'Token user not found');

    const scopes = (tokenRecord.scopes as string[] | null) ?? [];
    if (!scopes.includes('galaxy_portal')) {
      return jsonError(res, 403, 'insufficient_scope', 'Token missing galaxy_portal scope');
    }

    const tenantId = user.tenantId ?? null;
    let policy: typeof galaxyExposurePolicies.$inferSelect | null = null;
    if (tenantId) {
      const [p] = await db
        .select()
        .from(galaxyExposurePolicies)
        .where(eq(galaxyExposurePolicies.tenantId, tenantId))
        .limit(1);
      policy = p ?? null;
    }

    if (!policy || !policy.enabled) {
      return jsonError(res, 403, 'tenant_disabled', 'Galaxy is not enabled for this tenant');
    }

    if (policy.audienceMode === 'roles') {
      const roles = policy.audienceRoles ?? [];
      if (roles.length === 0 || !roles.includes(user.role ?? 'user')) {
        return jsonError(res, 403, 'audience_excluded', 'User not in Galaxy audience for this tenant');
      }
    }

    const origin = req.headers.origin as string | undefined;
    if (origin && policy.allowedOrigins && policy.allowedOrigins.length > 0) {
      if (!policy.allowedOrigins.includes(origin)) {
        return jsonError(res, 403, 'origin_not_allowed', 'Request origin not in tenant allowlist');
      }
      applyCorsHeaders(res, origin);
    }

    const limit = policy.rateLimitPerMinute && policy.rateLimitPerMinute > 0 ? policy.rateLimitPerMinute : 120;
    const rl = checkRateLimit(`${tenantId}:${user.id}`, limit);
    res.setHeader('x-ratelimit-limit', String(limit));
    res.setHeader('x-ratelimit-remaining', String(rl.remaining));
    res.setHeader('x-ratelimit-reset', String(Math.ceil(rl.resetAt / 1000)));
    if (!rl.allowed) {
      return jsonError(res, 429, 'rate_limited', 'Too many requests');
    }

    req.galaxy = {
      userId: user.id,
      user,
      tenantId,
      clientId: publicClientId,
      scopes,
      policy,
      requestId,
    };

    res.on('finish', () => {
      try {
        // eslint-disable-next-line no-console
        console.log(JSON.stringify({
          ts: new Date().toISOString(),
          channel: 'galaxy',
          requestId,
          tenantId,
          userId: user.id,
          clientId: publicClientId,
          method: req.method,
          path: req.originalUrl,
          status: res.statusCode,
        }));
      } catch {}
    });

    next();
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[galaxy] auth error', err);
    return jsonError(res, 500, 'server_error', 'Internal error');
  }
}

export function requireScope(...needed: GalaxyScope[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    const have = req.galaxy?.scopes ?? [];
    const missing = needed.filter((s) => !have.includes(s));
    if (missing.length > 0) {
      return jsonError(
        res,
        403,
        'insufficient_scope',
        `Token missing required scope(s): ${missing.join(', ')}`,
      );
    }
    next();
  };
}

export async function writeAudit(
  req: Request,
  res: Response,
  resourceType: string | null,
  resourceId: string | null,
) {
  try {
    if (!req.galaxy) return;
    await db.insert(galaxyAuditLog).values({
      tenantId: req.galaxy.tenantId!,
      userId: req.galaxy.userId,
      clientId: req.galaxy.clientId,
      requestId: req.galaxy.requestId,
      method: req.method,
      path: req.originalUrl,
      scopes: req.galaxy.scopes,
      resourceType,
      resourceId,
      status: res.statusCode,
      ipAddress: (req.ip || (req.headers['x-forwarded-for'] as string) || '').toString().slice(0, 64) || null,
      userAgent: (req.headers['user-agent'] || '').toString().slice(0, 512) || null,
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[galaxy] audit write failed', err);
  }
}

export function envelope<T>(req: Request, data: T, pagination?: { nextCursor: string | null; limit: number }) {
  const ctx = req.galaxy;
  return {
    data,
    pagination: pagination ?? { nextCursor: null, limit: Array.isArray(data) ? data.length : 1 },
    meta: {
      requestId: ctx?.requestId ?? null,
      tenantId: ctx?.tenantId ?? null,
      userId: ctx?.userId ?? null,
    },
  };
}

export { storage };
