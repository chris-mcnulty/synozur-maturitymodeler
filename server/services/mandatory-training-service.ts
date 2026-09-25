import { createHash } from "crypto";
import { and, asc, desc, eq, inArray, isNotNull } from "drizzle-orm";
import { z } from "zod";
import * as schema from "@shared/schema";
import { db } from "../db";

export const createMandatoryTrainingSchema = z.object({
  tenantId: z.string().min(1),
  title: z.string().trim().min(1).max(255),
  releaseAt: z.coerce.date().optional(),
  dueAt: z.coerce.date(),
  courseIds: z.array(z.string().min(1)).default([]),
  modelId: z.string().min(1).optional().nullable(),
  userIds: z.array(z.string().min(1)).min(1),
  idempotencyKey: z.string().trim().min(1).max(200).optional(),
}).strict().superRefine((value, ctx) => {
  const now = new Date();
  const releaseAt = value.releaseAt ?? now;
  if (value.dueAt <= now) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["dueAt"], message: "Due date must be in the future" });
  }
  if (releaseAt >= value.dueAt) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["dueAt"], message: "Due date must be after release date" });
  }
  if (!value.courseIds.length && !value.modelId) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["courseIds"], message: "Select at least one course or assessment" });
  }
  if (new Set(value.courseIds).size !== value.courseIds.length) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["courseIds"], message: "Course IDs must be unique" });
  }
  if (new Set(value.userIds).size !== value.userIds.length) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["userIds"], message: "User IDs must be unique" });
  }
});

export type CreateMandatoryTrainingInput = z.infer<typeof createMandatoryTrainingSchema>;
type TrainingItemStatus = typeof schema.MANDATORY_TRAINING_STATUSES[number];

export interface MandatoryTrainingItemReport {
  itemId: string;
  kind: "course" | "assessment";
  title: string;
  status: TrainingItemStatus;
  completedAt: Date | null;
  progressPercent: number;
  score: number | null;
  resultLabel: string | null;
  href: string | null;
}

export interface MandatoryTrainingRecipientReport {
  userId: string | null;
  name: string;
  email: string | null;
  status: TrainingItemStatus;
  completedAt: Date | null;
  items: MandatoryTrainingItemReport[];
  emailMilestones: Array<Pick<schema.MandatoryTrainingEmail, "milestone" | "status" | "claimedAt" | "sentAt" | "error">>;
}

export interface MandatoryTrainingReport {
  schedule: schema.MandatoryTrainingSchedule;
  items: schema.MandatoryTrainingItem[];
  recipients: MandatoryTrainingRecipientReport[];
  emails: Array<{
    recipientId: string;
    name: string;
    email: string | null;
    milestone: schema.MandatoryTrainingEmail["milestone"];
    status: schema.MandatoryTrainingEmail["status"];
    claimedAt: Date;
    sentAt: Date | null;
    error: string | null;
    reason: string | null;
  }>;
  emailSummary: Record<string, number>;
  summary: {
    recipientCount: number;
    completedCount: number;
    inProgressCount: number;
    notStartedCount: number;
    overdueCount: number;
    completionPercent: number;
  };
}

export function mandatoryTrainingStatus(
  completedAt: Date | null,
  started: boolean,
  dueAt: Date,
  now: Date,
  completed = !!completedAt,
): TrainingItemStatus {
  if (completed) return "completed";
  if (now > dueAt) return "overdue";
  return started ? "in_progress" : "not_started";
}

export function isEligibleTrainingAssessment(
  assessment: Pick<schema.Assessment, "userId" | "tenantId" | "isProxy" | "sessionId" | "importBatchId">,
  tenantId: string,
  userId: string,
  modelOwnerTenantId?: string | null,
): boolean {
  return assessment.userId === userId
    // Shared/public models stamp their owner's tenant on a learner assessment,
    // not necessarily the learner's tenant. The model must also pass the
    // learner-access check before this helper is used.
    && (assessment.tenantId === tenantId || (!!modelOwnerTenantId && assessment.tenantId === modelOwnerTenantId))
    && !assessment.isProxy
    && !assessment.sessionId
    && !assessment.importBatchId;
}

export class IdempotencyConflictError extends Error {
  readonly statusCode = 409;
  constructor() {
    super("Idempotency key was already used with a different request");
    this.name = "IdempotencyConflictError";
  }
}

