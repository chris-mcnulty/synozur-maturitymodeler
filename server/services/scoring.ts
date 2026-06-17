/**
 * Pure scoring engine for assessment results.
 *
 * Extracted from `server/routes.ts` so it can be unit-tested in isolation
 * without database, network, or HTTP dependencies. Behaviour must stay in
 * sync with the `/api/assessments/:id/calculate` route handler.
 */

export type ScoringQuestionType =
  | 'multiple_choice'
  | 'multi_select'
  | 'numeric'
  | 'true_false'
  | 'text';

export interface ScoringAnswer {
  id: string;
  score: number;
  // For 'type' assessment-mode models: the model type (archetype) key this
  // answer votes for. Null/undefined for normal scored models.
  typeKey?: string | null;
}

export interface ScoringQuestion {
  id: string;
  dimensionId: string | null;
  type: ScoringQuestionType;
  minValue?: number | null;
  maxValue?: number | null;
  answers: ScoringAnswer[];
}

export interface ScoringResponse {
  questionId: string;
  answerId?: string | null;
  answerIds?: string[] | null;
  numericValue?: number | null;
  booleanValue?: boolean | null;
  textValue?: string | null;
}

export interface ScoringDimension {
  id: string;
  key: string;
}

export interface ScoringMaturityLevel {
  id: string;
  name: string;
  description: string;
  minScore: number;
  maxScore: number;
}

export interface ScoringInput {
  questions: ScoringQuestion[];
  responses: ScoringResponse[];
  dimensions: ScoringDimension[];
  maturityScale?: ScoringMaturityLevel[] | null;
}

export interface ScoringOutput {
  overallScore: number;
  dimensionScores: Record<string, number>;
  label: string;
  use100PointScale: boolean;
  maxMaturityScore: number;
}

const DEFAULT_MATURITY_SCALE: ScoringMaturityLevel[] = [
  { id: '1', name: 'Nascent', description: 'Beginning AI journey', minScore: 100, maxScore: 199 },
  { id: '2', name: 'Experimental', description: 'Experimenting with AI', minScore: 200, maxScore: 299 },
  { id: '3', name: 'Operational', description: 'Operational AI processes', minScore: 300, maxScore: 399 },
  { id: '4', name: 'Strategic', description: 'Strategic AI foundations', minScore: 400, maxScore: 449 },
  { id: '5', name: 'Transformational', description: 'Leading AI transformation', minScore: 450, maxScore: 500 },
];

/**
 * Score a single response against its question.
 *
 * Returns `null` when the response is incomplete or refers to an answer that
 * does not exist on the question (matching the route's `continue` behaviour).
 */
export function scoreResponse(
  question: ScoringQuestion,
  response: ScoringResponse,
  use100PointScale: boolean,
): { score: number; maxPossible: number } | null {
  if (question.type === 'numeric') {
    if (response.numericValue === undefined || response.numericValue === null) {
      return null;
    }
    const minValue = question.minValue ?? 0;
    const maxValue = question.maxValue ?? 100;
    const range = maxValue - minValue;
    const numericValue = response.numericValue;

    if (use100PointScale) {
      const normalized = range > 0 ? (numericValue - minValue) / range : 0;
      let score = Math.round(normalized * 4);
      score = Math.max(0, Math.min(4, score));
      return { score, maxPossible: 4 };
    }
    const normalized = range > 0 ? (numericValue - minValue) / range : 0;
    let score = Math.round(normalized * 400 + 100);
    score = Math.max(100, Math.min(500, score));
    return { score, maxPossible: 500 };
  }

  if (question.type === 'multi_select') {
    const totalOptions = question.answers.length;
    const selectedCount = response.answerIds ? response.answerIds.length : 0;
    if (totalOptions > 0) {
      if (use100PointScale) {
        let score = Math.round((selectedCount / totalOptions) * 4);
        score = Math.max(0, Math.min(4, score));
        return { score, maxPossible: 4 };
      }
      let score = Math.round((selectedCount / totalOptions) * 400 + 100);
      score = Math.max(100, Math.min(500, score));
      return { score, maxPossible: 500 };
    }
    return {
      score: use100PointScale ? 0 : 100,
      maxPossible: use100PointScale ? 4 : 500,
    };
  }

  // multiple_choice / true_false / text — score from the matched answer
  const answer = question.answers.find(a => a.id === response.answerId);
  if (!answer) return null;
  const maxPossible = Math.max(...question.answers.map(a => a.score), 1);
  return { score: answer.score, maxPossible };
}

/**
 * Run the full scoring pipeline against an assessment. Pure: no DB, no I/O.
 */
