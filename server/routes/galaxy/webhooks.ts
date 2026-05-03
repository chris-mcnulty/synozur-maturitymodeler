import { createHmac, randomBytes } from 'crypto';
import { lookup } from 'dns/promises';
import type { LookupAddress } from 'dns';
import { isIP } from 'net';
import { request as httpsRequest } from 'https';
import { request as httpRequest } from 'http';
import { eq } from 'drizzle-orm';
import { db } from '../../db';
import {
  galaxyWebhooks,
  galaxyWebhookDeliveries,
  type GalaxyEventType,
} from '@shared/schema';

export function generateWebhookSecret(): string {
  return 'gx_' + randomBytes(32).toString('hex');
}

export function signPayload(secret: string, timestamp: number, body: string): string {
  const mac = createHmac('sha256', secret);
  mac.update(`${timestamp}.${body}`);
  return 'sha256=' + mac.digest('hex');
}

const ALLOW_PRIVATE = process.env.GALAXY_WEBHOOK_ALLOW_PRIVATE === 'true';

function isPrivateIPv4(ip: string): boolean {
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some((p) => Number.isNaN(p))) return true;
  const [a, b] = parts;
  if (a === 10) return true;
  if (a === 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 0) return true;
  if (a >= 224) return true;
  return false;
}

function isPrivateIPv6(ip: string): boolean {
  const lower = ip.toLowerCase();
  if (lower === '::1' || lower === '::') return true;
  if (lower.startsWith('fc') || lower.startsWith('fd')) return true;
  if (lower.startsWith('fe80')) return true;
  if (lower.startsWith('::ffff:')) {
    return isPrivateIPv4(lower.slice(7));
  }
  return false;
}

function addressIsPrivate(addr: string): boolean {
  const v = isIP(addr);
  if (v === 4) return isPrivateIPv4(addr);
  if (v === 6) return isPrivateIPv6(addr);
  return true;
}

export async function validateWebhookUrl(url: string): Promise<{ ok: true; address: string; family: 4 | 6 } | { ok: false; reason: string }> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { ok: false, reason: 'invalid_url' };
  }
  if (parsed.protocol !== 'https:') {
    if (!(ALLOW_PRIVATE && parsed.protocol === 'http:')) {
      return { ok: false, reason: 'https_required' };
    }
  }
  const host = parsed.hostname;
  let addresses: LookupAddress[];
  if (isIP(host)) {
    addresses = [{ address: host, family: isIP(host) === 4 ? 4 : 6 }];
  } else {
    try {
      addresses = await lookup(host, { all: true });
    } catch {
      return { ok: false, reason: 'dns_failure' };
    }
  }
  if (!ALLOW_PRIVATE) {
    for (const a of addresses) {
      if (addressIsPrivate(a.address)) return { ok: false, reason: 'private_address' };
    }
  }
  const first = addresses[0];
  if (!first) return { ok: false, reason: 'no_address' };
  return { ok: true, address: first.address, family: first.family === 6 ? 6 : 4 };
}

interface DeliveryResult {
  status: number;
  body: string;
  headers: Record<string, string | string[] | undefined>;
}

// SSRF-safe fetch: resolves DNS once, validates the address, then connects
// to that exact address while sending the original Host header. This closes
// the DNS-rebinding TOCTOU window between validation and connect.
async function safeDeliver(
  url: string,
  address: string,
  family: 4 | 6,
  body: string,
  headers: Record<string, string>,
): Promise<DeliveryResult> {
  const parsed = new URL(url);
  const isHttps = parsed.protocol === 'https:';
  const reqFn = isHttps ? httpsRequest : httpRequest;
  const port = parsed.port ? Number(parsed.port) : isHttps ? 443 : 80;

  return await new Promise<DeliveryResult>((resolve, reject) => {
    const req = reqFn(
      {
        host: address,
        port,
        family,
        method: 'POST',
        path: `${parsed.pathname || '/'}${parsed.search || ''}`,
        headers: {
          ...headers,
          host: parsed.host,
          'content-length': Buffer.byteLength(body).toString(),
        },
        timeout: 10_000,
        // Force SNI/cert validation against the original hostname, not the IP.
        servername: isHttps ? parsed.hostname : undefined,
        // Block any redirect-driven re-resolution by not following redirects.
        // (http(s).request never follows redirects; this is a no-op affirmation.)
        lookup: () => {
          // Should never be invoked because we provided host as an IP literal.
          throw new Error('unexpected_lookup');
        },
      },
      (resp) => {
        const chunks: Buffer[] = [];
        resp.on('data', (c: Buffer) => chunks.push(c));
        resp.on('end', () => {
          resolve({
            status: resp.statusCode ?? 0,
            body: Buffer.concat(chunks).toString('utf8').slice(0, 2000),
            headers: resp.headers,
          });
        });
      },
    );
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.on('error', (e) => reject(e));
    req.end(body);
  });
}

