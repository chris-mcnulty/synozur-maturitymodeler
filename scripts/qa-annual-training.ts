/**
 * Development-only QA harness for the annual training courses.
 *
 * Draft courses are hidden from learners, so learner behavior (answer-key
 * redaction, sequential unlocking, quiz grading, attestation) is tested on a
 * throwaway copy imported from the course export into an isolated QA tenant
 * with learner test accounts on the reserved .invalid domain. The real draft is
 * never published or enrolled, and no admin account is created. Setup records
 * every ID it creates in a state file; teardown deletes only those records
 * (the copy, the media its import created, the test accounts with their
 * enrollments, and the QA tenant).
 *
 *   npx tsx scripts/qa-annual-training.ts setup <export.orion-course.json>
 *   npx tsx scripts/qa-annual-training.ts reset-learners   (delete QA accounts' enrollments)
 *   npx tsx scripts/qa-annual-training.ts teardown
 *
 * Runs only from the development workspace (see dev-guard).
 */
import fs from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { and, eq, inArray, like } from "drizzle-orm";
import { db } from "../server/db";
import * as schema from "../shared/schema";
import { hashPassword } from "../server/utils/password";
import { ObjectStorageService } from "../server/objectStorage";
import { importCourse, validateCourseExportDoc } from "../server/services/course-import-export";
import { assertDevelopmentWorkspace } from "../courseware/annual-training/shared/dev-guard";

const QA_TENANT_NAME = "Orion QA (temporary, annual training tests)";
const QA_EMAIL_DOMAIN = "annual-training-qa.invalid";
const COPY_PREFIX = "qa-copy-";
const STATE_FILE = "/tmp/annual-training-qa.json";

async function setup(exportFile: string) {
  const doc = JSON.parse(await fs.readFile(exportFile, "utf8"));
  validateCourseExportDoc(doc);
  const [synozur] = await db.select({ tenantId: schema.tenantDomains.tenantId }).from(schema.tenantDomains)
    .where(eq(schema.tenantDomains.domain, "synozur.com"));
  if (!synozur) throw new Error("Synozur tenant not found");
  const [realCourse] = await db.select().from(schema.courses).where(eq(schema.courses.slug, doc.course.slug));
  if (!realCourse) throw new Error(`Real draft ${doc.course.slug} not found`);

  const [existingTenant] = await db.select().from(schema.tenants).where(eq(schema.tenants.name, QA_TENANT_NAME));
  if (existingTenant) throw new Error("QA tenant already exists; run teardown first.");
  const [qaTenant] = await db.insert(schema.tenants).values({ name: QA_TENANT_NAME, autoCreateUsers: false, allowUserSelfProvisioning: false }).returning();

  const password = `Qa-${randomBytes(9).toString("base64url")}`;
  const hashed = await hashPassword(password);
  const people = [
    { key: "synozurLearner", username: "qa-annual-synozur-learner", role: "user", tenantId: synozur.tenantId },
    { key: "qaLearner", username: "qa-annual-learner", role: "user", tenantId: qaTenant.id },
  ] as const;
  const users: Record<string, { id: string; username: string; role: string; tenantId: string | null }> = {};
  for (const p of people) {
    const [u] = await db.insert(schema.users).values({
      username: p.username,
      password: hashed,
      email: `${p.username}@${QA_EMAIL_DOMAIN}`,
      name: `QA ${p.key}`,
      role: p.role,
      tenantId: p.tenantId,
      emailVerified: true,
    } as any).returning();
    users[p.key] = { id: u.id, username: u.username, role: u.role, tenantId: u.tenantId };
  }

  const copySlug = `${COPY_PREFIX}${doc.course.slug}`;
  const imported = await importCourse(doc, { slug: copySlug, ownerTenantId: qaTenant.id, createdBy: realCourse.createdBy ?? undefined, visibility: "private" });
  await db.update(schema.courses).set({ status: "published" }).where(eq(schema.courses.id, imported.course.id));
  // Import re-uploads every asset to a fresh path, so the paths in the copy
  // belong to the copy alone. Record them so teardown deletes nothing else.
  const copyObjects = new Set<string>();
  managedPaths(imported.course.imageUrl, copyObjects);
  for (const l of await copyLessons(imported.course.id)) managedPaths(l.content, copyObjects);
  const realObjects = new Set<string>();
  managedPaths(realCourse.imageUrl, realObjects);
  for (const l of await copyLessons(realCourse.id)) managedPaths(l.content, realObjects);
  if ([...copyObjects].some(p => realObjects.has(p))) throw new Error("Copy shares media paths with the real draft; run teardown and investigate.");

  const state = {
    password,
    qaTenantId: qaTenant.id,
    synozurTenantId: synozur.tenantId,
    users,
    realCourse: { id: realCourse.id, slug: realCourse.slug, status: realCourse.status },
    copy: { id: imported.course.id, slug: copySlug, lessons: imported.lessonCount, objects: [...copyObjects] },
  };
  await fs.rm(STATE_FILE, { force: true });
  await fs.writeFile(STATE_FILE, JSON.stringify(state, null, 2), { mode: 0o600, flag: "wx" });
  console.log(JSON.stringify({ ...state, password: `(written to ${STATE_FILE})` }, null, 2));
}