export function calculateAssessmentScore(input: ScoringInput): ScoringOutput {
  const { questions, responses, dimensions } = input;
  const maturityScale = input.maturityScale && input.maturityScale.length > 0
    ? input.maturityScale
    : DEFAULT_MATURITY_SCALE;

  const maxMaturityScore = Math.max(...maturityScale.map(level => level.maxScore));
  const use100PointScale = maxMaturityScore <= 100;

  let totalScore = 0;
  let totalMaxPossible = 0;
  let questionCount = 0;
  const dimensionScores: Record<string, number[]> = {};
  const dimensionMaxScores: Record<string, number[]> = {};

  for (const response of responses) {
    const question = questions.find(q => q.id === response.questionId);
    if (!question) continue;

    const scored = scoreResponse(question, response, use100PointScale);
    if (!scored) continue;

    totalScore += scored.score;
    totalMaxPossible += scored.maxPossible;
    questionCount++;

    if (question.dimensionId) {
      const dimension = dimensions.find(d => d.id === question.dimensionId);
      if (dimension) {
        if (!dimensionScores[dimension.key]) {
          dimensionScores[dimension.key] = [];
          dimensionMaxScores[dimension.key] = [];
        }
        dimensionScores[dimension.key].push(scored.score);
        dimensionMaxScores[dimension.key].push(scored.maxPossible);
      }
    }
  }

  const dimensionAverages: Record<string, number> = {};
  for (const [key, scores] of Object.entries(dimensionScores)) {
    const dimTotal = scores.reduce((a, b) => a + b, 0);
    const dimMax = dimensionMaxScores[key].reduce((a, b) => a + b, 0);
    if (use100PointScale) {
      dimensionAverages[key] = dimMax > 0 ? Math.round((dimTotal / dimMax) * maxMaturityScore) : 0;
    } else {
      dimensionAverages[key] = scores.length > 0 ? Math.round(dimTotal / scores.length) : 0;
    }
  }

  let overallScore: number;
  if (use100PointScale) {
    overallScore = totalMaxPossible > 0
      ? Math.round((totalScore / totalMaxPossible) * maxMaturityScore)
      : 0;
  } else {
    overallScore = questionCount > 0 ? Math.round(totalScore / questionCount) : 0;
  }

  let label = maturityScale[0]?.name ?? 'Nascent';
  for (const level of maturityScale) {
    if (overallScore >= level.minScore && overallScore <= level.maxScore) {
      label = level.name;
      break;
    }
  }

  return {
    overallScore,
    dimensionScores: dimensionAverages,
    label,
    use100PointScale,
    maxMaturityScore,
  };
}

// ========== TYPE / PROPENSITY (ARCHETYPE) SCORING ==========

export interface TypeScoringType {
  key: string;
  name: string;
}

export interface TypeScoringInput {
  questions: ScoringQuestion[];
  responses: ScoringResponse[];
  types: TypeScoringType[];
}

export interface TypeScoringOutput {
  // Vote count per type key (every declared type appears, even with 0 votes).
  tally: Record<string, number>;
  // Highest vote total reached by any type.
  topCount: number;
  // All type keys sharing the top vote total (more than one ⇒ a tie).
  winnerKeys: string[];
  // Whether the result is a tie between multiple types.
  isTie: boolean;
  // Human-readable label: the winning type name, or names joined by " / " on a tie.
  label: string;
}

/**
 * Tally a type/propensity assessment. Each selected multiple-choice answer
 * casts one vote for the type declared on that answer (`answer.typeKey`).
 * The most-voted type wins; equal top totals surface as a blended tie.
 *
 * Pure: no DB, no I/O. Mirrors the type branch of
 * `calculateAssessmentResults` so it can be unit-tested in isolation.
 */
export function calculateTypeResult(input: TypeScoringInput): TypeScoringOutput {
  const { questions, responses, types } = input;

  const tally: Record<string, number> = {};
  const nameByKey: Record<string, string> = {};
  for (const type of types) {
    tally[type.key] = 0;
    nameByKey[type.key] = type.name;
  }

  for (const response of responses) {
    const question = questions.find(q => q.id === response.questionId);
    if (!question) continue;

    // Type quizzes use single-select multiple-choice answers.
    const answer = question.answers.find(a => a.id === response.answerId);
    if (!answer || !answer.typeKey) continue;

    // Ignore votes for types that are not declared on the model.
    if (!(answer.typeKey in tally)) continue;
    tally[answer.typeKey] += 1;
  }

  const counts = Object.values(tally);
  const topCount = counts.length > 0 ? Math.max(...counts) : 0;
  const winnerKeys = topCount > 0
    ? Object.keys(tally).filter(key => tally[key] === topCount)
    : [];
  const isTie = winnerKeys.length > 1;
  const label = winnerKeys.map(key => nameByKey[key] ?? key).join(' / ');

  return { tally, topCount, winnerKeys, isTie, label };
}