export function mandatoryTrainingRequestHash(input: CreateMandatoryTrainingInput): string {
  const canonical = {
    tenantId: input.tenantId,
    title: input.title,
    releaseAt: input.releaseAt?.toISOString() ?? null,
    dueAt: input.dueAt.toISOString(),
    courseIds: input.courseIds,
    modelId: input.modelId ?? null,
    userIds: [...input.userIds].sort(),
  };
  return createHash("sha256").update(JSON.stringify(canonical)).digest("hex");
}

async function courseAccessForTenant(course: schema.Course, tenantId: string): Promise<boolean> {
  if (course.visibility === "public" || course.ownerTenantId === tenantId) return true;
  const [shared] = await db.select({ id: schema.courseTenants.id }).from(schema.courseTenants)
    .where(and(eq(schema.courseTenants.courseId, course.id), eq(schema.courseTenants.tenantId, tenantId))).limit(1);
  return !!shared;
}

async function modelAccessForTenant(model: typeof schema.models.$inferSelect, tenantId: string): Promise<boolean> {
  if (model.visibility === "public") return true;
  // Organizational private assessments are admin-only under canAccessModel.
  if (model.visibility !== "private" || model.modelClass === "organizational") return false;
  const [shared] = await db.select({ id: schema.modelTenants.id }).from(schema.modelTenants)
    .where(and(eq(schema.modelTenants.modelId, model.id), eq(schema.modelTenants.tenantId, tenantId))).limit(1);
  return !!shared;
}

export async function createMandatoryTraining(raw: unknown, createdBy: string): Promise<schema.MandatoryTrainingSchedule> {
  const input = createMandatoryTrainingSchema.parse(raw);
  const releaseAt = input.releaseAt ?? new Date();
  const requestHash = mandatoryTrainingRequestHash(input);
  if (input.idempotencyKey) {
    const [previous] = await db.select().from(schema.mandatoryTrainingSchedules).where(and(
      eq(schema.mandatoryTrainingSchedules.tenantId, input.tenantId),
      eq(schema.mandatoryTrainingSchedules.idempotencyKey, input.idempotencyKey),
    )).limit(1);
    if (previous) {
      if (previous.idempotencyHash === requestHash) return previous;
      throw new IdempotencyConflictError();
    }
  }

  const [tenant] = await db.select({ id: schema.tenants.id }).from(schema.tenants)
    .where(eq(schema.tenants.id, input.tenantId)).limit(1);
  if (!tenant) throw new Error("Tenant not found");

  const users = await db.select().from(schema.users).where(and(
    eq(schema.users.tenantId, input.tenantId),
    inArray(schema.users.id, input.userIds),
  ));
  if (users.length !== input.userIds.length) throw new Error("Recipients must be existing users in the selected tenant");

  const courseRows = input.courseIds.length
    ? await db.select().from(schema.courses).where(inArray(schema.courses.id, input.courseIds))
    : [];
  if (courseRows.length !== input.courseIds.length) throw new Error("One or more courses were not found");
  const coursesById = new Map(courseRows.map(course => [course.id, course]));
  const model = input.modelId
    ? (await db.select().from(schema.models).where(eq(schema.models.id, input.modelId)).limit(1))[0]
    : undefined;
  if (input.modelId && !model) throw new Error("Assessment model not found");

  for (const courseId of input.courseIds) {
    const course = coursesById.get(courseId)!;
    if (course.status !== "published" || !(await courseAccessForTenant(course, input.tenantId))) {
      throw new Error(`Course is unpublished or unavailable to this tenant: ${course.title}`);
    }
  }
  if (model && (model.status !== "published" || !(await modelAccessForTenant(model, input.tenantId)))) {
    throw new Error(`Assessment is unpublished or unavailable to this tenant: ${model.name}`);
  }

  const items: Array<{
    order: number;
    kind: typeof schema.MANDATORY_TRAINING_ITEM_KINDS[number];
    contentId: string;
    snapshotTitle: string;
  }> = [];
  input.courseIds.forEach((id, order) => {
    items.push({
      order,
      kind: "course",
      contentId: id,
      snapshotTitle: coursesById.get(id)!.title,
    });
  });
  if (model) items.push({
    order: input.courseIds.length,
    kind: "assessment",
    contentId: model.id,
    snapshotTitle: model.name,
  });

  try {
    return await db.transaction(async (tx) => {
      const [schedule] = await tx.insert(schema.mandatoryTrainingSchedules).values({
        tenantId: input.tenantId,
        title: input.title,
        releaseAt,
        dueAt: input.dueAt,
        createdBy,
        idempotencyKey: input.idempotencyKey ?? null,
        idempotencyHash: requestHash,
      }).returning();
      await tx.insert(schema.mandatoryTrainingItems).values(items.map(item => ({ ...item, scheduleId: schedule.id })));
      const userById = new Map(users.map(user => [user.id, user]));
      await tx.insert(schema.mandatoryTrainingRecipients).values(input.userIds.map(userId => {
        const user = userById.get(userId)!;
        return {
          scheduleId: schedule.id,
          userId,
          snapshotName: user.name || user.username,
          snapshotEmail: user.email,
        };
      }));
      return schedule;
    });
  } catch (error: any) {
    // A concurrent retry may win the tenant-scoped idempotency uniqueness race.
    if (input.idempotencyKey) {
      const [previous] = await db.select().from(schema.mandatoryTrainingSchedules).where(and(
        eq(schema.mandatoryTrainingSchedules.tenantId, input.tenantId),
        eq(schema.mandatoryTrainingSchedules.idempotencyKey, input.idempotencyKey),
      )).limit(1);
      if (previous) {
        if (previous.idempotencyHash === requestHash) return previous;
        throw new IdempotencyConflictError();
      }
    }
    throw error;
  }
}

