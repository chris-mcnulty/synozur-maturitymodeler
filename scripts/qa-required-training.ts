/**
 * Disposable development-only fixtures for required-training UI verification.
 * No real courses or users are modified; teardown uses recorded IDs only.
 */
import fs from "node:fs/promises";
import { randomUUID, randomBytes } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import { db, pool } from "../server/db";
import * as s from "../shared/schema";
import { hashPassword } from "../server/utils/password";
import { assertDevelopmentWorkspace } from "../courseware/annual-training/shared/dev-guard";

const file = "/tmp/required-training-qa.json";
async function setup() {
  try { await fs.access(file); throw new Error("QA state already exists; teardown first"); }
  catch (error: any) { if (error.code !== "ENOENT") throw error; }
  const suffix = randomUUID().slice(0, 8);
  const password = randomBytes(18).toString("hex");
  const tenantId = randomUUID(), emptyTenantId = randomUUID(), scheduleId = randomUUID();
  const originalCourseId = randomUUID(), newCourseId = randomUUID();
  const users = [
    { id: randomUUID(), username: `required-admin-${suffix}@qa.invalid`, role: "tenant_admin", tenantId },
    { id: randomUUID(), username: `required-learner-${suffix}@qa.invalid`, role: "user", tenantId },
    { id: randomUUID(), username: `required-empty-${suffix}@qa.invalid`, role: "tenant_admin", tenantId: emptyTenantId },
  ];
  const state = { tenantId, emptyTenantId, scheduleId, originalCourseId, newCourseId, password, users, suffix };
  await fs.writeFile(file, JSON.stringify(state), { mode: 0o600, flag: "wx" });
  const hashed = await hashPassword(password);
  await db.transaction(async tx => {
    await tx.insert(s.tenants).values([
      { id: tenantId, name: `Required training QA ${suffix}`, slug: `required-qa-${suffix}` },
      { id: emptyTenantId, name: `No training QA ${suffix}`, slug: `required-empty-${suffix}` },
    ]);
    await tx.insert(s.users).values(users.map(user => ({
      ...user, email: null, name: user.role === "user" ? "QA Required Learner" : "QA Training Admin",
      password: hashed, emailVerified: true,
    })));
    await tx.insert(s.courses).values([
      { id: originalCourseId, slug: `qa-completed-${suffix}`, title: `QA completed course ${suffix}`, status: "published", visibility: "private", ownerTenantId: tenantId },
      { id: newCourseId, slug: `qa-new-${suffix}`, title: `QA new required course ${suffix}`, status: "published", visibility: "private", ownerTenantId: tenantId },
    ]);
    const moduleId = randomUUID();
    await tx.insert(s.courseModules).values({ id: moduleId, courseId: newCourseId, title: "QA module", order: 0 });
    await tx.insert(s.lessons).values({ moduleId, title: "QA lesson", type: "rich_text", order: 0, content: { html: "<p>Disposable QA course.</p>" } });
    await tx.insert(s.courseEnrollments).values({
      courseId: originalCourseId, userId: users[1].id, tenantId, status: "completed",
      progressPercent: 100, completedAt: new Date(Date.now() - 3_600_000),
    });
    await tx.insert(s.mandatoryTrainingSchedules).values({
      id: scheduleId, tenantId, title: `QA Annual Required Training ${suffix}`,
      releaseAt: new Date(Date.now() - 3_600_000), dueAt: new Date(Date.now() + 30 * 86_400_000), createdBy: users[0].id,
    });
    await tx.insert(s.mandatoryTrainingItems).values({
      scheduleId, kind: "course", contentId: originalCourseId, snapshotTitle: `QA completed course ${suffix}`, order: 0,
    });
    // Neither the live account nor the snapshot has an email address:
    // the worker reads the live user record and cannot send QA mail.
    await tx.insert(s.mandatoryTrainingRecipients).values({
      scheduleId, userId: users[1].id, snapshotName: "QA Required Learner", snapshotEmail: null,
    });
  });
  console.log("Disposable required-training fixtures created; details in /tmp/required-training-qa.json");
}

async function teardown() {
  const state = JSON.parse(await fs.readFile(file, "utf8"));
  await db.transaction(async tx => {
    await tx.delete(s.mandatoryTrainingSchedules).where(eq(s.mandatoryTrainingSchedules.id, state.scheduleId));
    await tx.delete(s.courses).where(inArray(s.courses.id, [state.originalCourseId, state.newCourseId]));
    await tx.delete(s.users).where(inArray(s.users.id, state.users.map((user: any) => user.id)));
    await tx.delete(s.tenants).where(inArray(s.tenants.id, [state.tenantId, state.emptyTenantId]));
  });
  await fs.rm(file);
  console.log("Removed only the recorded QA fixtures.");
}

async function main() {
  assertDevelopmentWorkspace();
  if (process.argv[2] === "setup") await setup();
  else if (process.argv[2] === "teardown") await teardown();
  else throw new Error("Usage: NODE_ENV=development npx tsx scripts/qa-required-training.ts setup|teardown");
}
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => pool.end());