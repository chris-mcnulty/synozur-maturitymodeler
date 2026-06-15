import { describe, it, expect } from 'vitest';
import {
  calculateAssessmentScore,
  calculateTypeResult,
  scoreResponse,
  type ScoringQuestion,
  type ScoringMaturityLevel,
} from '../../server/services/scoring';

const FIVE_HUNDRED_SCALE: ScoringMaturityLevel[] = [
  { id: '1', name: 'Nascent', description: '', minScore: 100, maxScore: 199 },
  { id: '2', name: 'Experimental', description: '', minScore: 200, maxScore: 299 },
  { id: '3', name: 'Operational', description: '', minScore: 300, maxScore: 399 },
  { id: '4', name: 'Strategic', description: '', minScore: 400, maxScore: 449 },
  { id: '5', name: 'Transformational', description: '', minScore: 450, maxScore: 500 },
];

const HUNDRED_SCALE: ScoringMaturityLevel[] = [
  { id: '1', name: 'Beginner', description: '', minScore: 0, maxScore: 39 },
  { id: '2', name: 'Developing', description: '', minScore: 40, maxScore: 69 },
  { id: '3', name: 'Advanced', description: '', minScore: 70, maxScore: 100 },
];

const dimensions = [
  { id: 'dim-strategy', key: 'strategy' },
  { id: 'dim-people', key: 'people' },
];

function mcQuestion(
  id: string,
  dimensionId: string,
  scores: number[] = [100, 200, 300, 400, 500],
): ScoringQuestion {
  return {
    id,
    dimensionId,
    type: 'multiple_choice',
    answers: scores.map((s, i) => ({ id: `${id}-a${i}`, score: s })),
  };
}

describe('scoreResponse', () => {
  it('clamps numeric responses below the minimum to the floor (500-point)', () => {
    const q: ScoringQuestion = {
      id: 'q',
      dimensionId: null,
      type: 'numeric',
      minValue: 0,
      maxValue: 100,
      answers: [],
    };
    const result = scoreResponse(q, { questionId: 'q', numericValue: -50 }, false);
    expect(result).toEqual({ score: 100, maxPossible: 500 });
  });

  it('clamps numeric responses above the maximum to the ceiling (100-point)', () => {
    const q: ScoringQuestion = {
      id: 'q',
      dimensionId: null,
      type: 'numeric',
      minValue: 0,
      maxValue: 10,
      answers: [],
    };
    const result = scoreResponse(q, { questionId: 'q', numericValue: 999 }, true);
    expect(result).toEqual({ score: 4, maxPossible: 4 });
  });

  it('returns null when an answer id is not on the question', () => {
    const q = mcQuestion('q', 'dim-strategy');
    const result = scoreResponse(q, { questionId: 'q', answerId: 'does-not-exist' }, false);
    expect(result).toBeNull();
  });

  it('handles multi_select with zero options gracefully', () => {
    const q: ScoringQuestion = {
      id: 'q',
      dimensionId: null,
      type: 'multi_select',
      answers: [],
    };
    expect(scoreResponse(q, { questionId: 'q', answerIds: [] }, false)).toEqual({
      score: 100,
      maxPossible: 500,
    });
    expect(scoreResponse(q, { questionId: 'q', answerIds: [] }, true)).toEqual({
      score: 0,
      maxPossible: 4,
    });
  });

  it('scores multi_select proportionally on the 100-point scale', () => {
    const q: ScoringQuestion = {
      id: 'q',
      dimensionId: null,
      type: 'multi_select',
      answers: [
        { id: 'a', score: 0 },
        { id: 'b', score: 0 },
        { id: 'c', score: 0 },
        { id: 'd', score: 0 },
      ],
    };
    expect(scoreResponse(q, { questionId: 'q', answerIds: ['a', 'b'] }, true)).toEqual({
      score: 2,
      maxPossible: 4,
    });
  });
});

