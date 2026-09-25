import { beforeEach, describe, expect, it, vi } from "vitest";
import { getTableName } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import * as schema from "@shared/schema";

const mockDb = vi.hoisted(() => ({
  select: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock("../../db", () => ({ db: mockDb }));

type Fixture = Record<string, any[]>;
let fixture: Fixture;
let service: typeof import("../mandatory-training-service");

function snakeToCamel(value: string) {
  return value.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase());
}

function rowMatches(row: Record<string, any>, where: any): boolean {
  if (!where) return true;
  const { sql, params } = new PgDialect().sqlToQuery(where);
  let matches = true;

  for (const match of sql.matchAll(/"[^"]+"\."([^"]+)"\s*=\s*\$(\d+)/g)) {
    const column = snakeToCamel(match[1]);
    matches = matches && row[column] === params[Number(match[2]) - 1];
  }
  for (const match of sql.matchAll(/"[^"]+"\."([^"]+)"\s+in\s+\(([^)]*)\)/g)) {
    const column = snakeToCamel(match[1]);
    const values = Array.from(match[2].matchAll(/\$(\d+)/g))
      .map(param => params[Number(param[1]) - 1]);
    matches = matches && values.includes(row[column]);
  }
  for (const match of sql.matchAll(/"[^"]+"\."([^"]+)"\s+is not null/g)) {
    matches = matches && row[snakeToCamel(match[1])] !== null && row[snakeToCamel(match[1])] !== undefined;
  }
  return matches;
}

function rowsFor(table: any, where?: any): any[] {
  const rows = fixture[getTableName(table)] ?? [];
  return rows.filter(row => rowMatches(row, where));
}

function installMockDb() {
  mockDb.select.mockImplementation(() => {
    let table: any;
    let where: any;
    const query: any = {
      from(value: any) {
        table = value;
        return query;
      },
      where(value: any) {
        where = value;
        return query;
      },
      limit(amount: number) {
        return Promise.resolve(rowsFor(table, where).slice(0, amount));
      },
      orderBy() {
        return Promise.resolve(rowsFor(table, where));
      },
      then(resolve: (value: any[]) => unknown, reject?: (reason: unknown) => unknown) {
        return Promise.resolve(rowsFor(table, where)).then(resolve, reject);
      },
    };
    return query;
  });
  mockDb.transaction.mockRejectedValue(new Error("Unexpected write in this test"));
}

function schedule(overrides: Record<string, any> = {}) {
  return {
    id: "schedule-a",
    tenantId: "tenant-a",
    title: "Required training",
    releaseAt: new Date("2030-01-01T00:00:00Z"),
    dueAt: new Date("2030-12-31T00:00:00Z"),
    createdBy: "admin-a",
    idempotencyKey: null,
    idempotencyHash: null,
    createdAt: new Date("2030-01-01T00:00:00Z"),
    ...overrides,
  };
}

function user(overrides: Record<string, any> = {}) {
  return {
    id: "learner-a",
    username: "learner-a",
    name: "Live Learner Name",
    email: "live@example.test",
    tenantId: "tenant-a",
    ...overrides,
  };
}

function recipient(overrides: Record<string, any> = {}) {
  return {
    id: "recipient-a",
    scheduleId: "schedule-a",
    userId: "learner-a",
    snapshotName: "Assigned Learner",
    snapshotEmail: "assigned@example.test",
    createdAt: new Date("2030-01-01T00:00:00Z"),
    ...overrides,
  };
}

function course(overrides: Record<string, any> = {}) {
  return {
    id: "course-a",
    slug: "safety-training",
    title: "Safety training",
    status: "published",
    visibility: "public",
    ownerTenantId: null,
    ...overrides,
  };
}

function model(overrides: Record<string, any> = {}) {
  return {
    id: "model-a",
    slug: "security-readiness",
    name: "Security readiness",
    status: "published",
    visibility: "public",
    modelClass: "organizational",
    ownerTenantId: "owner-tenant",
    ...overrides,
  };
}

function enrollment(overrides: Record<string, any> = {}) {
  return {
    id: "enrollment-a",
    courseId: "course-a",
    userId: "learner-a",
    tenantId: "tenant-a",
    status: "completed",
    progressPercent: 100,
    completedAt: new Date("2030-02-01T10:00:00Z"),
    ...overrides,
  };
}

function assessment(overrides: Record<string, any> = {}) {
  return {
    id: "assessment-a",
    userId: "learner-a",
    modelId: "model-a",
    tenantId: "owner-tenant",
    status: "completed",
    startedAt: new Date("2030-02-01T10:00:00Z"),
    completedAt: new Date("2030-02-02T10:00:00Z"),
    sessionId: null,
    importBatchId: null,
    isProxy: false,
    ...overrides,
  };
}

function item(id: string, kind: "course" | "assessment", contentId: string, snapshotTitle: string, order: number) {
  return {
    id,
    scheduleId: "schedule-a",
    order,
    kind,
    contentId,
    snapshotTitle,
  };
}

beforeEach(async () => {
  fixture = {};
  installMockDb();
  service = await import("../mandatory-training-service");
});

describe("mandatory training database-backed report paths", () => {
  it("keeps an assigned count but never hydrates a user from another tenant", async () => {
    fixture.mandatory_training_schedules = [schedule()];
    fixture.mandatory_training_items = [];
    fixture.mandatory_training_recipients = [recipient()];
    fixture.users = [user({ tenantId: "tenant-b", name: "Other Tenant Person", email: "other@example.test" })];
    fixture.mandatory_training_emails = [];

    const report = await service.getMandatoryTrainingReport("schedule-a");
    expect(report?.summary.recipientCount).toBe(1);
    expect(report?.summary.notStartedCount).toBe(1);
    expect(report?.recipients[0]).toMatchObject({
      userId: "learner-a",
      name: "Assigned Learner",
      email: "assigned@example.test",
    });
    expect(JSON.stringify(report)).not.toContain("Other Tenant Person");
    expect(JSON.stringify(report)).not.toContain("other@example.test");
  });

  it("rejects a recipient outside the selected tenant during schedule creation", async () => {
    fixture.tenants = [{ id: "tenant-a" }];
    fixture.users = [user({ tenantId: "tenant-b" })];
    const dueAt = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000);

    await expect(service.createMandatoryTraining({
      tenantId: "tenant-a",
      title: "Required training",
      dueAt,
      courseIds: ["course-a"],
      userIds: ["learner-a"],
    }, "admin-a")).rejects.toThrow("Recipients must be existing users in the selected tenant");
    expect(mockDb.transaction).not.toHaveBeenCalled();
  });

  it("rejects private content not accessible to the recipient tenant", async () => {
    fixture.tenants = [{ id: "tenant-a" }];
    fixture.users = [user()];
    fixture.courses = [course({ visibility: "private", ownerTenantId: "tenant-b" })];
    fixture.course_tenants = [];
    const dueAt = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000);

    await expect(service.createMandatoryTraining({
      tenantId: "tenant-a",
      title: "Required training",
      dueAt,
      courseIds: ["course-a"],
      userIds: ["learner-a"],
    }, "admin-a")).rejects.toThrow("unpublished or unavailable");
    expect(mockDb.transaction).not.toHaveBeenCalled();
  });

  it("rejects a private assessment model that is not shared with the learner tenant", async () => {
    fixture.tenants = [{ id: "tenant-a" }];
    fixture.users = [user()];
    fixture.models = [model({ visibility: "private", modelClass: "individual" })];
    fixture.model_tenants = [];
    const dueAt = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000);

    await expect(service.createMandatoryTraining({
      tenantId: "tenant-a",
      title: "Required training",
      dueAt,
      courseIds: [],
      modelId: "model-a",
      userIds: ["learner-a"],
    }, "admin-a")).rejects.toThrow("Assessment is unpublished or unavailable");
    expect(mockDb.transaction).not.toHaveBeenCalled();
  });

  it("reports existing course and eligible assessment completions, then exports the same filtered report", async () => {
    const completedCourseAt = new Date("2030-02-01T10:00:00Z");
    const completedAssessmentAt = new Date("2030-02-02T10:00:00Z");
    fixture.mandatory_training_schedules = [schedule()];
    fixture.mandatory_training_items = [
      item("item-course", "course", "course-a", "Safety training", 0),
      item("item-assessment", "assessment", "model-a", "Security readiness", 1),
    ];
    fixture.mandatory_training_recipients = [
      recipient(),
      recipient({
        id: "recipient-b",
        userId: "learner-b",
        snapshotName: "Not Started",
        snapshotEmail: "pending@example.test",
      }),
    ];
    fixture.users = [user(), user({
      id: "learner-b",
      username: "learner-b",
      name: "Pending Learner",
      email: "pending@example.test",
    })];
    fixture.mandatory_training_emails = [{
      id: "email-a",
      recipientId: "recipient-a",
      milestone: "release",
      status: "sent",
      claimedAt: new Date("2030-01-01T00:00:00Z"),
      sentAt: new Date("2030-01-01T00:01:00Z"),
      error: null,
    }];
    fixture.courses = [course()];
    fixture.course_enrollments = [enrollment({ completedAt: completedCourseAt })];
    fixture.models = [model()];
    fixture.assessments = [
      assessment({ completedAt: completedAssessmentAt }),
      assessment({ id: "anonymous", sessionId: "session-a", completedAt: new Date("2030-02-03T00:00:00Z") }),
      assessment({ id: "imported", importBatchId: "batch-a", completedAt: new Date("2030-02-04T00:00:00Z") }),
      assessment({ id: "proxy", isProxy: true, completedAt: new Date("2030-02-05T00:00:00Z") }),
    ];
    fixture.results = [{
      id: "result-a",
      assessmentId: "assessment-a",
      overallScore: 84,
      label: "Ready",
      dimensionScores: {},
      createdAt: completedAssessmentAt,
    }];

    const report = await service.getMandatoryTrainingReport("schedule-a");
    const completed = report?.recipients.find(row => row.userId === "learner-a");
    expect(completed?.status).toBe("completed");
    expect(completed?.completedAt).toEqual(completedAssessmentAt);
    expect(completed?.items).toMatchObject([
      { status: "completed", completedAt: completedCourseAt, progressPercent: 100 },
      { status: "completed", completedAt: completedAssessmentAt, score: 84, resultLabel: "Ready" },
    ]);
    expect(report?.emails).toMatchObject([{ name: "Assigned Learner", status: "sent" }]);
    expect(report?.emailSummary.sent).toBe(1);

    const csv = await service.getMandatoryTrainingExport("schedule-a", "completed");
    expect(csv).toContain('"Assigned Learner"');
    expect(csv).not.toContain('"Not Started"');
    expect(csv.split("\r\n")).toHaveLength(3);
    expect(csv).toContain('"2030-02-01T10:00:00.000Z"');
    expect(csv).toContain('"2030-02-02T10:00:00.000Z"');
    expect(csv).toContain('"84","Ready"');
  });
});