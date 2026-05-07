/**
 * Academy service — DB helpers for Academies (Learning Sequences).
 *
 * Academies are ordered sequences of learning items. Each item is either an
 * internal course reference or an external link (LinkedIn Learning, Coursera,
 * etc.). Visibility + tenant sharing mirror the courses module (`courses` /
 * `courseTenants`), so the same access rules apply.
 */

import { db } from "../db";
import { and, eq, inArray, or, desc } from "drizzle-orm";
import * as schema from "@shared/schema";
import type {
  Academy, InsertAcademy,
  AcademyItem, InsertAcademyItem,
  Course,
} from "@shared/schema";

export interface AcademyListOptions {
  status?: string;
  statuses?: string[];
  tenantIds?: string[] | null; // null = global admin
}

export interface AcademyWithMeta extends Academy {
  itemCount: number;
}

export interface AcademyItemHydrated extends AcademyItem {
  course?: Pick<Course, "id" | "slug" | "title" | "summary" | "imageUrl" | "estimatedMinutes" | "status" | "visibility"> | null;
}

export interface AcademyFull extends Academy {
  items: AcademyItemHydrated[];
}

async function visibilityFilter(opts: AcademyListOptions): Promise<any | undefined> {
  if (opts.tenantIds === null) return undefined;
  const tenantIds = opts.tenantIds ?? [];
  if (tenantIds.length === 0) {
    return eq(schema.academies.visibility, "public");
  }
  const sharedRows = await db.select({ academyId: schema.academyTenants.academyId })
    .from(schema.academyTenants)
    .where(inArray(schema.academyTenants.tenantId, tenantIds));
  const sharedIds = sharedRows.map(r => r.academyId);

  const conds: any[] = [
    eq(schema.academies.visibility, "public"),
    inArray(schema.academies.ownerTenantId, tenantIds),
  ];
  if (sharedIds.length > 0) {
    conds.push(inArray(schema.academies.id, sharedIds));
  }
  return or(...conds);
}

export async function userCanViewAcademy(user: schema.User | undefined, academy: Academy): Promise<boolean> {
  if (academy.visibility === "public") return true;
  if (!user) return false;
  if (user.role === "global_admin") return true;
  if (user.tenantId && academy.ownerTenantId === user.tenantId) return true;
  if (user.tenantId) {
    const [shared] = await db.select().from(schema.academyTenants)
      .where(and(eq(schema.academyTenants.academyId, academy.id), eq(schema.academyTenants.tenantId, user.tenantId)))
      .limit(1);
    if (shared) return true;
  }
  return false;
}

export function userCanManageAcademy(user: schema.User | undefined, academy: Academy): boolean {
  if (!user) return false;
  if (user.role === "global_admin") return true;
  if (user.role !== "tenant_admin" && user.role !== "tenant_modeler") return false;
  return !!user.tenantId && academy.ownerTenantId === user.tenantId;
}

async function enrichAcademyList(rows: Academy[]): Promise<AcademyWithMeta[]> {
  if (rows.length === 0) return [];
  const ids = rows.map(r => r.id);
  const items = await db.select({ academyId: schema.academyItems.academyId })
    .from(schema.academyItems)
    .where(inArray(schema.academyItems.academyId, ids));
  const counts = new Map<string, number>();
  for (const i of items) counts.set(i.academyId, (counts.get(i.academyId) || 0) + 1);
  return rows.map(a => ({ ...a, itemCount: counts.get(a.id) || 0 }));
}

export async function listAcademies(opts: AcademyListOptions = {}): Promise<AcademyWithMeta[]> {
  const conds: any[] = [];
  if (opts.statuses && opts.statuses.length > 0) {
    conds.push(inArray(schema.academies.status, opts.statuses as any));
  } else if (opts.status) {
    conds.push(eq(schema.academies.status, opts.status as any));
  }
  const vis = await visibilityFilter(opts);
  if (vis) conds.push(vis);
  const rows = await db.select().from(schema.academies)
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(desc(schema.academies.updatedAt));
  return enrichAcademyList(rows);
}

export async function listAcademiesOwnedBy(
  tenantIds: string[] | null,
  statuses: string[],
): Promise<AcademyWithMeta[]> {
  const conds: any[] = [inArray(schema.academies.status, statuses as any)];
  if (tenantIds !== null) {
    if (tenantIds.length === 0) return [];
    conds.push(inArray(schema.academies.ownerTenantId, tenantIds));
  }
  const rows = await db.select().from(schema.academies)
    .where(and(...conds))
    .orderBy(desc(schema.academies.updatedAt));
  return enrichAcademyList(rows);
}

export async function getAcademyById(id: string): Promise<Academy | null> {
  const [row] = await db.select().from(schema.academies).where(eq(schema.academies.id, id)).limit(1);
  return row ?? null;
}