describe('calculateAssessmentScore - 500-point scale', () => {
  it('returns the lowest label when all answers are at the minimum', () => {
    const questions = [
      mcQuestion('q1', 'dim-strategy'),
      mcQuestion('q2', 'dim-people'),
    ];
    const responses = [
      { questionId: 'q1', answerId: 'q1-a0' },
      { questionId: 'q2', answerId: 'q2-a0' },
    ];

    const result = calculateAssessmentScore({
      questions,
      responses,
      dimensions,
      maturityScale: FIVE_HUNDRED_SCALE,
    });

    expect(result.use100PointScale).toBe(false);
    expect(result.overallScore).toBe(100);
    expect(result.dimensionScores).toEqual({ strategy: 100, people: 100 });
    expect(result.label).toBe('Nascent');
  });

  it('returns the top label when all answers are at the maximum', () => {
    const questions = [
      mcQuestion('q1', 'dim-strategy'),
      mcQuestion('q2', 'dim-people'),
    ];
    const responses = [
      { questionId: 'q1', answerId: 'q1-a4' },
      { questionId: 'q2', answerId: 'q2-a4' },
    ];

    const result = calculateAssessmentScore({
      questions,
      responses,
      dimensions,
      maturityScale: FIVE_HUNDRED_SCALE,
    });

    expect(result.overallScore).toBe(500);
    expect(result.dimensionScores).toEqual({ strategy: 500, people: 500 });
    expect(result.label).toBe('Transformational');
  });

  it('averages mixed answer types across dimensions', () => {
    const questions: ScoringQuestion[] = [
      mcQuestion('q1', 'dim-strategy', [100, 300, 500]),
      {
        id: 'q2',
        dimensionId: 'dim-people',
        type: 'numeric',
        minValue: 0,
        maxValue: 100,
        answers: [],
      },
      {
        id: 'q3',
        dimensionId: 'dim-people',
        type: 'multi_select',
        answers: [
          { id: 'a', score: 0 },
          { id: 'b', score: 0 },
          { id: 'c', score: 0 },
          { id: 'd', score: 0 },
        ],
      },
    ];
    const responses = [
      { questionId: 'q1', answerId: 'q1-a1' }, // 300
      { questionId: 'q2', numericValue: 50 },  // → 300 (50% of 0..100 range → 100 + 200)
      { questionId: 'q3', answerIds: ['a', 'b'] }, // 50% selected → 100 + 200 = 300
    ];

    const result = calculateAssessmentScore({
      questions,
      responses,
      dimensions,
      maturityScale: FIVE_HUNDRED_SCALE,
    });

    expect(result.overallScore).toBe(300);
    expect(result.dimensionScores).toEqual({ strategy: 300, people: 300 });
    expect(result.label).toBe('Operational');
  });

  it('skips responses whose questions or answers cannot be resolved', () => {
    const questions = [mcQuestion('q1', 'dim-strategy', [100, 500])];
    const responses = [
      { questionId: 'q1', answerId: 'q1-a1' },         // valid → 500
      { questionId: 'missing', answerId: 'whatever' }, // skipped
      { questionId: 'q1', answerId: 'no-such-answer' },// skipped
    ];

    const result = calculateAssessmentScore({
      questions,
      responses,
      dimensions,
      maturityScale: FIVE_HUNDRED_SCALE,
    });

    expect(result.overallScore).toBe(500);
    expect(result.dimensionScores).toEqual({ strategy: 500 });
  });

  it('falls back to the default scale when none is provided', () => {
    const questions = [mcQuestion('q1', 'dim-strategy', [100, 200, 300, 400, 500])];
    const responses = [{ questionId: 'q1', answerId: 'q1-a2' }];

    const result = calculateAssessmentScore({
      questions,
      responses,
      dimensions,
      maturityScale: null,
    });

    expect(result.use100PointScale).toBe(false);
    expect(result.maxMaturityScore).toBe(500);
    expect(result.overallScore).toBe(300);
    expect(result.label).toBe('Operational');
  });
});

