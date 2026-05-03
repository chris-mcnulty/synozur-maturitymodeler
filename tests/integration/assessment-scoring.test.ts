import { describe, it, expect, vi, beforeEach } from 'vitest';

const state = {
  models: [] as any[],
  dimensions: [] as any[],
  questions: [] as any[],
  answers: [] as any[],
  assessments: [] as any[],
  responses: [] as any[],
  results: [] as any[],
  nextId: 1,
};

const storageMock = {
  async getAssessment(id: string) {
    return state.assessments.find(a => a.id === id);
  },
  async getAssessmentResponses(assessmentId: string) {
    return state.responses.filter(r => r.assessmentId === assessmentId);
  },
  async getModel(id: string) {
    return state.models.find(m => m.id === id);
  },
  async getDimensionsByModelId(modelId: string) {
    return state.dimensions.filter(d => d.modelId === modelId);
  },
  async getQuestionsByModelId(modelId: string) {
    return state.questions.filter(q => q.modelId === modelId);
  },
  async createResult(data: any) {
    const r = { id: `res-${state.nextId++}`, createdAt: new Date(), ...data };
    state.results.push(r);
    return r;
  },
  async updateAssessment(id: string, data: any) {
    const a = state.assessments.find(x => x.id === id);
    if (!a) return undefined;
    Object.assign(a, data);
    return a;
  },
};

// Drizzle shim that supports `db.select().from(answers).where(inArray(...))`.
// The route only uses this exact shape against schema.answers, so we filter
// our seeded answers by the question ids the inArray() call captured.
const dbMock = {
  select: () => ({
    from: () => ({
      where: (cond: any) => {
        const ids: string[] = (cond && cond.__ids) || [];
        const rows = state.answers.filter(a => ids.includes(a.questionId));
        return Promise.resolve(rows);
      },
    }),
  }),
};

vi.mock('../../server/storage', () => ({ storage: storageMock }));
vi.mock('../../server/db', () => ({ db: dbMock }));
vi.mock('drizzle-orm', async (orig) => {
  const actual: any = await orig();
  return {
    ...actual,
    inArray: (_col: any, ids: any[]) => ({ __ids: ids }),
    eq: (_a: any, b: any) => ({ __eq: b }),
  };
});
// The completion path will try to import galaxy webhooks if the assessment
// has a tenantId; ours don't, but mock defensively just in case.
vi.mock('../../server/routes/galaxy/webhooks', () => ({
  emitGalaxyEvent: async () => {},
}));

const FIVE_HUNDRED_SCALE = [
  { id: '1', name: 'Nascent', description: '', minScore: 100, maxScore: 199 },
  { id: '2', name: 'Experimental', description: '', minScore: 200, maxScore: 299 },
  { id: '3', name: 'Operational', description: '', minScore: 300, maxScore: 399 },
  { id: '4', name: 'Strategic', description: '', minScore: 400, maxScore: 449 },
  { id: '5', name: 'Transformational', description: '', minScore: 450, maxScore: 500 },
];

const HUNDRED_SCALE = [
  { id: '1', name: 'Beginner', description: '', minScore: 0, maxScore: 39 },
  { id: '2', name: 'Developing', description: '', minScore: 40, maxScore: 69 },
  { id: '3', name: 'Advanced', description: '', minScore: 70, maxScore: 100 },
];

function reset() {
  state.models.length = 0;
  state.dimensions.length = 0;
  state.questions.length = 0;
  state.answers.length = 0;
  state.assessments.length = 0;
  state.responses.length = 0;
  state.results.length = 0;
  state.nextId = 1;
}

