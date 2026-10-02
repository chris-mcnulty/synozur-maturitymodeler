import { eq, inArray, or, sql } from "drizzle-orm";
import { z } from "zod";
import * as schema from "@shared/schema";
import { db } from "../db";

export const addRequiredLearnersSchema = z.object({
  userIds: z.array(z.string().min(1)).max(200).default([]),
  entraEmails: z.array(z.string().trim().toLowerCase().email()).max(200).default([]),
}).strict().superRefine((input, ctx) => {
  if (!input.userIds.length && !input.entraEmails.length) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Select learners or enter Microsoft work email addresses" });
  }
  if (new Set(input.userIds).size !== input.userIds.length) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "User IDs must be unique" });
  }
});

const fail = (message: string, statusCode = 400) => Object.assign(new Error(message), { statusCode });

export async function addRequiredLearners(scheduleId: string, raw: unknown, authorizedTenantId: string | null) {
  const input = addRequiredLearnersSchema.parse(raw);
  const emails = [...new Set(input.entraEmails)];
  try {
    return await db.transaction(async tx => {
      const [schedule] = await tx.select().from(schema.mandatoryTrainingSchedules)
        .where(eq(schema.mandatoryTrainingSchedules.id, scheduleId)).limit(1).for("update");
      if (!schedule) throw fail("Training set not found", 404);
      if (authorizedTenantId && schedule.tenantId !== authorizedTenantId) throw fail("Forbidden", 403);

      const conditions = [];
      if (input.userIds.length) conditions.push(inArray(schema.users.id, input.userIds));
      if (emails.length) conditions.push(inArray(sql`lower(${schema.users.email})`, emails));
      const users = await tx.select().from(schema.users).where(or(...conditions));
      const byId = new Map(users.map(user => [user.id, user]));
      const byEmail = new Map<string, schema.User>();
      for (const user of users) {
        if (user.tenantId !== schedule.tenantId) {
          throw fail("All learners must belong to the training set's tenant; existing accounts cannot be moved by this action", 403);
        }
        if (user.email) {
          const email = user.email.toLowerCase();
          if (byEmail.has(email)) throw fail("Multiple accounts use the same email address; resolve this in Users first", 409);
          byEmail.set(email, user);
        }
      }
      if (input.userIds.some(id => !byId.has(id))) throw fail("One or more learners were not found", 404);
      const newEmails = emails.filter(email => !byEmail.has(email));
      let created: schema.User[] = [];
      if (newEmails.length) {
        const [tenant] = await tx.select().from(schema.tenants)
          .where(eq(schema.tenants.id, schedule.tenantId)).limit(1);
        if (!tenant || !z.string().uuid().safeParse(tenant.ssoTenantId).success) {
          throw fail("Configure this tenant's Microsoft Entra organization ID before pre-registering Microsoft users");
        }
        const usernameConflicts = await tx.select({ id: schema.users.id }).from(schema.users)
          .where(inArray(sql`lower(${schema.users.username})`, newEmails)).limit(1);
        if (usernameConflicts.length) throw fail("A work email is already used as a username; resolve this in Users first", 409);
        created = await tx.insert(schema.users).values(newEmails.map(email => ({
          username: email, email, password: "!microsoft-sign-in-only",
          role: "user", tenantId: schedule.tenantId, emailVerified: false,
          ssoProvider: "microsoft", ssoProviderId: null,
          company: tenant.defaultCompany ?? null, industry: tenant.defaultIndustry ?? null,
          country: tenant.defaultCountry ?? null, companySize: tenant.defaultCompanySize ?? null,
        }))).returning();
      }
      const candidates = new Map<string, schema.User>();
      for (const id of input.userIds) candidates.set(id, byId.get(id)!);
      for (const email of emails) {
        const user = byEmail.get(email) ?? created.find(user => user.email === email)!;
        candidates.set(user.id, user);
      }
      const existing = await tx.select({ userId: schema.mandatoryTrainingRecipients.userId })
        .from(schema.mandatoryTrainingRecipients).where(eq(schema.mandatoryTrainingRecipients.scheduleId, scheduleId));
      const assignedIds = new Set(existing.map(recipient => recipient.userId));
      const additions = [...candidates.values()].filter(user => !assignedIds.has(user.id));
      if (additions.length) {
        await tx.insert(schema.mandatoryTrainingRecipients).values(additions.map(user => ({
          scheduleId, userId: user.id, snapshotName: user.name || user.username, snapshotEmail: user.email,
        })));
      }
      // Existing recipients, content, dates, enrollments, completion records,
      // and email ledgers are untouched. All new learners get the whole set.
      return { addedCount: additions.length, createdCount: created.length };
    });
  } catch (error: any) {
    if (error.code === "23505") throw fail("An account was created concurrently for one of these emails; refresh and try again", 409);
    throw error;
  }
}