function managedPaths(value: unknown, out: Set<string>) {
  if (typeof value === "string") {
    if (/^\/objects\/(uploads|narration|slides)\//.test(value)) out.add(value);
  } else if (Array.isArray(value)) {
    value.forEach(v => managedPaths(v, out));
  } else if (value && typeof value === "object") {
    Object.values(value).forEach(v => managedPaths(v, out));
  }
}

async function copyLessons(courseId: string) {
  return db.select({ content: schema.lessons.content }).from(schema.lessons)
    .innerJoin(schema.courseModules, eq(schema.courseModules.id, schema.lessons.moduleId))
    .where(eq(schema.courseModules.courseId, courseId));
}

async function readState() {
  const text = await fs.readFile(STATE_FILE, "utf8").catch(() => null);
  if (!text) throw new Error(`No QA state file at ${STATE_FILE}; nothing recorded to clean up.`);
  return JSON.parse(text) as {
    qaTenantId: string;
    users: Record<string, { id: string }>;
    copy: { id: string; slug: string; objects: string[] };
  };
}

async function resetLearners() {
  const state = await readState();
  const rows = await db.delete(schema.courseEnrollments).where(and(
    eq(schema.courseEnrollments.courseId, state.copy.id),
    inArray(schema.courseEnrollments.userId, Object.values(state.users).map(u => u.id)),
  )).returning({ id: schema.courseEnrollments.id });
  console.log(JSON.stringify({ removedEnrollments: rows.length }));
}

async function teardown() {
  const state = await readState();
  const userIds = Object.values(state.users).map(u => u.id);
  // Deleting the copy cascades to its modules, lessons, enrollments, progress,
  // and attestation records. Deleting the users cascades to anything else they
  // created (for example an attempt to enroll elsewhere).
  const removedCourses = await db.delete(schema.courses).where(and(
    eq(schema.courses.id, state.copy.id),
    eq(schema.courses.slug, state.copy.slug),
    eq(schema.courses.ownerTenantId, state.qaTenantId),
  )).returning({ id: schema.courses.id });
  const storage = new ObjectStorageService();
  let removedObjects = 0;
  for (const p of state.copy.objects) if (await storage.deleteObjectByPath(p).catch(() => false)) removedObjects++;
  const removedUsers = userIds.length
    ? await db.delete(schema.users).where(and(inArray(schema.users.id, userIds), like(schema.users.email, `%@${QA_EMAIL_DOMAIN}`))).returning({ id: schema.users.id })
    : [];
  const removedTenant = await db.delete(schema.tenants).where(and(eq(schema.tenants.id, state.qaTenantId), eq(schema.tenants.name, QA_TENANT_NAME))).returning({ id: schema.tenants.id });
  await fs.rm(STATE_FILE, { force: true });
  console.log(JSON.stringify({ removedCourses: removedCourses.length, removedObjects, removedUsers: removedUsers.length, removedTenant: removedTenant.length === 1 }, null, 2));
}

async function main() {
  assertDevelopmentWorkspace();
  const [cmd, arg] = process.argv.slice(2);
  if (cmd === "setup" && arg) return setup(arg);
  if (cmd === "teardown") return teardown();
  if (cmd === "reset-learners") return resetLearners();
  throw new Error("Usage: qa-annual-training.ts setup <export.json> | reset-learners | teardown");
}

main()
  .catch(error => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => process.exit());
