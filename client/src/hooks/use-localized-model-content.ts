import { useQuery } from "@tanstack/react-query";
import type { Model } from "@shared/schema";
import { getAuthoredTranslation, localeBase } from "@shared/model-localization";
import { apiRequest } from "@/lib/queryClient";

type TranslationOverlay = NonNullable<Model["contentTranslations"]>[string];

/**
 * Uses custom authored content immediately. For every other non-English
 * selected language, explicitly requests a Foundry-only read overlay rather
 * than quietly presenting English as though it were translated.
 */
export function useLocalizedModelContent(model: Model | undefined, language: string) {
  const locale = localeBase(language);
  const authored = getAuthoredTranslation(model?.contentTranslations, locale);
  const requiresMachineTranslation = !!model && locale !== "en" && !authored;
  const query = useQuery<{ source: "authored" | "machine" | "canonical"; translation: TranslationOverlay | null }>({
    queryKey: ["/api/models", model?.id, "localized-content", locale],
    enabled: requiresMachineTranslation,
    queryFn: () => apiRequest(`/api/models/${model!.id}/localized-content/${locale}`, "POST"),
  });
  const overlay = authored ?? query.data?.translation ?? undefined;
  const contentTranslations = overlay ? { ...(model?.contentTranslations ?? {}), [locale]: overlay } : model?.contentTranslations;
  return {
    locale,
    contentTranslations,
    isTranslating: requiresMachineTranslation && query.isLoading,
    translationError: requiresMachineTranslation ? query.error as Error | null : null,
    translationSource: authored ? "authored" : query.data?.source,
  };
}