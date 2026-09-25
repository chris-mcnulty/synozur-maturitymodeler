import { sql } from 'drizzle-orm';
import { db } from '../db';
import { getBaseUrl } from '../config/environment';
import type sgMail from '@sendgrid/mail';

export type MandatoryTrainingMilestone = 'release' | '7d' | '1d' | 'overdue';

export interface MandatoryTrainingItem {
  id: string;
  kind: string;
  contentId: string;
  title: string;
  order: number;
}

export interface MandatoryTrainingCompletionResolverInput {
  userId: string;
  item: MandatoryTrainingItem;
}

/**
 * Backend completion systems may register a resolver for content kinds that
 * are not represented by course_enrollments or lesson_progress. A true result
 * means this user's assigned item is complete.
 */
export type MandatoryTrainingCompletionResolver = (
  input: MandatoryTrainingCompletionResolverInput,
) => Promise<boolean>;

let externalCompletionResolver: MandatoryTrainingCompletionResolver | undefined;

export function setMandatoryTrainingCompletionResolver(
  resolver?: MandatoryTrainingCompletionResolver,
): void {
  externalCompletionResolver = resolver;
}

const MILESTONES: MandatoryTrainingMilestone[] = ['release', '7d', '1d', 'overdue'];
const DAY_MS = 24 * 60 * 60 * 1000;
const TICK_MS = 60 * 1000;
let scheduleInterval: ReturnType<typeof setInterval> | undefined;

function asDate(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value);
}

