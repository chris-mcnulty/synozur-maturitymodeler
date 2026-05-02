import { storage } from "../storage";
import { db } from "../db";
import { inArray } from "drizzle-orm";
import * as schema from "@shared/schema";
import { ServiceError } from "./service-error";

export async function getAssessmentReview(assessmentId: string) {
  const assessment = await storage.getAssessment(assessmentId);
  if (!assessment) {
    throw new ServiceError(404, "Assessment not found");
  }

  const [responses, model, dimensions, result, modelQuestions] = await Promise.all([
    storage.getAssessmentResponses(assessment.id),
    storage.getModel(assessment.modelId),
    storage.getDimensionsByModelId(assessment.modelId),
    storage.getResult(assessment.id),
    storage.getQuestionsByModelId(assessment.modelId),
  ]);

  const modelQuestionIds = modelQuestions.map(q => q.id);
  const allAnswersForReview = modelQuestionIds.length > 0
    ? await db.select().from(schema.answers)
        .where(inArray(schema.answers.questionId, modelQuestionIds))
    : [];
  const questionMap = new Map(modelQuestions.map(q => [q.id, q]));
  const answersByQuestionId = new Map<string, typeof allAnswersForReview>();
  for (const a of allAnswersForReview) {
    if (!answersByQuestionId.has(a.questionId)) {
      answersByQuestionId.set(a.questionId, []);
    }
    answersByQuestionId.get(a.questionId)!.push(a);
  }

  const resolvedQuestions = responses.map((r) => {
    const question = questionMap.get(r.questionId);
    if (!question) return null;

    let answerText = '';
    let answerScore: number | null = null;

    if (r.booleanValue !== null && r.booleanValue !== undefined) {
      answerText = r.booleanValue ? 'Yes' : 'No';
    } else if (r.numericValue !== null && r.numericValue !== undefined) {
      answerText = `${r.numericValue}${question.unit ? ' ' + question.unit : ''}`;
      answerScore = r.numericValue;
    } else if (r.textValue) {
      answerText = r.textValue;
    } else if (r.answerIds && r.answerIds.length > 0) {
      const answers = answersByQuestionId.get(r.questionId) ?? [];
      const answerById = new Map(answers.map(a => [a.id, a]));
      answerText = r.answerIds
        .map((aid) => answerById.get(aid)?.text || aid)
        .join('; ');
    } else if (r.answerId) {
      const answers = answersByQuestionId.get(r.questionId) ?? [];
      const matched = answers.find((a) => a.id === r.answerId);
      answerText = matched?.text || r.answerId;
      answerScore = matched?.score ?? null;
    }

    return {
      questionId: question.id,
      dimensionId: question.dimensionId,
      order: question.order,
      questionText: question.text,
      questionType: question.type,
      answerText,
      answerScore,
      respondedAt: r.createdAt,
    };
  });

  const validQuestions = resolvedQuestions.filter(Boolean) as NonNullable<typeof resolvedQuestions[number]>[];
  const dimensionMap = new Map(dimensions.map((d) => [d.id, d]));

  const grouped: Record<string, { dimensionName: string; order: number; questions: typeof validQuestions }> = {};
  const noDimKey = '__none__';

  for (const q of validQuestions) {
    const key = q.dimensionId || noDimKey;
    if (!grouped[key]) {
      const dim = q.dimensionId ? dimensionMap.get(q.dimensionId) : null;
      grouped[key] = {
        dimensionName: dim?.label || 'General',
        order: dim?.order ?? 999,
        questions: [],
      };
    }
    grouped[key].questions.push(q);
  }

  for (const group of Object.values(grouped)) {
    group.questions.sort((a, b) => a.order - b.order);
  }

  const dimensionGroups = Object.values(grouped).sort((a, b) => a.order - b.order);

  return {
    assessment: {
      id: assessment.id,
      modelName: model?.name || 'Unknown Model',
      status: assessment.status,
      startedAt: assessment.startedAt,
      completedAt: assessment.completedAt,
      isProxy: assessment.isProxy,
      subject: assessment.isProxy
        ? {
            name: assessment.proxyName,
            company: assessment.proxyCompany,
            jobTitle: assessment.proxyJobTitle,
            industry: assessment.proxyIndustry,
            country: assessment.proxyCountry,
          }
        : null,
    },
    result: result
      ? { overallScore: result.overallScore, label: result.label }
      : null,
    dimensionGroups,
    totalQuestions: validQuestions.length,
  };
}
