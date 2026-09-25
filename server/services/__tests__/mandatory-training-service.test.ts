import { describe, expect, it } from "vitest";
import {
  createMandatoryTrainingSchema,
  isEligibleTrainingAssessment,
  isMandatoryTrainingStatus,
  mandatoryTrainingStatus,
  summarizeAssignedItems,
  formatMandatoryTrainingCsv,
  mandatoryTrainingRequestHash,
} from "../mandatory-training-service";

const releaseAt = new Date(Date.now() + 60_000).toISOString();
const validInput = {
  tenantId: "tenant-1",
  title: "Annual compliance",
  releaseAt,
  dueAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
  courseIds: ["course-1"],
  userIds: ["user-1"],
};

describe("mandatory training validation and completion status", () => {
  it("accepts valid tenant schedules and normalizes dates", () => {
    const parsed = createMandatoryTrainingSchema.parse(validInput);
    expect(parsed.releaseAt).toBeInstanceOf(Date);
    expect(parsed.courseIds).toEqual(["course-1"]);
  });

  it("requires unique recipients, unique items, and at least one learning item", () => {
    expect(createMandatoryTrainingSchema.safeParse({
      ...validInput, userIds: ["user-1", "user-1"],
    }).success).toBe(false);
    expect(createMandatoryTrainingSchema.safeParse({
      ...validInput, courseIds: ["course-1", "course-1"],
    }).success).toBe(false);
    expect(createMandatoryTrainingSchema.safeParse({
      ...validInput, courseIds: [], modelId: null,
    }).success).toBe(false);
  });

  it("rejects a due date that is not after release", () => {
    expect(createMandatoryTrainingSchema.safeParse({
      ...validInput, dueAt: validInput.releaseAt,
    }).success).toBe(false);
  });

  it("defaults the release date at creation and rejects due dates already passed", () => {
    const { releaseAt: _releaseAt, ...withoutRelease } = validInput;
    expect(createMandatoryTrainingSchema.parse(withoutRelease).releaseAt).toBeUndefined();
    expect(createMandatoryTrainingSchema.safeParse({
      ...validInput, dueAt: "2000-01-01T00:00:00.000Z",
    }).success).toBe(false);
  });

  it("uses stable idempotency hashes and accepts only report status filters", () => {
    const first = createMandatoryTrainingSchema.parse({
      ...validInput, userIds: ["user-1", "user-2"],
    });
    const reorderedUsers = createMandatoryTrainingSchema.parse({
      ...validInput, userIds: ["user-2", "user-1"],
    });
    expect(mandatoryTrainingRequestHash(first)).toBe(mandatoryTrainingRequestHash(reorderedUsers));
    expect(isMandatoryTrainingStatus("completed")).toBe(true);
    expect(isMandatoryTrainingStatus("claimed")).toBe(false);
  });

  it("classifies completion, in-progress work, and overdue assignments", () => {
    const dueAt = new Date("2030-02-01T00:00:00.000Z");
    const now = new Date("2030-02-02T00:00:00.000Z");
    expect(mandatoryTrainingStatus(new Date("2030-01-15T00:00:00Z"), false, dueAt, now)).toBe("completed");
    expect(mandatoryTrainingStatus(null, true, dueAt, now)).toBe("overdue");
    expect(mandatoryTrainingStatus(null, true, dueAt, new Date("2030-01-15T00:00:00Z"))).toBe("in_progress");
    expect(mandatoryTrainingStatus(null, false, dueAt, new Date("2030-01-15T00:00:00Z"))).toBe("not_started");
  });

  it("only counts a real assessment completed by the assigned user in the same tenant", () => {
    const assessment = {
      userId: "user-1",
      tenantId: "tenant-1",
      isProxy: false,
      sessionId: null,
      importBatchId: null,
    };
    expect(isEligibleTrainingAssessment(assessment, "tenant-1", "user-1")).toBe(true);
    expect(isEligibleTrainingAssessment({ ...assessment, sessionId: "anonymous-session" }, "tenant-1", "user-1")).toBe(false);
    expect(isEligibleTrainingAssessment({ ...assessment, isProxy: true }, "tenant-1", "user-1")).toBe(false);
    expect(isEligibleTrainingAssessment({ ...assessment, importBatchId: "batch-1" }, "tenant-1", "user-1")).toBe(false);
    expect(isEligibleTrainingAssessment({ ...assessment, tenantId: "tenant-2" }, "tenant-1", "user-1")).toBe(false);
    expect(isEligibleTrainingAssessment({ ...assessment, userId: "user-2" }, "tenant-1", "user-1")).toBe(false);
    expect(isEligibleTrainingAssessment({ ...assessment, tenantId: "model-owner" }, "tenant-1", "user-1", "model-owner")).toBe(true);
  });

  it("requires every item before a mixed schedule is complete and uses the latest completion date", () => {
    const due = new Date("2030-02-01T00:00:00Z");
    const beforeDue = new Date("2030-01-20T00:00:00Z");
    const course = { itemId: "course", kind: "course" as const, title: "Course", status: "completed" as const,
      completedAt: new Date("2030-01-10T00:00:00Z"), progressPercent: 100, score: null, resultLabel: null, href: null };
    const assessment = { ...course, itemId: "assessment", kind: "assessment" as const,
      title: "Assessment", completedAt: new Date("2030-01-18T00:00:00Z"), score: 82 };
    expect(summarizeAssignedItems([course, { ...assessment, status: "not_started", completedAt: null }], due, beforeDue).status).toBe("in_progress");
    expect(summarizeAssignedItems([course, assessment], due, beforeDue)).toEqual({
      status: "completed", completedAt: assessment.completedAt,
    });
    expect(summarizeAssignedItems([course, { ...assessment, status: "in_progress", completedAt: null }], due, new Date("2030-02-02")).status).toBe("overdue");
  });

  it("exports the same filtered recipients and per-item results as the report", () => {
    const row = { userId: "u1", name: "=A1", email: "learner@example.test", status: "completed" as const,
      completedAt: new Date("2030-01-18T00:00:00Z"), emailMilestones: [],
      items: [{ itemId: "i1", kind: "assessment" as const, title: "Assessment", status: "completed" as const,
        completedAt: new Date("2030-01-18T00:00:00Z"), progressPercent: 0, score: 82, resultLabel: "Ready", href: null }] };
    const pending = { ...row, userId: "u2", name: "Pending", status: "not_started" as const, completedAt: null };
    const csv = formatMandatoryTrainingCsv([row, pending], "completed");
    expect(csv).toContain('"\'=A1"');
    expect(csv).toContain('"82","Ready"');
    expect(csv).not.toContain("Pending");
  });
});