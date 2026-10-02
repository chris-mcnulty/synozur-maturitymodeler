import { describe, expect, it } from 'vitest';
import { respondentScoringConfig } from '../../server/services/respondent-scoring-config';

describe('respondent scoring metadata', () => {
  it('preserves the personal-skills method without exposing remediation answers', () => {
    const config = {
      method: 'mean_answer_values' as const,
      remediation: { questionOrder: 7, incorrectAnswerScores: [0, 20], message: 'Private scoring rule' },
    };
    expect(respondentScoringConfig(config)).toEqual({ method: 'mean_answer_values' });
    expect(config.remediation.incorrectAnswerScores).toEqual([0, 20]);
  });

  it('keeps legacy models and remediation-only configuration hidden', () => {
    expect(respondentScoringConfig(null)).toBeUndefined();
    expect(respondentScoringConfig(undefined)).toBeUndefined();
    expect(respondentScoringConfig({
      remediation: { questionOrder: 1, incorrectAnswerScores: [0], message: 'Hidden' },
    })).toBeUndefined();
  });
});