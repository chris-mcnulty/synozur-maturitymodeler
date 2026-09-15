import { providerRegistry } from "./ai-providers/registry";
import { ServiceError } from "./service-error";

export type TranslationSource = {
  name: string;
  description: string;
  dimensions: Array<{ key: string; label: string; description: string | null }>;
  questions: Array<{ order: number; text: string; answers: Array<{ order: number; text: string }> }>;
  respondentContent?: {
    introduction?: string;
    completionMessage?: string;
    sectionInstructions?: Record<string, string>;
    optionalSectionInstruction?: string;
  } | null;
};

/** Reject omissions/reordering before any translated content can be persisted. */
export function hasCompleteMachineTranslation(source: TranslationSource, translated: any): boolean {
  const dimensions = Array.isArray(translated?.dimensions) ? translated.dimensions : [];
  const questions = Array.isArray(translated?.questions) ? translated.questions : [];
  const nonEmpty = (value: unknown) => typeof value === "string" && value.trim().length > 0;
  const sourceContent = source.respondentContent;
  const translatedContent = translated?.respondentContent;
  return nonEmpty(translated?.name)
    && nonEmpty(translated?.description)
    && dimensions.length === source.dimensions.length
    && questions.length === source.questions.length
    && JSON.stringify(dimensions.map((dimension: any) => dimension?.key).sort())
      === JSON.stringify(source.dimensions.map(dimension => dimension.key).sort())
    && dimensions.every((dimension: any) =>
      nonEmpty(dimension?.label)
      && (dimension.description === null || dimension.description === undefined || nonEmpty(dimension.description))
    )
    && questions.every((question: any, index: number) =>
      question?.order === source.questions[index].order
      && nonEmpty(question.text)
      && Array.isArray(question.answers)
      && question.answers.length === source.questions[index].answers.length
      && question.answers.every((answer: any, answerIndex: number) =>
        answer?.order === source.questions[index].answers[answerIndex].order
        && nonEmpty(answer.text)
      )
    )
    && (!sourceContent?.introduction || nonEmpty(translatedContent?.introduction))
    && (!sourceContent?.completionMessage || nonEmpty(translatedContent?.completionMessage))
    && (!sourceContent?.optionalSectionInstruction || nonEmpty(translatedContent?.optionalSectionInstruction))
    && Object.entries(sourceContent?.sectionInstructions ?? {}).every(([key]) =>
      nonEmpty(translatedContent?.sectionInstructions?.[key])
    );
}

/**
 * Translate authored model content using Azure AI Foundry only. We do not use
 * the generic provider fallback chain: an unavailable Foundry deployment is a
 * visible error rather than an undisclosed change of translation provider.
 */
export async function translateModelContentWithFoundry(source: TranslationSource, targetLanguage: string) {
  const provider = providerRegistry.get("azure-foundry");
  if (!provider?.isAvailable()) {
    throw new ServiceError(503, "Machine translation is unavailable because Azure AI Foundry is not configured");
  }
  const target = targetLanguage.toLowerCase().split("-")[0];
  if (!/^[a-z]{2,3}$/.test(target) || target === "en") {
    throw new ServiceError(400, "Choose a non-English ISO language code");
  }
  const prompt = [
    `Translate this assessment JSON from English to ${target}.`,
    "Return JSON only. Preserve every object key, number, product name, score, and order unchanged.",
    "Translate only string values intended for respondents. Do not add explanations or editorial notes.",
    JSON.stringify(source),
  ].join("\n\n");
  const output = await provider.call(prompt, {
    enforceShortResponse: false,
    systemPrompt: "You are a careful professional assessment translator. Return valid JSON only, with exactly the source object shape.",
    temperature: 0,
    maxTokens: 16000,
  });
  try {
    return JSON.parse(output);
  } catch {
    throw new ServiceError(502, "Azure AI Foundry returned an invalid translation payload");
  }
}