// ========== TYPE / PROPENSITY POPULATION AGGREGATION ==========

export interface TypeInsightAssessment {
  // Winning archetype name(s) for this respondent (result.label). May be a
  // tie joined by " / ". Falsy ⇒ counted as "Undetermined".
  archetypeLabel?: string | null;
  // Per-type vote tally for this respondent, keyed by type key (result.dimensionScores).
  typeTally?: Record<string, number>;
  userContext?: { industry?: string; companySize?: string; jobTitle?: string; country?: string };
}

export interface TypeInsightAggregate {
  total: number;
  // Count of respondents whose dominant archetype is each name.
  archetypeCounts: Record<string, number>;
  // Aggregate answer-votes per archetype name across the whole population.
  propensityByName: Record<string, number>;
  totalVotes: number;
  // "Primary → strongest secondary" co-occurrence counts, sorted desc.
  overlapPairs: Array<{ pair: string; count: number }>;
  // Archetype mix within each demographic segment: segment ⇒ name ⇒ count.
  byIndustry: Record<string, Record<string, number>>;
  bySize: Record<string, Record<string, number>>;
  byRole: Record<string, Record<string, number>>;
}

/**
 * Aggregate a population of type/propensity (archetype) results into the
 * distributions used by the AI insights engine: dominant-archetype counts,
 * overall propensity (vote share), archetype overlap (strongest secondary per
 * respondent), and demographic cross-tabs.
 *
 * Pure: no DB, no I/O — so the population analytics can be unit-tested without
 * an AI provider. `types` maps type keys to display names.
 */
export function aggregateTypeInsights(
  assessments: TypeInsightAssessment[],
  types: TypeScoringType[],
): TypeInsightAggregate {
  const nameByKey: Record<string, string> = {};
  for (const t of types) nameByKey[t.key] = t.name;

  const resolveName = (label?: string | null, fallbackKey?: string): string => {
    if (label && label.trim()) return label;
    if (fallbackKey) return nameByKey[fallbackKey] ?? fallbackKey;
    return 'Undetermined';
  };

  const archetypeCounts: Record<string, number> = {};
  const voteByKey: Record<string, number> = {};
  const secondary: Record<string, number> = {};

  const crossTab = (
    getter: (a: TypeInsightAssessment) => string | undefined,
  ): Record<string, Record<string, number>> => {
    const out: Record<string, Record<string, number>> = {};
    for (const a of assessments) {
      const seg = getter(a);
      if (!seg || !seg.trim()) continue;
      const name = resolveName(a.archetypeLabel);
      (out[seg] ??= {})[name] = (out[seg][name] || 0) + 1;
    }
    return out;
  };

  for (const a of assessments) {
    archetypeCounts[resolveName(a.archetypeLabel)] =
      (archetypeCounts[resolveName(a.archetypeLabel)] || 0) + 1;

    for (const [k, v] of Object.entries(a.typeTally || {})) {
      voteByKey[k] = (voteByKey[k] || 0) + (Number(v) || 0);
    }

    // Overlap requires a CLEAR primary and a non-zero secondary. When the top
    // two tallies are tied (co-dominant / blended archetype), there is no
    // directional "primary → secondary", so skip it.
    const entries = Object.entries(a.typeTally || {}).sort((x, y) => y[1] - x[1]);
    if (entries.length >= 2 && entries[1][1] > 0 && entries[0][1] > entries[1][1]) {
      const primary = resolveName(a.archetypeLabel, entries[0][0]);
      const sec = resolveName(null, entries[1][0]);
      if (primary !== sec) {
        const pair = `${primary} → ${sec}`;
        secondary[pair] = (secondary[pair] || 0) + 1;
      }
    }
  }

  const propensityByName: Record<string, number> = {};
  for (const [k, v] of Object.entries(voteByKey)) {
    const name = nameByKey[k] || k;
    propensityByName[name] = (propensityByName[name] || 0) + v;
  }

  const overlapPairs = Object.entries(secondary)
    .map(([pair, count]) => ({ pair, count }))
    .sort((a, b) => b.count - a.count);

  return {
    total: assessments.length,
    archetypeCounts,
    propensityByName,
    totalVotes: Object.values(voteByKey).reduce((s, v) => s + v, 0),
    overlapPairs,
    byIndustry: crossTab(a => a.userContext?.industry),
    bySize: crossTab(a => a.userContext?.companySize),
    byRole: crossTab(a => a.userContext?.jobTitle),
  };
}
