import { and, eq, gt, inArray, isNull, lte } from "drizzle-orm";
import { db } from "../db";
import { ObjectStorageService } from "../objectStorage";
import * as schema from "@shared/schema";
import { extractManagedObjectPaths } from "@shared/slides";
import { isPptxReviewPreviewPath } from "./pptx-review-paths";

export const PPTX_REVIEW_TTL_MS = 60 * 60 * 1000;
const PPTX_COMMIT_GRACE_MS = 24 * 60 * 60 * 1000;
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000;
const CLEANABLE_STATUSES: schema.PptxReviewStatus[] = [
  "committed",
  "cancelled",
  "expired",
  "failed",
];
function normalizePreviewPaths(paths: readonly string[]): string[] {
  return Array.from(new Set(paths.filter(isPptxReviewPreviewPath)));
}

function belongsToReviewSession(path: string, sessionId: string): boolean {
  const escapedSessionId = sessionId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`^/objects/slides/preview/${escapedSessionId}/[0-9a-f-]+\\.png$`, "i").test(path);
}

export function partitionPptxReviewAssets(opts: {
  previewPaths: readonly string[];
  retainedPaths: readonly string[];
  courseReferencedPaths: readonly string[];
}): { retainedPaths: string[]; deletablePaths: string[] } {
  const previewPaths = normalizePreviewPaths(opts.previewPaths);
  const previewSet = new Set(previewPaths);
  const retainedSet = new Set([
    ...opts.retainedPaths,
    ...opts.courseReferencedPaths,
  ].filter((path) => previewSet.has(path)));
  return {
    retainedPaths: previewPaths.filter((path) => retainedSet.has(path)),
    deletablePaths: previewPaths.filter((path) => !retainedSet.has(path)),
  };
}

export async function createPptxReviewSession(opts: {
  ownerUserId: string;
  ownerTenantId?: string | null;
  previewPaths?: string[];
}): Promise<schema.PptxReviewSession> {
  const suppliedPaths = opts.previewPaths ?? [];
  const previewPaths = normalizePreviewPaths(suppliedPaths);
  if (previewPaths.length !== new Set(suppliedPaths).size) {
    throw new Error("PowerPoint review generated an invalid preview path.");
  }
  const [session] = await db.insert(schema.pptxReviewSessions).values({
    ownerUserId: opts.ownerUserId,
    ownerTenantId: opts.ownerTenantId ?? null,
    previewPaths,
    retainedPaths: [],
    expiresAt: new Date(Date.now() + PPTX_REVIEW_TTL_MS),
  }).returning();
  return session;
}

export async function recordPptxReviewPreviewPaths(opts: {
  sessionId: string;
  ownerUserId: string;
  previewPaths: string[];
}): Promise<schema.PptxReviewSession> {
  const previewPaths = normalizePreviewPaths(opts.previewPaths);
  if (
    previewPaths.length !== new Set(opts.previewPaths).size ||
    previewPaths.some((path) => !belongsToReviewSession(path, opts.sessionId))
  ) {
    throw new Error("PowerPoint review generated an invalid session preview path.");
  }
  const [session] = await db.update(schema.pptxReviewSessions)
    .set({ previewPaths, updatedAt: new Date() })
    .where(and(
      eq(schema.pptxReviewSessions.id, opts.sessionId),
      eq(schema.pptxReviewSessions.ownerUserId, opts.ownerUserId),
      eq(schema.pptxReviewSessions.status, "active"),
    ))
    .returning();
  if (!session) throw new Error("PowerPoint review session is no longer active.");
  return session;
}

export async function getActivePptxReviewSession(
  sessionId: string,
  ownerUserId: string,
): Promise<schema.PptxReviewSession | undefined> {
  const [session] = await db.select()
    .from(schema.pptxReviewSessions)
    .where(and(
      eq(schema.pptxReviewSessions.id, sessionId),
      eq(schema.pptxReviewSessions.ownerUserId, ownerUserId),
      eq(schema.pptxReviewSessions.status, "active"),
      gt(schema.pptxReviewSessions.expiresAt, new Date()),
    ))
    .limit(1);
  return session;
}