export async function emitGalaxyEvent(
  tenantId: string,
  eventType: GalaxyEventType,
  data: Record<string, unknown>,
): Promise<void> {
  const [hook] = await db
    .select()
    .from(galaxyWebhooks)
    .where(eq(galaxyWebhooks.tenantId, tenantId))
    .limit(1);

  if (!hook || !hook.active) return;
  if (hook.events && hook.events.length > 0 && !hook.events.includes(eventType)) return;

  const eventId = randomBytes(16).toString('hex');
  const timestamp = Math.floor(Date.now() / 1000);
  const payload = {
    id: eventId,
    type: eventType,
    tenantId,
    occurredAt: new Date().toISOString(),
    data,
  };
  const body = JSON.stringify(payload);
  const signature = signPayload(hook.signingSecret, timestamp, body);

  const [delivery] = await db
    .insert(galaxyWebhookDeliveries)
    .values({
      tenantId,
      webhookId: hook.id,
      eventType,
      payload,
      status: 'pending',
      attemptCount: 1,
    })
    .returning();

  const guard = await validateWebhookUrl(hook.url);
  if (!guard.ok) {
    await db
      .update(galaxyWebhookDeliveries)
      .set({ status: 'failed', lastError: `ssrf_block:${guard.reason}` })
      .where(eq(galaxyWebhookDeliveries.id, delivery.id));
    return;
  }

  await attemptDelivery(delivery.id, hook.url, guard.address, guard.family, body, {
    'content-type': 'application/json',
    'x-galaxy-event': eventType,
    'x-galaxy-event-id': eventId,
    'x-galaxy-timestamp': String(timestamp),
    'x-galaxy-signature': signature,
  }, 1);
}

const MAX_ATTEMPTS = 5;
const BACKOFF_MS = [0, 2_000, 10_000, 60_000, 300_000];

async function attemptDelivery(
  deliveryId: string,
  url: string,
  address: string,
  family: 4 | 6,
  body: string,
  headers: Record<string, string>,
  attempt: number,
): Promise<void> {
  try {
    const resp = await safeDeliver(url, address, family, body, headers);
    const ok = resp.status >= 200 && resp.status < 300;
    await db
      .update(galaxyWebhookDeliveries)
      .set({
        status: ok ? 'delivered' : attempt >= MAX_ATTEMPTS ? 'failed' : 'pending',
        responseStatus: resp.status,
        responseBody: resp.body,
        attemptCount: attempt,
        deliveredAt: ok ? new Date() : null,
      })
      .where(eq(galaxyWebhookDeliveries.id, deliveryId));
    if (!ok && attempt < MAX_ATTEMPTS) {
      scheduleRetry(deliveryId, url, address, family, body, headers, attempt + 1);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await db
      .update(galaxyWebhookDeliveries)
      .set({
        status: attempt >= MAX_ATTEMPTS ? 'failed' : 'pending',
        lastError: message.slice(0, 500),
        attemptCount: attempt,
      })
      .where(eq(galaxyWebhookDeliveries.id, deliveryId));
    if (attempt < MAX_ATTEMPTS) {
      scheduleRetry(deliveryId, url, address, family, body, headers, attempt + 1);
    }
  }
}

function scheduleRetry(
  deliveryId: string,
  url: string,
  address: string,
  family: 4 | 6,
  body: string,
  headers: Record<string, string>,
  nextAttempt: number,
): void {
  const delay = BACKOFF_MS[Math.min(nextAttempt - 1, BACKOFF_MS.length - 1)];
  setTimeout(() => {
    void attemptDelivery(deliveryId, url, address, family, body, headers, nextAttempt);
  }, delay).unref();
}

export async function redeliverGalaxyEvent(deliveryId: string, tenantId: string): Promise<boolean> {
  const [original] = await db
    .select()
    .from(galaxyWebhookDeliveries)
    .where(eq(galaxyWebhookDeliveries.id, deliveryId))
    .limit(1);
  if (!original || original.tenantId !== tenantId) return false;
  const payload = original.payload as { type: GalaxyEventType; data: Record<string, unknown> };
  await emitGalaxyEvent(tenantId, payload.type, payload.data ?? {});
  return true;
}