export async function getAcademyFull(idOrSlug: string): Promise<AcademyFull | null> {
  const [academy] = await db.select().from(schema.academies)
    .where(or(eq(schema.academies.id, idOrSlug), eq(schema.academies.slug, idOrSlug)))
    .limit(1);
  if (!academy) return null;
  const items = await db.select().from(schema.academyItems)
    .where(eq(schema.academyItems.academyId, academy.id))
    .orderBy(schema.academyItems.order);

  const courseIds = items.map(i => i.courseId).filter((id): id is string => !!id);
  const courseRows = courseIds.length > 0
    ? await db.select({
        id: schema.courses.id,
        slug: schema.courses.slug,
        title: schema.courses.title,
        summary: schema.courses.summary,
        imageUrl: schema.courses.imageUrl,
        estimatedMinutes: schema.courses.estimatedMinutes,
        status: schema.courses.status,
        visibility: schema.courses.visibility,
      })
        .from(schema.courses)
        .where(inArray(schema.courses.id, courseIds))
    : [];
  const courseById = new Map(courseRows.map(c => [c.id, c]));

  const hydrated: AcademyItemHydrated[] = items.map(i => ({
    ...i,
    course: i.courseId ? (courseById.get(i.courseId) ?? null) : null,
  }));

  return { ...academy, items: hydrated };
}

export async function createAcademy(data: InsertAcademy): Promise<Academy> {
  const [row] = await db.insert(schema.academies).values(data as any).returning();
  return row;
}

export async function updateAcademy(id: string, patch: Partial<InsertAcademy>): Promise<Academy | null> {
  const [row] = await db.update(schema.academies)
    .set({ ...patch, updatedAt: new Date() } as any)
    .where(eq(schema.academies.id, id)).returning();
  return row ?? null;
}

export async function archiveAcademy(id: string): Promise<Academy | null> {
  const [row] = await db.update(schema.academies)
    .set({ status: "archived", updatedAt: new Date() } as any)
    .where(eq(schema.academies.id, id)).returning();
  return row ?? null;
}

export async function deleteAcademy(id: string): Promise<void> {
  await db.delete(schema.academies).where(eq(schema.academies.id, id));
}

// ----- Items -----
export async function createAcademyItem(data: InsertAcademyItem): Promise<AcademyItem> {
  const [row] = await db.insert(schema.academyItems).values(data as any).returning();
  return row;
}

export async function updateAcademyItem(id: string, patch: Partial<InsertAcademyItem>): Promise<AcademyItem | null> {
  const [row] = await db.update(schema.academyItems).set(patch as any)
    .where(eq(schema.academyItems.id, id)).returning();
  return row ?? null;
}

export async function deleteAcademyItem(id: string): Promise<void> {
  await db.delete(schema.academyItems).where(eq(schema.academyItems.id, id));
}

export async function getAcademyForItem(itemId: string): Promise<Academy | null> {
  const [row] = await db.select({ academy: schema.academies })
    .from(schema.academyItems)
    .innerJoin(schema.academies, eq(schema.academyItems.academyId, schema.academies.id))
    .where(eq(schema.academyItems.id, itemId))
    .limit(1);
  return (row as any)?.academy ?? null;
}

export async function reorderAcademyItems(
  academyId: string,
  orderedIds: string[],
): Promise<void> {
  await db.transaction(async (tx) => {
    for (let i = 0; i < orderedIds.length; i++) {
      await tx.update(schema.academyItems)
        .set({ order: i })
        .where(and(
          eq(schema.academyItems.id, orderedIds[i]),
          eq(schema.academyItems.academyId, academyId),
        ));
    }
  });
}

// ----- Tenant share -----
export interface AcademyTenantShare {
  id: string;
  tenantId: string;
  tenantName: string;
  createdAt: Date;
}

export async function listAcademyTenants(academyId: string): Promise<AcademyTenantShare[]> {
  return await db
    .select({
      id: schema.academyTenants.id,
      tenantId: schema.academyTenants.tenantId,
      tenantName: schema.tenants.name,
      createdAt: schema.academyTenants.createdAt,
    })
    .from(schema.academyTenants)
    .innerJoin(schema.tenants, eq(schema.academyTenants.tenantId, schema.tenants.id))
    .where(eq(schema.academyTenants.academyId, academyId));
}

export async function addAcademyTenant(academyId: string, tenantId: string): Promise<schema.AcademyTenant> {
  const [row] = await db.insert(schema.academyTenants)
    .values({ academyId, tenantId })
    .onConflictDoNothing()
    .returning();
  if (row) return row;
  const [existing] = await db.select().from(schema.academyTenants)
    .where(and(eq(schema.academyTenants.academyId, academyId), eq(schema.academyTenants.tenantId, tenantId)))
    .limit(1);
  return existing;
}

export async function removeAcademyTenant(academyId: string, tenantId: string): Promise<boolean> {
  const rows = await db.delete(schema.academyTenants)
    .where(and(eq(schema.academyTenants.academyId, academyId), eq(schema.academyTenants.tenantId, tenantId)))
    .returning();
  return rows.length > 0;
}