export async function claimPptxReviewSessionForCommit(
  sessionId: string,
  ownerUserId: string,
): Promise<schema.PptxReviewSession | undefined> {
  const now = new Date();
  const [session] = await db.update(schema.pptxReviewSessions)
    .set({
      status: "committing",
      expiresAt: new Date(now.getTime() + PPTX_COMMIT_GRACE_MS),
      updatedAt: now,
    })
    .where(and(
      eq(schema.pptxReviewSessions.id, sessionId),
      eq(schema.pptxReviewSessions.ownerUserId, ownerUserId),
      eq(schema.pptxReviewSessions.status, "active"),
      gt(schema.pptxReviewSessions.expiresAt, now),
    ))
    .returning();
  return session;
}

async function findCourseReferencedPaths(candidatePaths: readonly string[]): Promise<string[]> {
  const candidates = new Set(candidatePaths);
  if (!candidates.size) return [];

  const referenced = new Set<string>();
  const [courseRows, lessonRows] = await Promise.all([
    db.select({ imageUrl: schema.courses.imageUrl }).from(schema.courses),
    db.select({ content: schema.lessons.content }).from(schema.lessons),
  ]);
  for (const course of courseRows) {
    if (course.imageUrl && candidates.has(course.imageUrl)) referenced.add(course.imageUrl);
  }
  for (const lesson of lessonRows) {
    for (const objectPath of extractManagedObjectPaths(lesson.content)) {
      if (candidates.has(objectPath)) referenced.add(objectPath);
    }
  }
  return Array.from(referenced);
}

async function cleanupPptxReviewSessionAssets(session: schema.PptxReviewSession): Promise<boolean> {
  const storage = new ObjectStorageService();
  let prefixedPaths: string[];
  try {
    prefixedPaths = await storage.listObjectPathsByPrefix(`slides/preview/${session.id}/`);
  } catch (error) {
    console.error(`[PPTX Review Cleanup] Could not enumerate assets for session ${session.id}`, error);
    return false;
  }
  const allPreviewPaths = normalizePreviewPaths([
    ...(session.previewPaths ?? []),
    ...prefixedPaths,
  ]).filter((path) => belongsToReviewSession(path, session.id));
  const existingRetained = normalizePreviewPaths(session.retainedPaths ?? []);
  const candidates = allPreviewPaths
    .filter((path) => !existingRetained.includes(path));

  let courseReferencedPaths: string[];
  try {
    courseReferencedPaths = await findCourseReferencedPaths(candidates);
  } catch (error) {
    console.error(`[PPTX Review Cleanup] Could not verify course references for session ${session.id}`, error);
    return false;
  }

  const partition = partitionPptxReviewAssets({
    previewPaths: allPreviewPaths,
    retainedPaths: existingRetained,
    courseReferencedPaths,
  });
  const deletionResults = await Promise.all(
    partition.deletablePaths.map((objectPath) => storage.deleteObjectByPath(objectPath)),
  );
  const cleanupComplete = deletionResults.every(Boolean);

  await db.update(schema.pptxReviewSessions)
    .set({
      retainedPaths: partition.retainedPaths,
      cleanupCompletedAt: cleanupComplete ? new Date() : null,
      updatedAt: new Date(),
    })
    .where(eq(schema.pptxReviewSessions.id, session.id));

  return cleanupComplete;
}