describe('calculateAssessmentScore - 100-point scale (percentage of max)', () => {
  it('returns 0 when every answer is the lowest possible', () => {
    const questions = [
      mcQuestion('q1', 'dim-strategy', [0, 1, 2, 3, 4]),
      mcQuestion('q2', 'dim-people', [0, 1, 2, 3, 4]),
    ];
    const responses = [
      { questionId: 'q1', answerId: 'q1-a0' },
      { questionId: 'q2', answerId: 'q2-a0' },
    ];

    const result = calculateAssessmentScore({
      questions,
      responses,
      dimensions,
      maturityScale: HUNDRED_SCALE,
    });

    expect(result.use100PointScale).toBe(true);
    expect(result.maxMaturityScore).toBe(100);
    expect(result.overallScore).toBe(0);
    expect(result.dimensionScores).toEqual({ strategy: 0, people: 0 });
    expect(result.label).toBe('Beginner');
  });

  it('returns 100 when every answer is the maximum possible', () => {
    const questions = [
      mcQuestion('q1', 'dim-strategy', [0, 1, 2, 3, 4]),
      mcQuestion('q2', 'dim-people', [0, 1, 2, 3, 4]),
    ];
    const responses = [
      { questionId: 'q1', answerId: 'q1-a4' },
      { questionId: 'q2', answerId: 'q2-a4' },
    ];

    const result = calculateAssessmentScore({
      questions,
      responses,
      dimensions,
      maturityScale: HUNDRED_SCALE,
    });

    expect(result.overallScore).toBe(100);
    expect(result.dimensionScores).toEqual({ strategy: 100, people: 100 });
    expect(result.label).toBe('Advanced');
  });

  it('computes percentage-of-max across mixed answer types and uneven max scores', () => {
    const questions: ScoringQuestion[] = [
      // Max answer score = 4 → max possible 4
      mcQuestion('q1', 'dim-strategy', [0, 1, 2, 3, 4]),
      // Numeric → normalized to 0..4
      {
        id: 'q2',
        dimensionId: 'dim-strategy',
        type: 'numeric',
        minValue: 0,
        maxValue: 10,
        answers: [],
      },
      // Multi-select → normalized to 0..4
      {
        id: 'q3',
        dimensionId: 'dim-people',
        type: 'multi_select',
        answers: [
          { id: 'm1', score: 0 },
          { id: 'm2', score: 0 },
          { id: 'm3', score: 0 },
          { id: 'm4', score: 0 },
        ],
      },
    ];
    const responses = [
      { questionId: 'q1', answerId: 'q1-a2' },        // score 2 of 4
      { questionId: 'q2', numericValue: 5 },          // → 2 of 4
      { questionId: 'q3', answerIds: ['m1', 'm2'] }, // → 2 of 4
    ];

    const result = calculateAssessmentScore({
      questions,
      responses,
      dimensions,
      maturityScale: HUNDRED_SCALE,
    });

    // total = 6, totalMax = 12 → 50% of 100 = 50
    expect(result.overallScore).toBe(50);
    expect(result.dimensionScores).toEqual({ strategy: 50, people: 50 });
    expect(result.label).toBe('Developing');
  });

  it('handles questions with different per-question max scores correctly', () => {
    const questions: ScoringQuestion[] = [
      // Max answer score = 2 → max possible 2
      mcQuestion('q1', 'dim-strategy', [0, 1, 2]),
      // Max answer score = 4 → max possible 4
      mcQuestion('q2', 'dim-strategy', [0, 1, 2, 3, 4]),
    ];
    const responses = [
      { questionId: 'q1', answerId: 'q1-a2' }, // 2 of 2
      { questionId: 'q2', answerId: 'q2-a4' }, // 4 of 4
    ];

    const result = calculateAssessmentScore({
      questions,
      responses,
      dimensions,
      maturityScale: HUNDRED_SCALE,
    });

    expect(result.overallScore).toBe(100);
    expect(result.dimensionScores).toEqual({ strategy: 100 });
  });
});

describe('scoreResponse - true_false (boolean) questions', () => {
  it('scores a true_false question by matching the selected answer id (500-point)', () => {
    const q: ScoringQuestion = {
      id: 'q',
      dimensionId: null,
      type: 'true_false',
      answers: [
        { id: 'yes', score: 500 },
        { id: 'no', score: 100 },
      ],
    };
    expect(scoreResponse(q, { questionId: 'q', answerId: 'yes' }, false)).toEqual({
      score: 500,
      maxPossible: 500,
    });
    expect(scoreResponse(q, { questionId: 'q', answerId: 'no' }, false)).toEqual({
      score: 100,
      maxPossible: 500,
    });
  });

  it('scores a true_false question on the 100-point scale by raw answer score', () => {
    const q: ScoringQuestion = {
      id: 'q',
      dimensionId: null,
      type: 'true_false',
      answers: [
        { id: 'yes', score: 4 },
        { id: 'no', score: 0 },
      ],
    };
    expect(scoreResponse(q, { questionId: 'q', answerId: 'yes' }, true)).toEqual({
      score: 4,
      maxPossible: 4,
    });
    expect(scoreResponse(q, { questionId: 'q', answerId: 'no' }, true)).toEqual({
      score: 0,
      maxPossible: 4,
    });
  });

  it('returns null when a true_false response has no matching answer id', () => {
    const q: ScoringQuestion = {
      id: 'q',
      dimensionId: null,
      type: 'true_false',
      answers: [
        { id: 'yes', score: 500 },
        { id: 'no', score: 100 },
      ],
    };
    expect(scoreResponse(q, { questionId: 'q', answerId: 'maybe' }, false)).toBeNull();
  });
});

