type QuestionWithOptionalAnswers = {
  type: string;
  text: string;
  answers?: readonly unknown[];
};

/**
 * A legacy M365 Light question was imported as an empty multiple-choice
 * question even though its prompt asks for an Adoption Score. Keep existing
 * in-progress assessments completable while the record is corrected.
 */
export function isLegacyM365AdoptionScoreQuestion(
  question: QuestionWithOptionalAnswers,
): boolean {
  return (
    question.type === "multiple_choice" &&
    Array.isArray(question.answers) &&
    question.answers.length === 0 &&
    /microsoft 365 adoption score/i.test(question.text)
  );
}

export function getAssessmentQuestionType(
  question: QuestionWithOptionalAnswers,
): QuestionWithOptionalAnswers["type"] {
  return isLegacyM365AdoptionScoreQuestion(question)
    ? "numeric"
    : question.type;
}

export function getNumericQuestionBounds(
  question: QuestionWithOptionalAnswers & {
    minValue?: number | null;
    maxValue?: number | null;
  },
): { minValue?: number; maxValue?: number } {
  if (!isLegacyM365AdoptionScoreQuestion(question)) {
    return {
      minValue: question.minValue ?? undefined,
      maxValue: question.maxValue ?? undefined,
    };
  }

  return { minValue: 0, maxValue: 700 };
}