export async function completePptxReviewSession(opts: {
  sessionId: string;
  ownerUserId: string;
  courseId: string;
  retainedPaths: string[];
}): Promise<void> {
  const now = new Date();
  const [session] = await db.update(schema.pptxReviewSessions)
    .set({
      status: "committed",
      courseId: opts.courseId,
      retainedPaths: normalizePreviewPaths(opts.retainedPaths),
      cleanupCompletedAt: null,
      updatedAt: now,
    })
    .where(and(
      eq(schema.pptxReviewSessions.id, opts.sessionId),
      eq(schema.pptxReviewSessions.ownerUserId, opts.ownerUserId),
      eq(schema.pptxReviewSessions.status, "committing"),
    ))
    .returning();
  if (!session) {
    throw new Error("PowerPoint review session could not be finalized.");
  }
  await cleanupPptxReviewSessionAssets(session);
}

export async function failPptxReviewSession(sessionId: string, ownerUserId: string): Promise<void> {
  const [session] = await db.update(schema.pptxReviewSessions)
    .set({ status: "failed", cleanupCompletedAt: null, updatedAt: new Date() })
    .where(and(
      eq(schema.pptxReviewSessions.id, sessionId),
      eq(schema.pptxReviewSessions.ownerUserId, ownerUserId),
      eq(schema.pptxReviewSessions.status, "committing"),
    ))
    .returning();
  if (session) await cleanupPptxReviewSessionAssets(session);
}

export async function discardPptxReviewSession(sessionId: string, ownerUserId: string): Promise<void> {
  const [session] = await db.update(schema.pptxReviewSessions)
    .set({ status: "failed", cleanupCompletedAt: null, updatedAt: new Date() })
    .where(and(
      eq(schema.pptxReviewSessions.id, sessionId),
      eq(schema.pptxReviewSessions.ownerUserId, ownerUserId),
      eq(schema.pptxReviewSessions.status, "active"),
    ))
    .returning();
  if (session) await cleanupPptxReviewSessionAssets(session);
}

export async function cancelPptxReviewSession(sessionId: string, ownerUserId: string): Promise<boolean> {
  const [session] = await db.update(schema.pptxReviewSessions)
    .set({ status: "cancelled", cleanupCompletedAt: null, updatedAt: new Date() })
    .where(and(
      eq(schema.pptxReviewSessions.id, sessionId),
      eq(schema.pptxReviewSessions.ownerUserId, ownerUserId),
      eq(schema.pptxReviewSessions.status, "active"),
    ))
    .returning();
  if (!session) return false;
  await cleanupPptxReviewSessionAssets(session);
  return true;
}

export async function cleanupExpiredPptxReviewSessions(): Promise<number> {
  const now = new Date();
  await db.update(schema.pptxReviewSessions)
    .set({ status: "expired", cleanupCompletedAt: null, updatedAt: now })
    .where(and(
      inArray(schema.pptxReviewSessions.status, ["active", "committing"]),
      lte(schema.pptxReviewSessions.expiresAt, now),
    ));

  const pending = await db.select()
    .from(schema.pptxReviewSessions)
    .where(and(
      inArray(schema.pptxReviewSessions.status, CLEANABLE_STATUSES),
      isNull(schema.pptxReviewSessions.cleanupCompletedAt),
    ))
    .limit(50);

  let completed = 0;
  for (const session of pending) {
    if (await cleanupPptxReviewSessionAssets(session)) completed++;
  }
  return completed;
}

let cleanupIntervalId: NodeJS.Timeout | null = null;

export function startPptxReviewSessionCleanup(): void {
  if (cleanupIntervalId) return;
  const runCleanup = async () => {
    try {
      const cleaned = await cleanupExpiredPptxReviewSessions();
      if (cleaned > 0) {
        console.log(`[PPTX Review Cleanup] Completed ${cleaned} session cleanup(s)`);
      }
    } catch (error) {
      console.error("[PPTX Review Cleanup] Error cleaning review sessions", error);
    }
  };
  void runCleanup();
  cleanupIntervalId = setInterval(runCleanup, CLEANUP_INTERVAL_MS);
  cleanupIntervalId.unref?.();
}