export async function getMandatoryTrainingOptions(tenantId: string) {
  const [tenant] = await db.select({ id: schema.tenants.id }).from(schema.tenants)
    .where(eq(schema.tenants.id, tenantId)).limit(1);
  if (!tenant) throw new Error("Tenant not found");
  const users = await db.select({ id: schema.users.id, name: schema.users.name, email: schema.users.email })
    .from(schema.users).where(eq(schema.users.tenantId, tenantId)).orderBy(asc(schema.users.name));
  const allCourses = await db.select().from(schema.courses).where(eq(schema.courses.status, "published"));
  const courses = [];
  for (const course of allCourses) {
    if (await courseAccessForTenant(course, tenantId)) courses.push({ id: course.id, title: course.title });
  }
  const allModels = await db.select().from(schema.models).where(eq(schema.models.status, "published"));
  const models = [];
  for (const model of allModels) {
    if (await modelAccessForTenant(model, tenantId)) models.push({ id: model.id, title: model.name });
  }
  return { users, courses, models };
}

async function getOneRecipientReport(
  schedule: schema.MandatoryTrainingSchedule,
  items: schema.MandatoryTrainingItem[],
  recipient: schema.MandatoryTrainingRecipient,
  user: schema.User | undefined,
  emailMilestones: MandatoryTrainingRecipientReport["emailMilestones"],
  now: Date,
): Promise<MandatoryTrainingRecipientReport> {
  const itemReports: MandatoryTrainingItemReport[] = [];
  for (const item of items) {
    let completedAt: Date | null = null;
    let completed = false;
    let started = false;
    let progressPercent = 0;
    let score: number | null = null;
    let resultLabel: string | null = null;
    let href: string | null = null;

    if (user && item.kind === "course" && item.contentId) {
      const [course] = await db.select().from(schema.courses).where(eq(schema.courses.id, item.contentId)).limit(1);
      if (course && course.status === "published" && await courseAccessForTenant(course, schedule.tenantId)) {
        href = `/courses/${course.slug}`;
      }
      const [enrollment] = await db.select().from(schema.courseEnrollments).where(and(
        eq(schema.courseEnrollments.courseId, item.contentId),
        eq(schema.courseEnrollments.userId, user.id),
      )).limit(1);
      if (enrollment) {
        progressPercent = enrollment.progressPercent;
        started = true;
        if (enrollment.status === "completed") {
          completed = true;
          completedAt = enrollment.completedAt ?? null;
        }
      }
    } else if (user && item.kind === "assessment" && item.contentId) {
      const [model] = await db.select().from(schema.models).where(eq(schema.models.id, item.contentId)).limit(1);
      if (model && model.status === "published" && await modelAccessForTenant(model, schedule.tenantId)) {
        href = `/${model.slug}`;
      }
      const assessments = await db.select().from(schema.assessments).where(and(
        eq(schema.assessments.modelId, item.contentId),
        eq(schema.assessments.userId, user.id),
        eq(schema.assessments.isProxy, false),
        isNotNull(schema.assessments.userId),
      ));
      const realAssessments = assessments.filter(a => isEligibleTrainingAssessment(a, schedule.tenantId, user.id, model?.ownerTenantId));
      started = realAssessments.some(a => a.status === "in_progress");
      const completedAssessments = realAssessments.filter(a => a.status === "completed" && a.completedAt)
        .sort((a, b) => (b.completedAt?.getTime() ?? 0) - (a.completedAt?.getTime() ?? 0));
      if (completedAssessments.length) {
        const resultRows = await db.select().from(schema.results).where(inArray(
          schema.results.assessmentId, completedAssessments.map(a => a.id),
        ));
        const resultByAssessment = new Map(resultRows.map(r => [r.assessmentId, r]));
        const qualifying = completedAssessments.find(a => resultByAssessment.has(a.id));
        if (qualifying) {
          const result = resultByAssessment.get(qualifying.id)!;
          completed = true;
          completedAt = qualifying.completedAt!;
          score = result.overallScore;
          resultLabel = result.label;
        }
      }
    }
    itemReports.push({
      itemId: item.id,
      kind: item.kind as "course" | "assessment",
      title: item.snapshotTitle,
      status: mandatoryTrainingStatus(completedAt, started, schedule.dueAt, now, completed),
      completedAt,
      progressPercent,
      score,
      resultLabel,
      href,
    });
  }
  const completion = summarizeAssignedItems(itemReports, schedule.dueAt, now);
  return {
    userId: recipient.userId,
    name: recipient.snapshotName,
    email: recipient.snapshotEmail,
    status: completion.status,
    completedAt: completion.completedAt,
    items: itemReports,
    emailMilestones,
  };
}

