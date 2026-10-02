import { beforeEach, describe, expect, it, vi } from "vitest";
import * as schema from "@shared/schema";

const mock = vi.hoisted(() => ({ rows: [] as any[][], writes: [] as Array<{ table: any; values: any }>, locked: false }));
vi.mock("../../db", () => {
  const db: any = {
    select: () => {
      const rows = mock.rows.shift() ?? [];
      const builder: any = { from: () => builder, where: () => builder, limit: () => builder,
        for: () => { mock.locked = true; return builder; },
        then: (resolve: any, reject: any) => Promise.resolve(rows).then(resolve, reject) };
      return builder;
    },
    insert: (table: any) => ({
      values: (values: any[]) => {
        mock.writes.push({ table, values });
        const result = values.map((value, index) => ({ id: `created-${index}`, ...value }));
        const builder: any = { returning: async () => result,
          then: (resolve: any, reject: any) => Promise.resolve(result).then(resolve, reject) };
        return builder;
      },
    }),
    transaction: (callback: any) => callback(db),
  };
  return { db };
});
import { addRequiredLearners, addRequiredLearnersSchema } from "../required-training-learners";

const schedule = { id: "set", tenantId: "tenant-a" };
const learner = { id: "learner", name: "Learner", username: "learner", email: "learner@example.test", tenantId: "tenant-a" };
const tenant = { id: "tenant-a", ssoTenantId: "4dfe2f01-df7a-4ac4-b87e-d4630d06e12a" };
beforeEach(() => { mock.rows = []; mock.writes = []; mock.locked = false; });

describe("adding required training learners", () => {
  it("adds existing tenant users without changing dates, courses, progress, or existing email history", async () => {
    mock.rows = [[schedule], [learner], [{ userId: "original" }]];
    expect(await addRequiredLearners("set", { userIds: ["learner"] }, "tenant-a")).toEqual({ addedCount: 1, createdCount: 0 });
    expect(mock.locked).toBe(true);
    expect(mock.writes).toEqual([{ table: schema.mandatoryTrainingRecipients, values: [{
      scheduleId: "set", userId: "learner", snapshotName: "Learner", snapshotEmail: "learner@example.test",
    }] }]);
  });
  it("does not duplicate existing recipients on retry", async () => {
    mock.rows = [[schedule], [learner], [{ userId: learner.id }]];
    expect((await addRequiredLearners("set", { userIds: [learner.id] }, null)).addedCount).toBe(0);
    expect(mock.writes).toHaveLength(0);
  });
  it("pre-registers normalized Microsoft emails with no usable local password and unverified email", async () => {
    mock.rows = [[schedule], [], [tenant], [], []];
    expect(await addRequiredLearners("set", { entraEmails: [" NEW@Example.Test ", "new@example.test"] }, "tenant-a"))
      .toEqual({ addedCount: 1, createdCount: 1 });
    expect(mock.writes[0].table).toBe(schema.users);
    expect(mock.writes[0].values[0]).toMatchObject({
      username: "new@example.test", email: "new@example.test", role: "user", tenantId: "tenant-a",
      ssoProvider: "microsoft", ssoProviderId: null, emailVerified: false, password: "!microsoft-sign-in-only",
    });
    expect(mock.writes[1].table).toBe(schema.mandatoryTrainingRecipients);
  });
  it("reuses an existing same-tenant account entered by email, including overlap with selected IDs", async () => {
    mock.rows = [[schedule], [learner], []];
    expect(await addRequiredLearners("set", { userIds: [learner.id], entraEmails: ["learner@example.test"] }, "tenant-a"))
      .toEqual({ addedCount: 1, createdCount: 0 });
    expect(mock.writes).toHaveLength(1);
  });
  it("requires a configured Entra organization before creating accounts", async () => {
    mock.rows = [[schedule], [], [{ ...tenant, ssoTenantId: null }]];
    await expect(addRequiredLearners("set", { entraEmails: ["new@example.test"] }, "tenant-a"))
      .rejects.toMatchObject({ statusCode: 400 });
    expect(mock.writes).toHaveLength(0);
  });
  it("blocks another tenant's schedule and another tenant's users without moving accounts", async () => {
    mock.rows = [[schedule]];
    await expect(addRequiredLearners("set", { userIds: [learner.id] }, "tenant-b")).rejects.toMatchObject({ statusCode: 403 });
    mock.rows = [[schedule], [{ ...learner, tenantId: "tenant-b" }]];
    await expect(addRequiredLearners("set", { entraEmails: [learner.email] }, "tenant-a")).rejects.toMatchObject({ statusCode: 403 });
    expect(mock.writes).toHaveLength(0);
  });
  it("rejects unknown learners and username collisions before creating accounts", async () => {
    mock.rows = [[schedule], []];
    await expect(addRequiredLearners("set", { userIds: ["missing"] }, "tenant-a")).rejects.toMatchObject({ statusCode: 404 });
    mock.rows = [[schedule], [], [tenant], [{ id: "conflict" }]];
    await expect(addRequiredLearners("set", { entraEmails: ["new@example.test"] }, "tenant-a")).rejects.toMatchObject({ statusCode: 409 });
    expect(mock.writes).toHaveLength(0);
  });
  it("rejects empty inputs, invalid emails, duplicate IDs, and role or tenant overrides", () => {
    for (const input of [{}, { entraEmails: ["not-an-email"] }, { userIds: ["a", "a"] },
      { entraEmails: ["new@example.test"], role: "global_admin" }, { userIds: ["a"], tenantId: "tenant-b" }]) {
      expect(addRequiredLearnersSchema.safeParse(input).success).toBe(false);
    }
  });
});