function seedAllQuestionTypes(opts: { maturityScale: any; scale: '100' | '500' }) {
  const modelId = 'model-1';
  state.models.push({
    id: modelId,
    slug: 'mixed',
    name: 'Mixed',
    maturityScale: opts.maturityScale,
  });
  state.dimensions.push(
    { id: 'dim-strategy', modelId, key: 'strategy' },
    { id: 'dim-people', modelId, key: 'people' },
  );

  // Per-scale answer scoring: we want every question to score "halfway"
  // — i.e. the midpoint score on its scale — so the aggregate is exactly
  // mid-scale and we can assert a deterministic label.
  const isHundred = opts.scale === '100';
  const max = isHundred ? 4 : 500;
  const min = isHundred ? 0 : 100;
  const mid = isHundred ? 2 : 300;

  // single (multiple_choice)
  state.questions.push({
    id: 'q-single', modelId, dimensionId: 'dim-strategy',
    type: 'multiple_choice', minValue: null, maxValue: null,
  });
  state.answers.push(
    { id: 'q-single-low', questionId: 'q-single', score: min },
    { id: 'q-single-mid', questionId: 'q-single', score: mid },
    { id: 'q-single-high', questionId: 'q-single', score: max },
  );

  // multi_select — 4 options, select 2 → halfway
  state.questions.push({
    id: 'q-multi', modelId, dimensionId: 'dim-strategy',
    type: 'multi_select', minValue: null, maxValue: null,
  });
  state.answers.push(
    { id: 'q-multi-a', questionId: 'q-multi', score: 0 },
    { id: 'q-multi-b', questionId: 'q-multi', score: 0 },
    { id: 'q-multi-c', questionId: 'q-multi', score: 0 },
    { id: 'q-multi-d', questionId: 'q-multi', score: 0 },
  );

  // numeric — value at halfway between min/max
  state.questions.push({
    id: 'q-numeric', modelId, dimensionId: 'dim-people',
    type: 'numeric', minValue: 0, maxValue: 10,
  });

  // true_false (boolean) — pick the "halfway" answer
  state.questions.push({
    id: 'q-bool', modelId, dimensionId: 'dim-people',
    type: 'true_false', minValue: null, maxValue: null,
  });
  state.answers.push(
    { id: 'q-bool-yes', questionId: 'q-bool', score: max },
    { id: 'q-bool-mid', questionId: 'q-bool', score: mid },
    { id: 'q-bool-no', questionId: 'q-bool', score: min },
  );

  // text — pick the "halfway" answer
  state.questions.push({
    id: 'q-text', modelId, dimensionId: 'dim-people',
    type: 'text', minValue: null, maxValue: null,
  });
  state.answers.push(
    { id: 'q-text-low', questionId: 'q-text', score: min },
    { id: 'q-text-mid', questionId: 'q-text', score: mid },
    { id: 'q-text-high', questionId: 'q-text', score: max },
  );

  state.assessments.push({
    id: 'a-1',
    modelId,
    userId: 'user-1',
    tenantId: null,
    status: 'in_progress',
  });

  state.responses.push(
    { id: 'r1', assessmentId: 'a-1', questionId: 'q-single', answerId: 'q-single-mid' },
    { id: 'r2', assessmentId: 'a-1', questionId: 'q-multi', answerIds: ['q-multi-a', 'q-multi-b'] },
    { id: 'r3', assessmentId: 'a-1', questionId: 'q-numeric', numericValue: 5 },
    { id: 'r4', assessmentId: 'a-1', questionId: 'q-bool', answerId: 'q-bool-mid' },
    { id: 'r5', assessmentId: 'a-1', questionId: 'q-text', answerId: 'q-text-mid' },
  );
}

describe('calculateAssessmentResults — covers refactored inArray batch-load path', () => {
  beforeEach(() => {
    reset();
    vi.resetModules();
  });

  it('scores all five question types correctly on the 500-point scale', async () => {
    seedAllQuestionTypes({ maturityScale: FIVE_HUNDRED_SCALE, scale: '500' });
    const { calculateAssessmentResults } = await import(
      '../../server/services/assessment-analytics-service'
    );

    const result = await calculateAssessmentResults('a-1');

    expect(result.overallScore).toBe(300);
    expect(result.label).toBe('Operational');
    expect(result.dimensionScores).toEqual({ strategy: 300, people: 300 });

    // Persisted result row + completed assessment.
    expect(state.results).toHaveLength(1);
    expect(state.assessments[0].status).toBe('completed');
    expect(state.assessments[0].completedAt).toBeInstanceOf(Date);
  });

  it('scores all five question types correctly on the 100-point scale', async () => {
    seedAllQuestionTypes({ maturityScale: HUNDRED_SCALE, scale: '100' });
    const { calculateAssessmentResults } = await import(
      '../../server/services/assessment-analytics-service'
    );

    const result = await calculateAssessmentResults('a-1');

    expect(result.overallScore).toBe(50);
    expect(result.label).toBe('Developing');
    expect(result.dimensionScores).toEqual({ strategy: 50, people: 50 });
  });

  it('returns the top label on the 500-point scale when all answers are maxed out', async () => {
    seedAllQuestionTypes({ maturityScale: FIVE_HUNDRED_SCALE, scale: '500' });
    // Bump every selectable response to its highest-scoring choice.
    const top = (id: string) => state.responses.find(r => r.id === id)!;
    top('r1').answerId = 'q-single-high';
    top('r2').answerIds = ['q-multi-a', 'q-multi-b', 'q-multi-c', 'q-multi-d'];
    top('r3').numericValue = 10;
    top('r4').answerId = 'q-bool-yes';
    top('r5').answerId = 'q-text-high';

    const { calculateAssessmentResults } = await import(
      '../../server/services/assessment-analytics-service'
    );

    const result = await calculateAssessmentResults('a-1');
    expect(result.overallScore).toBe(500);
    expect(result.label).toBe('Transformational');
  });

  it('returns the lowest label on the 100-point scale when all answers are at the minimum', async () => {
    seedAllQuestionTypes({ maturityScale: HUNDRED_SCALE, scale: '100' });
    const bot = (id: string) => state.responses.find(r => r.id === id)!;
    bot('r1').answerId = 'q-single-low';
    bot('r2').answerIds = [];
    bot('r3').numericValue = 0;
    bot('r4').answerId = 'q-bool-no';
    bot('r5').answerId = 'q-text-low';

    const { calculateAssessmentResults } = await import(
      '../../server/services/assessment-analytics-service'
    );

    const result = await calculateAssessmentResults('a-1');
    expect(result.overallScore).toBe(0);
    expect(result.label).toBe('Beginner');
  });

  it('throws 400 when an assessment has no responses', async () => {
    state.models.push({ id: 'model-1', maturityScale: FIVE_HUNDRED_SCALE });
    state.assessments.push({ id: 'a-1', modelId: 'model-1', tenantId: null });
    const { calculateAssessmentResults } = await import(
      '../../server/services/assessment-analytics-service'
    );

    await expect(calculateAssessmentResults('a-1')).rejects.toMatchObject({
      statusCode: 400,
    });
  });
});