export function summarizeAssignedItems(
  items: MandatoryTrainingItemReport[],
  dueAt: Date,
  now: Date,
): { status: TrainingItemStatus; completedAt: Date | null } {
  const done = items.length > 0 && items.every(item => item.status === "completed");
  const dates = items.map(item => item.completedAt).filter((date): date is Date => !!date);
  const completedAt = done && dates.length === items.length
    ? new Date(Math.max(...dates.map(date => date.getTime())))
    : null;
  const started = items.some(item => item.status === "in_progress" || item.status === "completed");
  return { status: mandatoryTrainingStatus(completedAt, started, dueAt, now, done), completedAt };
}

export async function getMandatoryTrainingReport(
  scheduleId: string,
  userIdFilter?: string,
): Promise<MandatoryTrainingReport | null> {
  const [schedule] = await db.select().from(schema.mandatoryTrainingSchedules)
    .where(eq(schema.mandatoryTrainingSchedules.id, scheduleId)).limit(1);
  if (!schedule) return null;
  const items = await db.select().from(schema.mandatoryTrainingItems)
    .where(eq(schema.mandatoryTrainingItems.scheduleId, schedule.id)).orderBy(asc(schema.mandatoryTrainingItems.order));
  const recipientRows = await db.select().from(schema.mandatoryTrainingRecipients).where(and(
    eq(schema.mandatoryTrainingRecipients.scheduleId, schedule.id),
    ...(userIdFilter ? [eq(schema.mandatoryTrainingRecipients.userId, userIdFilter)] : []),
  ));
  const userIds = recipientRows.map(r => r.userId).filter((id): id is string => !!id);
  const users = userIds.length
    ? await db.select().from(schema.users).where(and(
      eq(schema.users.tenantId, schedule.tenantId), inArray(schema.users.id, userIds),
    ))
    : [];
  const byId = new Map(users.map(user => [user.id, user]));
  const recipientIds = recipientRows.map(r => r.id);
  const emailRows = recipientIds.length
    ? await db.select().from(schema.mandatoryTrainingEmails)
      .where(inArray(schema.mandatoryTrainingEmails.recipientId, recipientIds))
    : [];
  const emailsByRecipient = new Map<string, MandatoryTrainingRecipientReport["emailMilestones"]>();
  for (const row of emailRows) {
    const values = emailsByRecipient.get(row.recipientId) ?? [];
    values.push({
      milestone: row.milestone,
      status: row.status,
      claimedAt: row.claimedAt,
      sentAt: row.sentAt,
      error: row.error,
    });
    emailsByRecipient.set(row.recipientId, values);
  }
  const now = new Date();
  const recipients = [];
  for (const recipient of recipientRows) {
    const user = recipient.userId ? byId.get(recipient.userId) : undefined;
    recipients.push(await getOneRecipientReport(
      schedule, items, recipient, user, emailsByRecipient.get(recipient.id) ?? [], now,
    ));
  }
  const emails = emailRows.map(row => {
    const recipient = recipientRows.find(candidate => candidate.id === row.recipientId)!;
    return {
      recipientId: recipient.id,
      name: recipient.snapshotName,
      email: recipient.snapshotEmail,
      milestone: row.milestone,
      status: row.status,
      claimedAt: row.claimedAt,
      sentAt: row.sentAt,
      error: row.error,
      reason: row.error,
    };
  });
  const emailSummary: Record<string, number> = { claimed: 0, sent: 0, failed: 0, skipped: 0 };
  for (const email of emails) emailSummary[email.status] = (emailSummary[email.status] ?? 0) + 1;
  const summary = {
    recipientCount: recipients.length,
    completedCount: recipients.filter(r => r.status === "completed").length,
    inProgressCount: recipients.filter(r => r.status === "in_progress").length,
    notStartedCount: recipients.filter(r => r.status === "not_started").length,
    overdueCount: recipients.filter(r => r.status === "overdue").length,
    completionPercent: recipients.length
      ? Math.round(recipients.filter(r => r.status === "completed").length * 100 / recipients.length)
      : 0,
  };
  return { schedule, items, recipients, emails, emailSummary, summary };
}

