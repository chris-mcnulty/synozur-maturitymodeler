import { describe, expect, it } from "vitest";
import { summaryCacheKey } from "../../server/services/ai-service";

describe("AI summary cache key", () => {
  it("separates summaries by nested profile fields", () => {
    const context = { promptVersion: "test", userContext: { jobTitle: "Analyst", industry: "Education" } };
    const first = summaryCacheKey("maturity_summary", context);
    expect(summaryCacheKey("maturity_summary", {
      userContext: { industry: "Education", jobTitle: "Analyst" },
      promptVersion: "test",
    })).toBe(first);
    expect(summaryCacheKey("maturity_summary", {
      ...context,
      userContext: { ...context.userContext, jobTitle: "Director" },
    })).not.toBe(first);
  });
});