import type { Model } from '@shared/schema';

/**
 * Respondents need the score's meaning for Results/PDF rendering, not the
 * answer/remediation key. Allow-list the method; never spread this object.
 */
export function respondentScoringConfig(config: Model['scoringConfig'] | undefined): NonNullable<Model['scoringConfig']> | undefined {
  return config?.method === 'mean_answer_values' ? { method: 'mean_answer_values' } : undefined;
}