export async function listMandatoryTraining(
  tenantId: string | null,
  userIdFilter?: string,
  releasedOnly = false,
) {
  const conditions = [];
  if (tenantId) conditions.push(eq(schema.mandatoryTrainingSchedules.tenantId, tenantId));
  const schedules = await db.select().from(schema.mandatoryTrainingSchedules)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(schema.mandatoryTrainingSchedules.createdAt));
  const reports = [];
  for (const schedule of schedules) {
    if (releasedOnly && schedule.releaseAt > new Date()) continue;
    if (userIdFilter) {
      const [recipient] = await db.select({ id: schema.mandatoryTrainingRecipients.id })
        .from(schema.mandatoryTrainingRecipients).where(and(
          eq(schema.mandatoryTrainingRecipients.scheduleId, schedule.id),
          eq(schema.mandatoryTrainingRecipients.userId, userIdFilter),
        )).limit(1);
      if (!recipient) continue;
    }
    const report = await getMandatoryTrainingReport(schedule.id, userIdFilter);
    if (report) reports.push(report);
  }
  return reports;
}

export function isMandatoryTrainingStatus(value: unknown): value is TrainingItemStatus {
  return typeof value === "string"
    && (schema.MANDATORY_TRAINING_STATUSES as readonly string[]).includes(value);
}

export async function getMandatoryTrainingExport(
  scheduleId: string,
  statusFilter?: TrainingItemStatus,
): Promise<string | null> {
  const report = await getMandatoryTrainingReport(scheduleId);
  if (!report) return null;
  return formatMandatoryTrainingCsv(report.recipients, statusFilter);
}

export function formatMandatoryTrainingCsv(
  recipients: MandatoryTrainingRecipientReport[],
  statusFilter?: TrainingItemStatus,
): string {
  const headers = ["User", "Email", "Status", "Completed At", "Item", "Kind", "Item Status", "Item Completed At", "Progress %", "Score", "Result"];
  // Spreadsheet applications interpret leading formula characters as code.
  const escape = (value: unknown) => {
    const text = String(value ?? "");
    const safe = /^[\s]*[=+\-@]/.test(text) ? `'${text}` : text;
    return `"${safe.replace(/"/g, '""')}"`;
  };
  const rows = [headers.map(escape).join(",")];
  for (const recipient of recipients.filter(r => !statusFilter || r.status === statusFilter)) {
    for (const item of recipient.items) {
      rows.push([
        recipient.name, recipient.email, recipient.status, recipient.completedAt?.toISOString(),
        item.title, item.kind, item.status, item.completedAt?.toISOString(),
        item.progressPercent, item.score, item.resultLabel,
      ].map(escape).join(","));
    }
  }
  return rows.join("\r\n");
}