import { describe, expect, it } from "vitest";
import { calculateAssessmentScore } from "../scoring";
import { getAuthoredTranslation, localizeQuestion } from "../../../shared/model-localization";
import { modelExportFormatSchema } from "../../../shared/schema";
import { readFileSync } from "node:fs";
import { getMissingRequiredQuestionOrders } from "../assessment-analytics-service";
import { hasCompleteMachineTranslation } from "../model-translation-service";

const scale = [
  { id: "foundation", name: "Foundation", description: "", minScore: 0, maxScore: 40 },
  { id: "practitioner", name: "Practitioner", description: "", minScore: 41, maxScore: 70 },
  { id: "advanced", name: "Advanced", description: "", minScore: 71, maxScore: 100 },
];

describe("AI Fluency scoring semantics", () => {
  it("takes the mean of answered scored values, skipping access and N/A questions", () => {
    const result = calculateAssessmentScore({
      questions: [
        { id: "q1", dimensionId: null, type: "multiple_choice", isScored: false, answers: [{ id: "a1", score: 100 }] },
        { id: "q3", dimensionId: null, type: "multiple_choice", answers: [{ id: "safe", score: 100 }, { id: "unsure", score: 25 }] },
        { id: "q6", dimensionId: null, type: "multiple_choice", answers: [{ id: "na", score: 0, isNotApplicable: true }] },
        { id: "q19", dimensionId: null, type: "multiple_choice", isOptional: true, answers: [{ id: "skill", score: 100 }] },
      ],
      responses: [
        { questionId: "q1", answerId: "a1" },
        { questionId: "q3", answerId: "safe" },
        { questionId: "q6", answerId: "na" },
        { questionId: "q19", answerId: "skill" },
      ],
      dimensions: [],
      maturityScale: scale,
      scoringConfig: { method: "mean_answer_values" },
    });
    expect(result.overallScore).toBe(100);
    expect(result.label).toBe("Advanced");
  });

  it("keeps an omitted optional question out of the denominator", () => {
    const result = calculateAssessmentScore({
      questions: [
        { id: "q3", dimensionId: null, type: "multiple_choice", answers: [{ id: "safe", score: 100 }] },
        { id: "q19", dimensionId: null, type: "multiple_choice", isOptional: true, answers: [{ id: "skill", score: 0 }] },
      ],
      responses: [{ questionId: "q3", answerId: "safe" }],
      dimensions: [],
      maturityScale: scale,
      scoringConfig: { method: "mean_answer_values" },
    });
    expect(result.overallScore).toBe(100);
  });

  it("keeps a 92-point respondent in the Advanced configured track", () => {
    const result = calculateAssessmentScore({
      questions: [
        { id: "q3", dimensionId: null, type: "multiple_choice", answers: [{ id: "a", score: 100 }] },
        { id: "q4", dimensionId: null, type: "multiple_choice", answers: [{ id: "b", score: 84 }] },
      ],
      responses: [{ questionId: "q3", answerId: "a" }, { questionId: "q4", answerId: "b" }],
      dimensions: [],
      maturityScale: scale,
      scoringConfig: { method: "mean_answer_values" },
    });
    expect(result.overallScore).toBe(92);
    expect(result.label).toBe("Advanced");
  });

  it("requires every nonoptional question only for the configured guide flow", () => {
    expect(getMissingRequiredQuestionOrders([
      { id: "required", order: 1, dimensionId: null, type: "multiple_choice", answers: [] },
      { id: "optional", order: 19, dimensionId: null, type: "multiple_choice", isOptional: true, answers: [] },
    ], [])).toEqual([1]);
  });

  it("rejects incomplete or reordered machine-translation payloads before persistence", () => {
    const source = {
      name: "Name", description: "Description",
      dimensions: [{ key: "section", label: "Section", description: null }],
      questions: [{ order: 1, text: "Question", answers: [{ order: 1, text: "Answer" }] }],
    };
    expect(hasCompleteMachineTranslation(source, {
      ...source, dimensions: [{ ...source.dimensions[0], label: "Sección" }],
      questions: [{ ...source.questions[0], text: "Pregunta", answers: [{ order: 2, text: "Respuesta" }] }],
    })).toBe(false);
    expect(hasCompleteMachineTranslation(source, {
      ...source, dimensions: [{ ...source.dimensions[0], label: "Sección" }],
      questions: [{ ...source.questions[0], text: "Pregunta", answers: [{ order: 1, text: "Respuesta" }] }],
    })).toBe(true);
  });
});

describe("authored content localization", () => {
  it("uses exact custom Spanish ahead of canonical content", () => {
    const translations = { es: { questions: { "3": { text: "¿Está bien?", answers: { "1": "No." } } } } };
    const localized = localizeQuestion(
      { order: 3, text: "Is this okay?", answers: [{ order: 1, text: "No" }] },
      translations,
      "es-MX",
    );
    expect(localized.text).toBe("¿Está bien?");
    expect(localized.answers[0].text).toBe("No.");
    expect(getAuthoredTranslation(translations, "fr")).toBeUndefined();
  });

  it("round-trips the portable .model Spanish mappings without database IDs", () => {
    const serialized = readFileSync("attached_assets/personal-ai-skills-grameen.model", "utf8");
    expect(serialized).not.toMatch(/ownerTenantId|tenantId|modelId|questionId|answerId/);
    const exported = modelExportFormatSchema.parse(JSON.parse(serialized));
    expect(exported.questions).toHaveLength(19);
    expect(exported.model.respondentContent?.sectionInstructions?.["getting-started"]).toContain("These first questions");
    expect(exported.translations?.es.optionalSectionInstruction).toContain("Esta última pregunta");
    const restored = {
      ...exported.translations?.es,
      questions: Object.fromEntries(exported.questions.map(question => [
        String(question.order),
        {
          text: question.translations?.es?.text,
          answers: Object.fromEntries(question.answers.map(answer => [
            String(answer.order), answer.translations?.es,
          ])),
        },
      ])),
    };
    const question = localizeQuestion(
      { order: 3, text: exported.questions[2].text, answers: [{ order: 1, text: exported.questions[2].answers[0].text }] },
      { es: restored },
      "es",
    );
    expect(question.text).toBe("Si usted usa una cuenta personal de IA que no le dio el trabajo, ¿está bien poner en ella información del trabajo, por ejemplo el nombre o los datos de una clienta?");
    expect(question.answers[0].text).toBe("No. La información del trabajo solo debe ir en las herramientas que la organización ha aprobado.");
  });
});