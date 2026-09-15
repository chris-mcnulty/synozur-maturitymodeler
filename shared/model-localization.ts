/**
 * Resolve authored assessment content without changing canonical IDs or scores.
 * Custom translations always win; callers can use a machine translation only
 * when this function returns canonical content for the requested locale.
 */
export type ContentTranslations = Record<string, {
  name?: string;
  description?: string;
  introduction?: string;
  completionMessage?: string;
  resultLabels?: Record<string, string>;
  sectionInstructions?: Record<string, string>;
  optionalSectionInstruction?: string;
  dimensions?: Record<string, { label?: string; description?: string }>;
  questions?: Record<string, { text?: string; answers?: Record<string, string> }>;
}>;

export function localeBase(locale?: string): string {
  return (locale || "en").toLowerCase().split("-")[0];
}

export function getAuthoredTranslation(
  translations: ContentTranslations | null | undefined,
  locale?: string,
) {
  return translations?.[localeBase(locale)];
}

export function localizeQuestion<T extends { order: number; text: string; answers: Array<{ order: number; text: string }> }>(
  question: T,
  translations: ContentTranslations | null | undefined,
  locale?: string,
): T {
  const translation = getAuthoredTranslation(translations, locale)?.questions?.[String(question.order)];
  if (!translation) return question;
  return {
    ...question,
    text: translation.text ?? question.text,
    answers: question.answers.map(answer => ({
      ...answer,
      text: translation.answers?.[String(answer.order)] ?? answer.text,
    })),
  };
}

export function localizeDimension<T extends { key: string; label: string; description?: string | null }>(
  dimension: T,
  translations: ContentTranslations | null | undefined,
  locale?: string,
): T {
  const translation = getAuthoredTranslation(translations, locale)?.dimensions?.[dimension.key];
  if (!translation) return dimension;
  return {
    ...dimension,
    label: translation.label ?? dimension.label,
    description: translation.description ?? dimension.description,
  };
}