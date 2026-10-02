import { beforeEach, describe, expect, it, vi } from "vitest";
import * as schema from "@shared/schema";

const mock = vi.hoisted(() => ({
  rows: [] as any[][],
  writes: [] as Array<{ table: any; values: any }>,
  locked: false,
}));
vi.mock("../../db", () => {
  const db: any = {
    select: () => {
      const rows = mock.rows.shift() ?? [];
      const builder: any = {
        from: () => builder, where: () => builder, limit: () => builder,
        for: () => { mock.locked = true; return builder; },
        then: (resolve: any, reject: any) => Promise.resolve(rows).then(resolve, reject),
      };
      return builder;
    },
    insert: (table: any) => ({
      values: async (values: any) => { mock.writes.push({ table, values }); },
    }),
    transaction: (callback: any) => callback(db),
  };
  return { db };
});
import { addRequiredCourses, addRequiredCoursesSchema, hasRequiredTraining } from "../mandatory-training-service";

const schedule = { id: "set", tenantId: "tenant-a", dueAt: new Date("2030-01-01") };
const existing = [{ id: "old-item", kind: "course", contentId: "old", order: 3, snapshotTitle: "Original" }];
const course = { id: "new", title: "New course", status: "published", visibility: "private", ownerTenantId: "tenant-a" };

beforeEach(() => { mock.rows = []; mock.writes = []; mock.locked = false; });

describe("required training additions", () => {
  it("appends courses under a schedule lock without changing recipients, dates, or completions", async () => {
    mock.rows = [[schedule], existing, [course]];
    expect(await addRequiredCourses("set", { courseIds: ["new"] }, "tenant-a")).toEqual({ schedule, addedCount: 1 });
    expect(mock.locked).toBe(true);
    expect(mock.writes).toEqual([{ table: schema.mandatoryTrainingItems, values: [
      { scheduleId: "set", order: 4, kind: "course", contentId: "new", snapshotTitle: "New course" },
    ] }]);
    expect(existing[0].snapshotTitle).toBe("Original");
  });
  it("rejects another tenant before reading items or changing data", async () => {
    mock.rows = [[schedule]];
    await expect(addRequiredCourses("set", { courseIds: ["new"] }, "tenant-b")).rejects.toMatchObject({ statusCode: 403 });
    expect(mock.writes).toHaveLength(0);
  });
  it("allows a global administrator to add courses to the selected tenant's set", async () => {
    mock.rows = [[schedule], existing, [course]];
    expect((await addRequiredCourses("set", { courseIds: ["new"] }, null)).addedCount).toBe(1);
  });
  it("does not duplicate an existing course on a retry", async () => {
    mock.rows = [[schedule], existing];
    expect((await addRequiredCourses("set", { courseIds: ["old"] }, "tenant-a")).addedCount).toBe(0);
    expect(mock.writes).toHaveLength(0);
  });
  it("rejects unpublished or unshared courses without partial additions", async () => {
    for (const unavailable of [{ ...course, status: "draft" }, { ...course, ownerTenantId: "tenant-b" }]) {
      mock.rows = [[schedule], existing, [unavailable], []];
      await expect(addRequiredCourses("set", { courseIds: ["new"] }, "tenant-a")).rejects.toMatchObject({ statusCode: 400 });
    }
    expect(mock.writes).toHaveLength(0);
  });
  it("rejects missing sets and missing courses", async () => {
    mock.rows = [[]];
    await expect(addRequiredCourses("missing", { courseIds: ["new"] }, "tenant-a")).rejects.toMatchObject({ statusCode: 404 });
    mock.rows = [[schedule], existing, []];
    await expect(addRequiredCourses("set", { courseIds: ["missing"] }, "tenant-a")).rejects.toMatchObject({ statusCode: 404 });
  });
  it("requires a nonempty, unique course list and forbids unrelated edits", () => {
    for (const input of [{ courseIds: [] }, { courseIds: ["new", "new"] }, { courseIds: ["new"], tenantId: "tenant-b" }]) {
      expect(addRequiredCoursesSchema.safeParse(input).success).toBe(false);
    }
  });
});

describe("tenant-specific required training visibility", () => {
  it("hides training for users without a tenant or tenants without a set", async () => {
    expect(await hasRequiredTraining(null)).toBe(false);
    mock.rows = [[]];
    expect(await hasRequiredTraining("empty-tenant")).toBe(false);
  });
  it("shows training when the authenticated tenant has a set", async () => {
    mock.rows = [[{ id: "set" }]];
    expect(await hasRequiredTraining("tenant-a")).toBe(true);
  });
});