/** UTC midnight for the calendar date containing `date`. */
export function utcDay(date: Date | string): Date {
  const d = asDate(date);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

/**
 * Return each milestone whose UTC calendar boundary has arrived. Release is
 * also used as a hard gate, so a future release can never send a reminder.
 */
export function getDueMandatoryTrainingMilestones(
  releaseAt: Date | string,
  dueAt: Date | string,
  now = new Date(),
): MandatoryTrainingMilestone[] {
  const plan = getMandatoryTrainingMilestonePlan(releaseAt, dueAt, now);
  return [...plan.skipped.map(({ milestone }) => milestone), ...(plan.send ? [plan.send] : [])];
}

export interface MandatoryTrainingMilestonePlan {
  send: MandatoryTrainingMilestone | null;
  skipped: Array<{ milestone: MandatoryTrainingMilestone; reason: string }>;
}

export function canSendMandatoryTrainingMilestone(
  milestone: MandatoryTrainingMilestone,
  allItemsComplete: boolean,
): boolean {
  return milestone === 'release' || !allItemsComplete;
}

/**
 * Release is an exact timestamp; reminders only run on their UTC target
 * dates, and overdue starts strictly after dueAt. A late scheduler records
 * missed milestones as skipped and sends no more than the newest eligible one.
 */
export function getMandatoryTrainingMilestonePlan(
  releaseAtValue: Date | string,
  dueAtValue: Date | string,
  now = new Date(),
): MandatoryTrainingMilestonePlan {
  const releaseAt = asDate(releaseAtValue);
  const dueAt = asDate(dueAtValue);
  const nowMs = now.getTime();
  const today = utcDay(now).getTime();
  const dueDay = utcDay(dueAt).getTime();
  const targets: Record<MandatoryTrainingMilestone, number> = {
    release: releaseAt.getTime(),
    '7d': dueDay - 7 * DAY_MS,
    '1d': dueDay - DAY_MS,
    overdue: dueAt.getTime() + 1,
  };
  const crossed: MandatoryTrainingMilestone[] = [];
  if (nowMs >= targets.release) crossed.push('release');
  if (nowMs >= releaseAt.getTime() && today >= targets['7d']) crossed.push('7d');
  if (nowMs >= releaseAt.getTime() && today >= targets['1d']) crossed.push('1d');
  if (nowMs > dueAt.getTime()) crossed.push('overdue');

  const candidates: MandatoryTrainingMilestone[] = [];
  if (nowMs >= releaseAt.getTime()) {
    const laterReminderBoundaryPassed = (['7d', '1d'] as const).some((milestone) =>
      targets[milestone] > releaseAt.getTime() && targets[milestone] <= nowMs,
    );
    if (!laterReminderBoundaryPassed) candidates.push('release');
  }
  if (nowMs >= releaseAt.getTime() && today === targets['7d']) candidates.push('7d');
  if (nowMs >= releaseAt.getTime() && today === targets['1d']) candidates.push('1d');
  if (nowMs > dueAt.getTime()) candidates.push('overdue');

  const priority: Record<MandatoryTrainingMilestone, number> = {
    release: 4,
    '7d': 3,
    '1d': 2,
    overdue: 1,
  };
  candidates.sort((a, b) => targets[a] - targets[b] || priority[a] - priority[b]);
  const send = candidates.at(-1) ?? null;
  return {
    send,
    skipped: crossed
      .filter((milestone) => milestone !== send)
      .map((milestone) => ({
        milestone,
        reason: 'Milestone was missed or superseded; only the most recent eligible milestone is sent.',
      })),
  };
}

type ScheduleRecipient = {
  scheduleId: string;
  recipientId: string;
  userId: string;
  email: string | null;
  emailVerified: boolean;
  name: string | null;
  username: string;
  tenantId: string | null;
  scheduleTenantId: string;
  title: string;
  releaseAt: Date | string;
  dueAt: Date | string;
};

type ScheduleItem = MandatoryTrainingItem & { scheduleId: string };

function rowsOf<T>(result: unknown): T[] {
  if (Array.isArray(result)) return result as T[];
  const rows = (result as { rows?: T[] } | null)?.rows;
  return Array.isArray(rows) ? rows : [];
}

function escapeHtml(value: unknown): string {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatUtcDate(date: Date | string): string {
  return utcDay(date).toLocaleDateString('en-US', {
    timeZone: 'UTC',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

async function itemIsComplete(
  userId: string,
  tenantId: string,
  item: MandatoryTrainingItem,
): Promise<boolean> {
  const kind = item.kind.toLowerCase();
  if (kind === 'course' || kind === 'course_id') {
    const result = await db.execute(sql`
      SELECT 1
      FROM course_enrollments
      WHERE user_id = ${userId}
        AND course_id = ${item.contentId}
        AND status = 'completed'
      LIMIT 1
    `);
    return rowsOf(result).length > 0;
  } else if (kind === 'lesson' || kind === 'lesson_id') {
    const result = await db.execute(sql`
      SELECT 1
      FROM lesson_progress lp
      INNER JOIN course_enrollments ce ON ce.id = lp.enrollment_id
      WHERE ce.user_id = ${userId}
        AND lp.lesson_id = ${item.contentId}
        AND (lp.status = 'completed' OR lp.completed_at IS NOT NULL)
      LIMIT 1
    `);
    return rowsOf(result).length > 0;
  } else if (kind === 'assessment' || kind === 'model' || kind === 'assessment_model') {
    const result = await db.execute(sql`
      SELECT 1
      FROM assessments a
      INNER JOIN results r ON r.assessment_id = a.id
      INNER JOIN models m ON m.id = a.model_id
      WHERE a.user_id = ${userId}
        AND (a.tenant_id = ${tenantId} OR (m.owner_tenant_id IS NOT NULL AND a.tenant_id = m.owner_tenant_id))
        AND a.model_id = ${item.contentId}
        AND a.status = 'completed'
        AND a.completed_at IS NOT NULL
        AND COALESCE(a.is_proxy, false) = false
        AND a.session_id IS NULL
        AND a.import_batch_id IS NULL
        AND a.user_id IS NOT NULL
      LIMIT 1
    `);
    return rowsOf(result).length > 0;
  }

  return externalCompletionResolver
    ? externalCompletionResolver({ userId, item })
    : false;
}

async function allItemsComplete(userId: string, tenantId: string, items: ScheduleItem[]): Promise<boolean> {
  if (items.length === 0) return true;
  for (const item of items) {
    if (!(await itemIsComplete(userId, tenantId, item))) return false;
  }
  return true;
}

async function claimEmail(recipientId: string, milestone: MandatoryTrainingMilestone): Promise<string | null> {
  // The unique (recipient_id, milestone) constraint is the cross-process lock.
  // Claim is committed before contacting SendGrid; a process crash therefore
  // cannot cause a restart or concurrent worker to send the same email again.
  const result = await db.execute(sql`
    INSERT INTO mandatory_training_emails (recipient_id, milestone, status, claimed_at)
    VALUES (${recipientId}, ${milestone}, 'claimed', NOW())
    ON CONFLICT (recipient_id, milestone) DO NOTHING
    RETURNING id
  `);
  return rowsOf<{ id: string }>(result)[0]?.id ?? null;
}

async function finishEmail(
  emailId: string,
  status: 'sent' | 'failed' | 'skipped',
  error?: string,
): Promise<void> {
  await db.execute(sql`
    UPDATE mandatory_training_emails
    SET status = ${status},
        sent_at = ${status === 'sent' ? new Date() : null},
        error = ${error?.slice(0, 2000) ?? null}
    WHERE id = ${emailId}
  `);
}

function milestoneCopy(milestone: MandatoryTrainingMilestone): { subject: string; intro: string } {
  switch (milestone) {
    case 'release':
      return { subject: 'Your mandatory training is available', intro: 'Your assigned mandatory training is now available.' };
    case '7d':
      return { subject: 'Mandatory training is due in 7 days', intro: 'A reminder that your mandatory training is due in 7 days.' };
    case '1d':
      return { subject: 'Mandatory training is due tomorrow', intro: 'Your mandatory training is due tomorrow.' };
    case 'overdue':
      return { subject: 'Your mandatory training is overdue', intro: 'Your mandatory training is now overdue. Please complete it as soon as possible.' };
  }
}

async function sendMilestoneEmail(
  recipient: ScheduleRecipient,
  milestone: MandatoryTrainingMilestone,
  items: ScheduleItem[],
): Promise<void> {
  const baseUrl = getBaseUrl();
  const { getEmailBranding, buildEmailFrom, getUncachableSendGridClient } = await import('../sendgrid');
  const branding = await getEmailBranding(recipient.tenantId, baseUrl);
  const { client, fromEmail } = await getUncachableSendGridClient();
  const from = await buildEmailFrom(fromEmail, recipient.tenantId);
  const copy = milestoneCopy(milestone);
  const itemList = items
    .slice()
    .sort((a, b) => a.order - b.order)
    .map((item) => `<li style="margin: 6px 0;">${escapeHtml(item.title)}</li>`)
    .join('');
  const greeting = escapeHtml(recipient.name || recipient.username || 'there');
  const dueDate = formatUtcDate(recipient.dueAt);
  const html = `<!doctype html><html><body style="margin:0;background:#f5f5f5;font-family:Arial,sans-serif;color:#222;"><div style="max-width:640px;margin:24px auto;background:#fff;">${branding.headerHtml}<div style="padding:28px 30px;"><p>Hello ${greeting},</p><p>${copy.intro}</p><p><strong>${escapeHtml(recipient.title)}</strong> must be completed by ${dueDate} (UTC).</p><ul style="padding-left:22px;">${itemList}</ul><p><a href="${escapeHtml(baseUrl)}/my-courses" style="display:inline-block;padding:12px 18px;background:${branding.primaryColor};color:#fff;text-decoration:none;border-radius:4px;">Open training</a></p></div>${branding.footerHtml}</div></body></html>`;
  const textItems = items.slice().sort((a, b) => a.order - b.order).map((item) => `- ${item.title}`).join('\n');
  const text = `Hello ${recipient.name || recipient.username || 'there'},\n\n${copy.intro}\n${recipient.title} must be completed by ${dueDate} (UTC).\n\n${textItems}\n\nOpen training: ${baseUrl}/my-courses`;
  await (client as typeof sgMail).send({
    to: recipient.email!,
    from,
    subject: copy.subject,
    text,
    html,
  });
}

export interface MandatoryTrainingEmailRunSummary {
  candidates: number;
  sent: number;
  failed: number;
  skipped: number;
}

/**
 * Process currently due mandatory-training notifications. This function is
 * also exported for controlled/manual runs and reports counts for monitoring.
 */
export async function processMandatoryTrainingEmails(
  now = new Date(),
): Promise<MandatoryTrainingEmailRunSummary> {
  const summary: MandatoryTrainingEmailRunSummary = { candidates: 0, sent: 0, failed: 0, skipped: 0 };
  const recipients = rowsOf<ScheduleRecipient>(await db.execute(sql`
    SELECT
      s.id AS "scheduleId",
      r.id AS "recipientId",
      r.user_id AS "userId",
      u.email,
      u.email_verified AS "emailVerified",
      u.name,
      u.username,
      u.tenant_id AS "tenantId",
      s.tenant_id AS "scheduleTenantId",
      s.title,
      s.release_at AS "releaseAt",
      s.due_at AS "dueAt"
    FROM mandatory_training_schedules s
    INNER JOIN mandatory_training_recipients r ON r.schedule_id = s.id
    INNER JOIN users u ON u.id = r.user_id
    WHERE s.release_at <= ${now}
  `));
  summary.candidates = recipients.length;
  if (recipients.length === 0) return summary;

  const scheduleIds = Array.from(new Set(recipients.map((r) => r.scheduleId)));
  const items = rowsOf<ScheduleItem>(await db.execute(sql`
    SELECT schedule_id AS "scheduleId", id, kind, content_id AS "contentId",
           snapshot_title AS title, "order"
    FROM mandatory_training_items
    WHERE schedule_id IN (${sql.join(scheduleIds.map(id => sql`${id}`), sql`, `)})
    ORDER BY "order"
  `));
  const itemsBySchedule = new Map<string, ScheduleItem[]>();
  for (const item of items) {
    const list = itemsBySchedule.get(item.scheduleId) ?? [];
    list.push(item);
    itemsBySchedule.set(item.scheduleId, list);
  }

  for (const recipient of recipients) {
    const plan = getMandatoryTrainingMilestonePlan(recipient.releaseAt, recipient.dueAt, now);
    if (!plan.send && plan.skipped.length === 0) continue;
    const scheduleItems = itemsBySchedule.get(recipient.scheduleId) ?? [];
    let complete: boolean;
    try {
      complete = await allItemsComplete(recipient.userId, recipient.scheduleTenantId, scheduleItems);
    } catch (error) {
      console.error('[Mandatory training email] Failed checking completion', recipient.recipientId, error);
      // A failed progress read must not result in mailing someone who finished.
      // Do not claim the milestone; a later tick can retry the check.
      summary.failed += 1;
      continue;
    }

    const releaseWillBeSent = plan.send === 'release' && canSendMandatoryTrainingMilestone('release', complete);
    const skipReasonByMilestone = new Map(
      plan.skipped.map(({ milestone, reason }) => [milestone, reason]),
    );
    const milestonesToSkip = complete
      ? MILESTONES.filter((milestone) => !(releaseWillBeSent && milestone === 'release'))
      : plan.skipped.map(({ milestone }) => milestone);

    // Permanently claim missed milestones with a reason, rather than catching
    // up with a burst of stale reminders after a downtime or restart.
    for (const milestone of milestonesToSkip) {
      let emailId: string | null;
      try {
        emailId = await claimEmail(recipient.recipientId, milestone);
      } catch (error) {
        console.error('[Mandatory training email] Failed claiming skipped milestone', recipient.recipientId, milestone, error);
        continue;
      }
      if (!emailId) continue;
      const error = complete
        ? 'All assigned training items are complete.'
        : skipReasonByMilestone.get(milestone) ?? 'Reminder is no longer applicable.';
      await finishEmail(emailId, 'skipped', error);
      summary.skipped += 1;
    }

    // A release announcement is still sent when the learner already completed
    // the content; completion suppresses only reminders.
    const milestone = plan.send && canSendMandatoryTrainingMilestone(plan.send, complete) ? plan.send : null;
    if (!milestone) continue;

    let emailId: string | null;
    try {
      emailId = await claimEmail(recipient.recipientId, milestone);
    } catch (error) {
      console.error('[Mandatory training email] Failed claiming milestone', recipient.recipientId, milestone, error);
      continue;
    }
    if (!emailId) continue;

    if (!recipient.emailVerified || !recipient.email || recipient.tenantId !== recipient.scheduleTenantId) {
      await finishEmail(emailId, 'skipped', 'Recipient email is unverified/unavailable or the user is no longer in the schedule tenant.');
      summary.skipped += 1;
      continue;
    }

    try {
      // Recheck reminders just before delivery, but retain the release notice
      // even if completion occurred before this tick.
      const completeBeforeSend = milestone === 'release'
        ? false
        : await allItemsComplete(recipient.userId, recipient.scheduleTenantId, scheduleItems);
      if (!canSendMandatoryTrainingMilestone(milestone, completeBeforeSend)) {
        await finishEmail(emailId, 'skipped', 'All assigned training items are complete.');
        summary.skipped += 1;
        continue;
      }
      await sendMilestoneEmail(recipient, milestone, scheduleItems);
      await finishEmail(emailId, 'sent');
      summary.sent += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await finishEmail(emailId, 'failed', message).catch((updateError) => {
        console.error('[Mandatory training email] Could not record send failure', emailId, updateError);
      });
      summary.failed += 1;
      console.error('[Mandatory training email] Send failed', recipient.recipientId, milestone, error);
    }
  }
  return summary;
}

export function startMandatoryTrainingEmailSchedule(): void {
  if (scheduleInterval) return;
  const tick = async () => {
    try {
      const result = await processMandatoryTrainingEmails();
      if (result.candidates > 0) console.log('[Mandatory training email] Scheduler run', result);
    } catch (error) {
      console.error('[Mandatory training email] Scheduler tick failed', error);
    }
  };
  void tick();
  scheduleInterval = setInterval(() => void tick(), TICK_MS);
  scheduleInterval.unref?.();
}