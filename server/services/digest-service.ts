import { db } from '../db';
import * as schema from '@shared/schema';
import { eq, and, inArray, isNotNull, isNull, or, sql } from 'drizzle-orm';
import type sgMail from '@sendgrid/mail';
import { aiService } from './ai-service';
import {
  buildInsightsFromRows,
  type CompletedRow,
  type ModelInsight,
} from '../routes/admin-routes';
import { getBaseUrl } from '../config/environment';

type SendGridClient = typeof sgMail;

type DigestLastRunValue = { monthKey: string; status?: 'in_progress' | 'complete'; summary?: DigestRunSummary };

export const DIGEST_LAST_RUN_KEY = 'digest:lastRunMonth';

function escapeHtml(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Convert a plain markdown string to simple HTML safe for email clients.
 * Handles: **bold**, *italic*, # headings (h3), bullet lists, and paragraph breaks.
 * Everything is HTML-escaped first so injected content is safe.
 */
function markdownToEmailHtml(md: string): string {
  const escaped = escapeHtml(md);
  return escaped
    // Headings: # Heading → <h3>
    .replace(/^###? (.+)$/gm, '<h3 style="font-size:14px;font-weight:600;margin:12px 0 4px;">$1</h3>')
    .replace(/^## (.+)$/gm, '<h3 style="font-size:15px;font-weight:600;margin:12px 0 4px;">$1</h3>')
    .replace(/^# (.+)$/gm, '<h3 style="font-size:16px;font-weight:600;margin:12px 0 4px;">$1</h3>')
    // Bold+italic: ***text*** or **_text_**
    .replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>')
    // Bold: **text**
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    // Italic: *text* or _text_
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/_(.+?)_/g, '<em>$1</em>')
    // Bullet lists: lines starting with - or *
    .replace(/^[-*] (.+)$/gm, '<li style="margin:2px 0;">$1</li>')
    .replace(/(<li[^>]*>.*<\/li>\n?)+/g, '<ul style="padding-left:18px;margin:6px 0;">$&</ul>')
    // Paragraph breaks: double newline → paragraph
    .replace(/\n\n+/g, '</p><p style="margin:8px 0;">')
    // Single newlines
    .replace(/\n/g, '<br />')
    // Wrap in a paragraph
    .replace(/^/, '<p style="margin:8px 0;">')
    .replace(/$/, '</p>');
}

function currentMonthKey(date = new Date()): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

function previousMonthKey(d: Date): string {
  const prev = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 1, 1));
  return currentMonthKey(prev);
}

type EligibleUser = {
  id: string;
  email: string;
  name: string | null;
  username: string;
  tenantId: string | null;
  industry: string | null;
  companySize: string | null;
  jobTitle: string | null;
};

async function loadEligibleUsers(): Promise<EligibleUser[]> {
  // Join tenants so we can honour the tenant-level master switch.
  // Users whose tenant has monthlyDigestEnabled=false are excluded entirely,
  // even if the user themselves has monthlyDigestOptOut=false.
  const rows = await db
    .select({
      id: schema.users.id,
      email: schema.users.email,
      name: schema.users.name,
      username: schema.users.username,
      tenantId: schema.users.tenantId,
      industry: schema.users.industry,
      companySize: schema.users.companySize,
      jobTitle: schema.users.jobTitle,
    })
    .from(schema.users)
    .leftJoin(schema.tenants, eq(schema.users.tenantId, schema.tenants.id))
    .where(
      and(
        eq(schema.users.monthlyDigestOptOut, false),
        eq(schema.users.emailVerified, true),
        isNotNull(schema.users.email),
        // Tenant master switch: skip all users whose tenant disabled the digest.
        // Users with no tenant (tenantId IS NULL) are always eligible.
        or(
          isNull(schema.users.tenantId),
          eq(schema.tenants.monthlyDigestEnabled, true),
        ),
      ),
    );
  return rows.filter(r => !!r.email) as EligibleUser[];
}

async function loadCompletedRowsForUser(userId: string): Promise<CompletedRow[]> {
  const rows = await db
    .select({
      assessmentId: schema.assessments.id,
      userId: schema.assessments.userId,
      modelId: schema.assessments.modelId,
      modelName: schema.models.name,
      modelClass: schema.models.modelClass,
      maturityScale: schema.models.maturityScale,
      completedAt: schema.assessments.completedAt,
      overallScore: schema.results.overallScore,
      label: schema.results.label,
      dimensionScores: schema.results.dimensionScores,
    })
    .from(schema.assessments)
    .innerJoin(schema.models, eq(schema.assessments.modelId, schema.models.id))
    .innerJoin(schema.results, eq(schema.results.assessmentId, schema.assessments.id))
    .where(and(
      eq(schema.assessments.userId, userId),
      eq(schema.assessments.status, 'completed'),
    ));
  return rows as CompletedRow[];
}

type ModelInsightWithPriorDelta = ModelInsight & {
  priorDelta: number;
  priorDirection: 'up' | 'down' | 'flat' | 'single';
};

/**
 * Compute the trend delta vs. the *immediately previous* completed
 * assessment for each model. The shared `buildInsightsFromRows` helper
 * computes delta vs. the first ever assessment (used by /api/insights),
 * but the digest needs the most recent change for "biggest mover"
 * messaging.
 */
function withPriorDeltas(models: ModelInsight[]): ModelInsightWithPriorDelta[] {
  return models.map(m => {
    const trend = m.trend;
    if (trend.length < 2) {
      return { ...m, priorDelta: 0, priorDirection: 'single' as const };
    }
    const latest = trend[trend.length - 1];
    const prior = trend[trend.length - 2];
    const rawDelta = latest.scorePercent - prior.scorePercent;
    const priorDelta = Math.round(rawDelta * 10) / 10;
    let priorDirection: 'up' | 'down' | 'flat' | 'single';
    if (priorDelta > 1) priorDirection = 'up';
    else if (priorDelta < -1) priorDirection = 'down';
    else priorDirection = 'flat';
    return { ...m, priorDelta, priorDirection };
  });
}

function buildEmailHtml(opts: {
  recipientName: string;
  insights: { models: ModelInsightWithPriorDelta[]; crossModelDimensions: ReturnType<typeof buildInsightsFromRows>['crossModelDimensions'] };
  narrative: string;
  baseUrl: string;
  unsubscribeUrl: string;
}): { html: string; text: string; subject: string } {
  const { recipientName, insights, narrative, baseUrl, unsubscribeUrl } = opts;
  const { models, crossModelDimensions } = insights;

  const trendArrow = (dir: 'up' | 'down' | 'flat' | 'single', delta: number): string => {
    if (dir === 'up') return `▲ +${delta} pts vs prior`;
    if (dir === 'down') return `▼ ${delta} pts vs prior`;
    if (dir === 'flat') return `▬ flat vs prior`;
    return `• first read`;
  };

  const sortedDims = [...crossModelDimensions].sort((a, b) => b.averagePercent - a.averagePercent);
  const topStrength = sortedDims[0];
  const topGap = sortedDims[sortedDims.length - 1];

  const modelRowsHtml = models
    .map(m => `
      <tr>
        <td style="padding: 10px 8px; border-bottom: 1px solid #eee;">${escapeHtml(m.modelName)}</td>
        <td style="padding: 10px 8px; border-bottom: 1px solid #eee; text-align: right; font-weight: 600;">${Math.round(m.latestScorePercent)}%</td>
        <td style="padding: 10px 8px; border-bottom: 1px solid #eee; color: #666;">${escapeHtml(m.latestLabel || '—')}</td>
        <td style="padding: 10px 8px; border-bottom: 1px solid #eee; color: #666; text-align: right;">${trendArrow(m.priorDirection, m.priorDelta)}</td>
      </tr>`)
    .join('');

  const subject = `Your Orion Insights for ${new Date().toLocaleString('en-US', { month: 'long', year: 'numeric' })}`;

  const text = `Hi ${recipientName},

Here is your monthly Orion Insights digest.

Latest scores:
${models.map(m => `- ${m.modelName}: ${Math.round(m.latestScorePercent)}% (${m.latestLabel || '—'}) — ${trendArrow(m.priorDirection, m.priorDelta)}`).join('\n')}

${topStrength ? `Top strength: ${topStrength.label} (${Math.round(topStrength.averagePercent)}%)` : ''}
${topGap && topGap !== topStrength ? `Biggest gap: ${topGap.label} (${Math.round(topGap.averagePercent)}%)` : ''}

View the full picture: ${baseUrl}/insights

To stop receiving these emails: ${unsubscribeUrl}

— The Synozur Team`;

  const html = `
  <!DOCTYPE html>
  <html><head><meta charset="utf-8" /><style>
    body { font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; line-height: 1.6; color: #222; margin: 0; padding: 0; background: #f5f5f7; }
    .container { max-width: 640px; margin: 0 auto; background: #ffffff; }
    .content { padding: 32px 28px; }
    h1 { color: #810FFB; font-size: 22px; margin: 0 0 8px; }
    h2 { font-size: 16px; margin: 28px 0 10px; color: #111; }
    table { width: 100%; border-collapse: collapse; margin-top: 8px; font-size: 14px; }
    .button { display: inline-block; background: #810FFB; color: #ffffff !important; padding: 12px 22px; text-decoration: none; border-radius: 6px; font-weight: 600; }
    .footer { padding: 24px 28px; background: #f9f9f9; color: #666; font-size: 12px; text-align: center; }
    .narrative { background: #faf7ff; border-left: 3px solid #810FFB; padding: 14px 16px; border-radius: 4px; margin-top: 8px; font-size: 14px; line-height: 1.6; }
    .pillrow { display: flex; gap: 10px; flex-wrap: wrap; }
    .pill { padding: 8px 12px; border-radius: 4px; font-size: 13px; }
    .pill-strength { background: #ecfdf5; color: #065f46; }
    .pill-gap { background: #fef2f2; color: #991b1b; }
  </style></head>
  <body>
    <div class="container">
      <div class="content">
        <h1>Your monthly Insights digest</h1>
        <p>Hi ${escapeHtml(recipientName)}, here is a quick refresh of where your maturity portfolio stands this month.</p>

        <h2>Latest scores</h2>
        <table>
          <thead>
            <tr style="text-align: left; color: #666; font-size: 12px; text-transform: uppercase;">
              <th style="padding: 8px;">Model</th>
              <th style="padding: 8px; text-align: right;">Score</th>
              <th style="padding: 8px;">Level</th>
              <th style="padding: 8px; text-align: right;">Trend</th>
            </tr>
          </thead>
          <tbody>${modelRowsHtml}</tbody>
        </table>

        ${topStrength || topGap ? `<h2>Strengths &amp; gaps</h2><div class="pillrow">
          ${topStrength ? `<div class="pill pill-strength"><strong>Top strength:</strong> ${escapeHtml(topStrength.label)} — ${Math.round(topStrength.averagePercent)}%</div>` : ''}
          ${topGap && topGap !== topStrength ? `<div class="pill pill-gap"><strong>Biggest gap:</strong> ${escapeHtml(topGap.label)} — ${Math.round(topGap.averagePercent)}%</div>` : ''}
        </div>` : ''}

        <h2>What it means</h2>
        <div class="narrative">${markdownToEmailHtml(narrative)}</div>

        <p style="margin-top: 28px; text-align: center;">
          <a href="${baseUrl}/insights" class="button">Open full Insights</a>
        </p>
      </div>
      <div class="footer">
        <p>You are receiving this because you have at least one completed assessment in Orion by Synozur.</p>
        <p><a href="${unsubscribeUrl}" style="color: #666;">Unsubscribe from monthly digests</a></p>
        <p>© ${new Date().getFullYear()} The Synozur Alliance LLC</p>
      </div>
    </div>
  </body></html>`;

  return { html, text, subject };
}

export type DigestRunSummary = {
  startedAt: string;
  finishedAt: string;
  monthKey: string;
  candidates: number;
  sent: number;
  skippedNoAssessments: number;
  failed: number;
  errors: string[];
};

/**
 * Run the monthly digest. Sends one email per eligible user who has at
 * least one completed assessment. Idempotent within a calendar month —
 * users with `lastMonthlyDigestSentAt` in the current month are skipped.
 *
 * ## Multi-instance duplicate-prevention strategy
 *
 * We use TWO independent layers so that no single failure mode causes
 * duplicate emails:
 *
 * 1. **Session-level advisory lock (fast path)**
 *    `pg_try_advisory_lock` is a non-blocking, session-scoped Postgres
 *    advisory lock.  It is a cheap short-circuit: when two instances race
 *    at startup only one acquires the lock and the other exits immediately
 *    without touching the settings table.
 *    Caveat: session-level locks are silently released if the DB connection
 *    drops (e.g. network blip or pod restart mid-run).  That is why we do
 *    NOT rely on this lock alone.
 *
 * 2. **Atomic compare-and-swap upsert (durable guard)**
 *    Before starting work, every instance performs a conditional upsert:
 *
 *      INSERT INTO settings (key, value)
 *      VALUES (DIGEST_LAST_RUN_KEY, {monthKey, status:'in_progress'})
 *      ON CONFLICT (key) DO UPDATE
 *        SET value = EXCLUDED.value
 *        WHERE (settings.value->>'monthKey') IS DISTINCT FROM $monthKey
 *           OR (settings.value->>'status')   IS DISTINCT FROM 'in_progress'
 *      RETURNING key
 *
 *    Postgres evaluates the WHERE inside a single atomic write.  If the
 *    row is already 'in_progress' for the current month (set by a peer
 *    instance milliseconds earlier) the UPDATE clause does NOT fire and
 *    RETURNING returns 0 rows.  The instance that gets 0 rows back knows
 *    it lost the race and exits without sending any emails.
 *
 *    This survives connection drops, pod restarts, and any number of
 *    simultaneous instances because the atomicity is guaranteed by
 *    Postgres row-level locking inside the single SQL statement.
 */

export async function runMonthlyDigest(opts: { force?: boolean } = {}): Promise<DigestRunSummary> {
  const startedAt = new Date();
  const monthKey = currentMonthKey(startedAt);
  const summary: DigestRunSummary = {
    startedAt: startedAt.toISOString(),
    finishedAt: '',
    monthKey,
    candidates: 0,
    sent: 0,
    skippedNoAssessments: 0,
    failed: 0,
    errors: [],
  };

  // Fast-path: session-level advisory lock. If another instance currently
  // holds the lock we bail immediately without touching the settings table.
  // Two arbitrary 32-bit ints used as a stable lock identity for this job.
  const LOCK_KEY_1 = 219734871;
  const LOCK_KEY_2 = 1836018548;
  const lockResult = await db.execute(
    sql`SELECT pg_try_advisory_lock(${LOCK_KEY_1}::int, ${LOCK_KEY_2}::int) AS locked`,
  );
  const lockRow = (lockResult as unknown as { rows: Array<{ locked: boolean }> }).rows?.[0];
  const gotLock = Boolean(lockRow?.locked);
  if (!gotLock) {
    summary.errors.push('Another digest run is in progress (advisory lock held)');
    summary.finishedAt = new Date().toISOString();
    return summary;
  }

  try {
    return await runMonthlyDigestInner(summary, monthKey, opts);
  } finally {
    // Release the session lock so it does not linger until connection close.
    await db
      .execute(sql`SELECT pg_advisory_unlock(${LOCK_KEY_1}::int, ${LOCK_KEY_2}::int)`)
      .catch(() => {});
  }
}

async function runMonthlyDigestInner(
  summary: DigestRunSummary,
  monthKey: string,
  opts: { force?: boolean },
): Promise<DigestRunSummary> {
  // Re-check the persisted month inside the lock so we never double-send if
  // a peer instance just finished while we were waiting to acquire it.
  // Both 'in_progress' and 'complete' statuses count as already handled for
  // this month — this prevents a restart mid-run from triggering a new run.
  if (!opts.force) {
    const [setting] = await db
      .select()
      .from(schema.settings)
      .where(eq(schema.settings.key, DIGEST_LAST_RUN_KEY))
      .limit(1);
    const last = setting?.value as DigestLastRunValue | undefined;
    if (last?.monthKey === monthKey) {
      summary.errors.push(`Already ran for ${monthKey} (status: ${last?.status ?? 'unknown'})`);
      summary.finishedAt = new Date().toISOString();
      return summary;
    }
  }

  // Durable guard: atomic compare-and-swap upsert.
  //
  // This is the second and decisive layer of multi-instance protection (the
  // advisory lock above is the fast-path first layer, but it is session-scoped
  // and can be silently released on connection drop).
  //
  // We INSERT the 'in_progress' marker with a conditional ON CONFLICT clause:
  // the UPDATE only fires when the stored row is NOT already 'in_progress' for
  // the current month.  Because Postgres evaluates the WHERE inside a single
  // atomic write (using a row-level lock on the conflict target), exactly one
  // racing instance will see a RETURNING row; all others get 0 rows back and
  // must bail out.  This is safe across any number of simultaneous pods even
  // after advisory lock loss.
  //
  // force=true bypasses this guard (admin-initiated re-runs) so that an
  // operator can manually retrigger a digest that stalled mid-run.
  if (!opts.force) {
    const inProgressValue: DigestLastRunValue = { monthKey, status: 'in_progress' };
    const cas = await db.execute(sql`
      INSERT INTO settings (key, value, updated_at)
      VALUES (
        ${DIGEST_LAST_RUN_KEY},
        ${JSON.stringify(inProgressValue)}::jsonb,
        NOW()
      )
      ON CONFLICT (key) DO UPDATE
        SET value      = EXCLUDED.value,
            updated_at = NOW()
        WHERE (settings.value->>'monthKey') IS DISTINCT FROM ${monthKey}
           OR (settings.value->>'status')   IS DISTINCT FROM ${'in_progress'}
      RETURNING key
    `);
    const wonRace = ((cas as unknown as { rows: unknown[] }).rows?.length ?? 0) > 0;
    if (!wonRace) {
      summary.errors.push(`Another instance already claimed the in_progress lock for ${monthKey} — skipping`);
      summary.finishedAt = new Date().toISOString();
      return summary;
    }
    console.log('[Digest] Starting run — acquired in_progress marker', { monthKey, pid: process.pid });
  } else {
    // force=true: write in_progress unconditionally so the status is visible.
    const inProgressValue: DigestLastRunValue = { monthKey, status: 'in_progress' };
    await db
      .insert(schema.settings)
      .values({ key: DIGEST_LAST_RUN_KEY, value: inProgressValue })
      .onConflictDoUpdate({
        target: schema.settings.key,
        set: { value: inProgressValue, updatedAt: new Date() },
      });
    console.log('[Digest] Starting forced run', { monthKey, pid: process.pid });
  }

  const baseUrl = getBaseUrl();

  let sgClient: SendGridClient;
  let fromEmail: string;
  try {
    const { getUncachableSendGridClient } = await import('../sendgrid');
    const c = await getUncachableSendGridClient();
    sgClient = c.client;
    fromEmail = c.fromEmail;
  } catch (err) {
    summary.errors.push(`SendGrid unavailable: ${(err as Error).message}`);
    summary.finishedAt = new Date().toISOString();
    return summary;
  }
  const { buildEmailFrom } = await import('../sendgrid');

  const users = await loadEligibleUsers();
  summary.candidates = users.length;

  for (const user of users) {
    try {
      // Always check per-user idempotency — force=true only bypasses the
      // global month check above, never the per-user stamp. This prevents
      // a mis-clicked admin force from re-blasting users already emailed
      // this month. To re-send to a specific user, clear their
      // lastMonthlyDigestSentAt timestamp directly in the database.
      const [u] = await db
        .select({ last: schema.users.lastMonthlyDigestSentAt })
        .from(schema.users)
        .where(eq(schema.users.id, user.id))
        .limit(1);
      if (u?.last && currentMonthKey(u.last) === monthKey) {
        continue;
      }

      const completedRows = await loadCompletedRowsForUser(user.id);
      if (completedRows.length === 0) {
        summary.skippedNoAssessments += 1;
        continue;
      }

      const modelIds = Array.from(new Set(completedRows.map(r => r.modelId)));
      const dimensionLabelMap = new Map<string, string>();
      if (modelIds.length > 0) {
        const dims = await db
          .select({
            modelId: schema.dimensions.modelId,
            key: schema.dimensions.key,
            label: schema.dimensions.label,
          })
          .from(schema.dimensions)
          .where(inArray(schema.dimensions.modelId, modelIds));
        for (const d of dims) dimensionLabelMap.set(`${d.modelId}:${d.key}`, d.label);
      }

      const rawInsights = buildInsightsFromRows(completedRows, dimensionLabelMap);
      const insights = {
        models: withPriorDeltas(rawInsights.models),
        crossModelDimensions: rawInsights.crossModelDimensions,
      };

      // Generate (or reuse cached) portfolio narrative — same path /insights uses.
      let narrative = '';
      try {
        narrative = await aiService.generatePortfolioNarrative(
          'user',
          {
            models: insights.models.map(m => ({
              modelName: m.modelName,
              modelClass: m.modelClass,
              latestScorePercent: m.latestScorePercent,
              assessmentCount: m.assessmentCount,
              // The portfolio narrative speaks to long-term trajectory, so
              // pass the first-vs-latest direction/delta from the shared
              // helper; the email body below shows the prior-vs-latest
              // delta to satisfy the digest "biggest movers" requirement.
              trendDirection: m.trendDirection,
              trendDelta: m.trendDelta,
            })),
            crossModelDimensions: insights.crossModelDimensions.map(d => ({
              label: d.label,
              averagePercent: d.averagePercent,
              modelCount: d.modelCount,
            })),
          },
          {
            industry: user.industry || undefined,
            companySize: user.companySize || undefined,
            jobTitle: user.jobTitle || undefined,
          },
        );
      } catch (err) {
        narrative = `Your portfolio currently spans ${insights.models.length} model${insights.models.length === 1 ? '' : 's'}. Open Insights to dive deeper.`;
      }

      const recipientName = user.name || user.username || 'there';
      const unsubscribeUrl = `${baseUrl}/profile`;
      const { html, text, subject } = buildEmailHtml({
        recipientName,
        insights,
        narrative,
        baseUrl,
        unsubscribeUrl,
      });

      const from = await buildEmailFrom(fromEmail, user.tenantId);

      // Stamp the user BEFORE sending. At-most-once delivery is the correct
      // trade-off: a crash after the DB write but before the email sends
      // causes an under-send (one missed email) rather than an over-send
      // (duplicate emails on the next run). We do NOT roll back on send
      // failure because rolling back would re-enable duplicates.
      await db
        .update(schema.users)
        .set({ lastMonthlyDigestSentAt: new Date() })
        .where(eq(schema.users.id, user.id));

      try {
        await sgClient.send({
          to: user.email,
          from,
          subject,
          text,
          html,
        });
        summary.sent += 1;
      } catch (sendErr) {
        // Timestamp is already committed — do not roll back.
        summary.failed += 1;
        const msg = `${user.email}: send failed: ${(sendErr as Error).message}`;
        summary.errors.push(msg);
        console.error('[Digest] Send failed for', user.email, sendErr);
      }
    } catch (err) {
      summary.failed += 1;
      const msg = `${user.email}: ${(err as Error).message}`;
      summary.errors.push(msg);
      console.error('[Digest] Failed for', user.email, err);
    }
  }

  const lastRunValue: DigestLastRunValue = { monthKey, status: 'complete', summary };
  await db
    .insert(schema.settings)
    .values({ key: DIGEST_LAST_RUN_KEY, value: lastRunValue })
    .onConflictDoUpdate({
      target: schema.settings.key,
      set: { value: lastRunValue, updatedAt: new Date() },
    });

  summary.finishedAt = new Date().toISOString();
  console.log('[Digest] Run complete:', summary);
  return summary;
}

let scheduleIntervalId: ReturnType<typeof setInterval> | null = null;

/**
 * Schedule the monthly digest. Wakes daily, runs only on the first day of
 * the calendar month (UTC) and only if it has not already run this month.
 * Tracking is persisted in the `settings` table so multiple worker restarts
 * within the same month do not re-send.
 */
export function startMonthlyDigestSchedule(): void {
  if (scheduleIntervalId) return;

  const ONE_DAY_MS = 24 * 60 * 60 * 1000;

  const tick = async () => {
    try {
      const now = new Date();
      const monthKey = currentMonthKey(now);

      const [setting] = await db
        .select()
        .from(schema.settings)
        .where(eq(schema.settings.key, DIGEST_LAST_RUN_KEY))
        .limit(1);
      const settingValue = setting?.value as DigestLastRunValue | undefined;
      const lastMonthKey = settingValue?.monthKey;

      // First deployment seeding: if no prior run is recorded, do NOT blast
      // the entire user base on first boot. Mark the *previous* month as
      // already-handled so the next 1st-of-month tick will be the first
      // legitimate send. Admins can still trigger an immediate run via
      // POST /api/admin/digest/run-monthly?force=true.
      if (!lastMonthKey) {
        const prev = previousMonthKey(now);
        const seed: DigestLastRunValue = {
          monthKey: prev,
          summary: {
            startedAt: now.toISOString(),
            finishedAt: now.toISOString(),
            monthKey: prev,
            candidates: 0,
            sent: 0,
            skippedNoAssessments: 0,
            failed: 0,
            errors: ['seeded on first deployment — no digest sent'],
          },
        };
        await db
          .insert(schema.settings)
          .values({ key: DIGEST_LAST_RUN_KEY, value: seed })
          .onConflictDoNothing({ target: schema.settings.key });
        console.log('[Digest] Seeded lastRunMonth to', prev, '— skipping first-deploy blast.');
        return;
      }

      if (lastMonthKey === monthKey) return;

      // Run on the 1st of the month, OR catch-up later in the same month if
      // the 1st was missed (e.g. the app was down). To avoid surprise
      // blasts after long gaps, only auto-catch-up when the recorded
      // lastMonthKey is exactly the previous month and we are still within
      // the first week. Older gaps require an admin to force a run.
      const isFirstOfMonth = now.getUTCDate() === 1;
      const lastIsPreviousMonth = lastMonthKey === previousMonthKey(now);
      const shouldRun = isFirstOfMonth || (lastIsPreviousMonth && now.getUTCDate() <= 7);
      if (!shouldRun) return;

      console.log('[Digest] Triggering scheduled monthly digest run for', monthKey);
      await runMonthlyDigest();
    } catch (err) {
      console.error('[Digest] Scheduler tick failed:', err);
    }
  };

  // Run a tick immediately on boot (no-op unless it's the 1st and not yet run).
  tick();
  scheduleIntervalId = setInterval(tick, ONE_DAY_MS);
}

export function stopMonthlyDigestSchedule(): void {
  if (scheduleIntervalId) {
    clearInterval(scheduleIntervalId);
    scheduleIntervalId = null;
  }
}