describe('scoreResponse - text questions', () => {
  it('scores a text question by the matched answer id (500-point)', () => {
    const q: ScoringQuestion = {
      id: 'q',
      dimensionId: null,
      type: 'text',
      answers: [
        { id: 'low', score: 100 },
        { id: 'mid', score: 300 },
        { id: 'high', score: 500 },
      ],
    };
    expect(scoreResponse(q, { questionId: 'q', answerId: 'mid' }, false)).toEqual({
      score: 300,
      maxPossible: 500,
    });
  });

  it('returns null for a text question with no matching answer id', () => {
    const q: ScoringQuestion = {
      id: 'q',
      dimensionId: null,
      type: 'text',
      answers: [{ id: 'a', score: 100 }],
    };
    expect(scoreResponse(q, { questionId: 'q', answerId: 'unknown' }, false)).toBeNull();
    // No answerId at all — also unscoreable.
    expect(scoreResponse(q, { questionId: 'q' }, false)).toBeNull();
  });
});

describe('calculateAssessmentScore - mixed types including boolean and text', () => {
  it('aggregates single, multi-select, numeric, true_false and text on the 500-point scale', () => {
    const questions: ScoringQuestion[] = [
      // single (multiple_choice) — score 300
      mcQuestion('q1', 'dim-strategy', [100, 300, 500]),
      // multi_select — 2 of 4 selected → 100 + (2/4 * 400) = 300
      {
        id: 'q2',
        dimensionId: 'dim-strategy',
        type: 'multi_select',
        answers: [
          { id: 'a', score: 0 },
          { id: 'b', score: 0 },
          { id: 'c', score: 0 },
          { id: 'd', score: 0 },
        ],
      },
      // numeric — 50% of 0..100 → 100 + 200 = 300
      {
        id: 'q3',
        dimensionId: 'dim-people',
        type: 'numeric',
        minValue: 0,
        maxValue: 100,
        answers: [],
      },
      // true_false — score 300
      {
        id: 'q4',
        dimensionId: 'dim-people',
        type: 'true_false',
        answers: [
          { id: 'yes', score: 500 },
          { id: 'meh', score: 300 },
          { id: 'no', score: 100 },
        ],
      },
      // text — score 300
      {
        id: 'q5',
        dimensionId: 'dim-people',
        type: 'text',
        answers: [
          { id: 'low', score: 100 },
          { id: 'mid', score: 300 },
          { id: 'high', score: 500 },
        ],
      },
    ];

    const responses = [
      { questionId: 'q1', answerId: 'q1-a1' },
      { questionId: 'q2', answerIds: ['a', 'b'] },
      { questionId: 'q3', numericValue: 50 },
      { questionId: 'q4', answerId: 'meh' },
      { questionId: 'q5', answerId: 'mid' },
    ];

    const result = calculateAssessmentScore({
      questions,
      responses,
      dimensions,
      maturityScale: FIVE_HUNDRED_SCALE,
    });

    expect(result.use100PointScale).toBe(false);
    expect(result.maxMaturityScore).toBe(500);
    expect(result.overallScore).toBe(300);
    expect(result.dimensionScores).toEqual({ strategy: 300, people: 300 });
    expect(result.label).toBe('Operational');
  });

  it('aggregates single, multi-select, numeric, true_false and text on the 100-point scale', () => {
    const questions: ScoringQuestion[] = [
      // single — 2 of 4
      mcQuestion('q1', 'dim-strategy', [0, 1, 2, 3, 4]),
      // multi_select — 2 of 4
      {
        id: 'q2',
        dimensionId: 'dim-strategy',
        type: 'multi_select',
        answers: [
          { id: 'a', score: 0 },
          { id: 'b', score: 0 },
          { id: 'c', score: 0 },
          { id: 'd', score: 0 },
        ],
      },
      // numeric — 5/10 → 2 of 4
      {
        id: 'q3',
        dimensionId: 'dim-people',
        type: 'numeric',
        minValue: 0,
        maxValue: 10,
        answers: [],
      },
      // true_false — 2 of 4
      {
        id: 'q4',
        dimensionId: 'dim-people',
        type: 'true_false',
        answers: [
          { id: 'yes', score: 4 },
          { id: 'partial', score: 2 },
          { id: 'no', score: 0 },
        ],
      },
      // text — 2 of 4
      {
        id: 'q5',
        dimensionId: 'dim-people',
        type: 'text',
        answers: [
          { id: 'low', score: 0 },
          { id: 'mid', score: 2 },
          { id: 'high', score: 4 },
        ],
      },
    ];

    const responses = [
      { questionId: 'q1', answerId: 'q1-a2' },
      { questionId: 'q2', answerIds: ['a', 'b'] },
      { questionId: 'q3', numericValue: 5 },
      { questionId: 'q4', answerId: 'partial' },
      { questionId: 'q5', answerId: 'mid' },
    ];

    const result = calculateAssessmentScore({
      questions,
      responses,
      dimensions,
      maturityScale: HUNDRED_SCALE,
    });

    // 5 questions × (2/4) → 50%
    expect(result.use100PointScale).toBe(true);
    expect(result.maxMaturityScore).toBe(100);
    expect(result.overallScore).toBe(50);
    expect(result.dimensionScores).toEqual({ strategy: 50, people: 50 });
    expect(result.label).toBe('Developing');
  });
});

