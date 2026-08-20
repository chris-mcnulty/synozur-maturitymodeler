import { describe, expect, it } from "vitest";
import {
  getAssessmentQuestionType,
  getNumericQuestionBounds,
} from "../../../shared/assessment-question-utils";
import { calculateAssessmentScore } from "../scoring";

describe("legacy M365 Adoption Score question", () => {
  const legacyQuestion = {
    id: "legacy-m365-score",
    dimensionId: "adoption",
    type: "multiple_choice",
    text: "What is your Microsoft 365 Adoption Score from the admin center? (Enter 350 if you don't have it handy.)",
    answers: [],
  };

  it("treats the empty choice question as a 0–700 numeric response", () => {
    expect(getAssessmentQuestionType(legacyQuestion)).toBe("numeric");
    expect(getNumericQuestionBounds(legacyQuestion)).toEqual({
      minValue: 0,
      maxValue: 700,
    });
  });

  it("includes the entered score when calculating results", () => {
    const bounds = getNumericQuestionBounds(legacyQuestion);
    const result = calculateAssessmentScore({
      questions: [
        {
          ...legacyQuestion,
          type: getAssessmentQuestionType(legacyQuestion) as "numeric",
          minValue: bounds.minValue,
          maxValue: bounds.maxValue,
        },
      ],
      responses: [{ questionId: legacyQuestion.id, numericValue: 350 }],
      dimensions: [{ id: "adoption", key: "adoption" }],
      maturityScale: [
        { id: "low", name: "Low", description: "", minScore: 0, maxScore: 250 },
        { id: "high", name: "High", description: "", minScore: 251, maxScore: 500 },
      ],
    });

    expect(result.overallScore).toBe(300);
    expect(result.dimensionScores).toEqual({ adoption: 300 });
    expect(result.label).toBe("High");
  });
});