describe('calculateAssessmentScore - degenerate inputs', () => {
  it('returns zero/lowest label when there are no responses', () => {
    const result = calculateAssessmentScore({
      questions: [mcQuestion('q1', 'dim-strategy')],
      responses: [],
      dimensions,
      maturityScale: FIVE_HUNDRED_SCALE,
    });

    expect(result.overallScore).toBe(0);
    expect(result.dimensionScores).toEqual({});
    expect(result.label).toBe('Nascent');
  });
});

describe('calculateTypeResult', () => {
  const TYPES = [
    { key: 'visionary', name: 'The Visionary' },
    { key: 'connector', name: 'The Connector' },
    { key: 'coach', name: 'The Coach' },
  ];

  function typeQuestion(id: string): ScoringQuestion {
    return {
      id,
      dimensionId: null,
      type: 'multiple_choice',
      answers: [
        { id: `${id}-a0`, score: 0, typeKey: 'visionary' },
        { id: `${id}-a1`, score: 0, typeKey: 'connector' },
        { id: `${id}-a2`, score: 0, typeKey: 'coach' },
      ],
    };
  }

  const questions = [typeQuestion('q1'), typeQuestion('q2'), typeQuestion('q3')];

  it('picks the single most-voted type', () => {
    const result = calculateTypeResult({
      questions,
      responses: [
        { questionId: 'q1', answerId: 'q1-a0' },
        { questionId: 'q2', answerId: 'q2-a0' },
        { questionId: 'q3', answerId: 'q3-a1' },
      ],
      types: TYPES,
    });

    expect(result.tally).toEqual({ visionary: 2, connector: 1, coach: 0 });
    expect(result.topCount).toBe(2);
    expect(result.winnerKeys).toEqual(['visionary']);
    expect(result.isTie).toBe(false);
    expect(result.label).toBe('The Visionary');
  });

  it('surfaces a blended tie when top totals are equal', () => {
    const result = calculateTypeResult({
      questions,
      responses: [
        { questionId: 'q1', answerId: 'q1-a0' },
        { questionId: 'q2', answerId: 'q2-a1' },
      ],
      types: TYPES,
    });

    expect(result.topCount).toBe(1);
    expect(result.winnerKeys.sort()).toEqual(['connector', 'visionary']);
    expect(result.isTie).toBe(true);
    expect(result.label).toContain('/');
  });

  it('ignores answers without a typeKey and undeclared types', () => {
    const q = typeQuestion('q1');
    q.answers.push({ id: 'q1-aX', score: 0, typeKey: null });
    q.answers.push({ id: 'q1-aY', score: 0, typeKey: 'ghost' });
    const result = calculateTypeResult({
      questions: [q],
      responses: [
        { questionId: 'q1', answerId: 'q1-aX' },
        { questionId: 'q1', answerId: 'q1-aY' },
      ],
      types: TYPES,
    });

    expect(result.topCount).toBe(0);
    expect(result.winnerKeys).toEqual([]);
    expect(result.isTie).toBe(false);
  });

  it('returns zero tallies and no winner with no responses', () => {
    const result = calculateTypeResult({ questions, responses: [], types: TYPES });
    expect(result.tally).toEqual({ visionary: 0, connector: 0, coach: 0 });
    expect(result.topCount).toBe(0);
    expect(result.winnerKeys).toEqual([]);
    expect(result.label).toBe('');
  });
});
