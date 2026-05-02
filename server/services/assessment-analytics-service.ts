import { storage } from "../storage";
import { db } from "../db";
import { eq, inArray } from "drizzle-orm";
import * as schema from "@shared/schema";
import { calculateAssessmentScore, type ScoringQuestion } from "./scoring";
import { ServiceError } from "./service-error";

export async function calculateAssessmentResults(assessmentId: string) {
  const assessment = await storage.getAssessment(assessmentId);
  if (!assessment) {
    throw new ServiceError(404, "Assessment not found");
  }

  const responses = await storage.getAssessmentResponses(assessmentId);
  if (responses.length === 0) {
    throw new ServiceError(400, "No responses found for this assessment");
  }

  const model = await storage.getModel(assessment.modelId);
  if (!model) {
    throw new ServiceError(404, "Model not found");
  }

  const dimensions = await storage.getDimensionsByModelId(model.id);
  const questions = await storage.getQuestionsByModelId(model.id);

  const allQuestionIds = questions.map(q => q.id);
  const allAnswersForModel = allQuestionIds.length > 0
    ? await db.select().from(schema.answers)
        .where(inArray(schema.answers.questionId, allQuestionIds))
    : [];
  const answersByQuestionId = new Map<string, Array<{ id: string; score: number }>>();
  for (const a of allAnswersForModel) {
    if (!answersByQuestionId.has(a.questionId)) {
      answersByQuestionId.set(a.questionId, []);
    }
    answersByQuestionId.get(a.questionId)!.push({ id: a.id, score: a.score });
  }

  const scoringQuestions: ScoringQuestion[] = questions.map(q => ({
    id: q.id,
    dimensionId: q.dimensionId ?? null,
    type: q.type as ScoringQuestion['type'],
    minValue: q.minValue ?? null,
    maxValue: q.maxValue ?? null,
    answers: answersByQuestionId.get(q.id) ?? [],
  }));

  const scoringResult = calculateAssessmentScore({
    questions: scoringQuestions,
    responses: responses.map(r => ({
      questionId: r.questionId,
      answerId: r.answerId ?? null,
      answerIds: r.answerIds ?? null,
      numericValue: r.numericValue ?? null,
      booleanValue: r.booleanValue ?? null,
      textValue: r.textValue ?? null,
    })),
    dimensions: dimensions.map(d => ({ id: d.id, key: d.key })),
    maturityScale: model.maturityScale ?? null,
  });

  const result = await storage.createResult({
    assessmentId,
    overallScore: scoringResult.overallScore,
    label: scoringResult.label,
    dimensionScores: scoringResult.dimensionScores,
  });

  await storage.updateAssessment(assessmentId, {
    status: "completed",
    completedAt: new Date(),
  } as any);

  return result;
}

export async function bulkAssignDemographics(params: {
  tagId: string;
  industry?: string;
  companySize?: string;
  country?: string;
}) {
  const { tagId, industry, companySize, country } = params;

  if (!tagId) {
    throw new ServiceError(400, "Tag ID is required");
  }

  if (!industry && !companySize && !country) {
    throw new ServiceError(400, "At least one demographic field (industry, companySize, or country) is required");
  }

  const tagAssignments = await db
    .select({ assessmentId: schema.assessmentTagAssignments.assessmentId })
    .from(schema.assessmentTagAssignments)
    .where(eq(schema.assessmentTagAssignments.tagId, tagId));

  if (tagAssignments.length === 0) {
    return {
      success: true,
      message: "No assessments found with this tag",
      updatedCount: 0,
      demographics: {},
    };
  }

  const assessmentIds = tagAssignments.map(a => a.assessmentId);

  const updateData: Record<string, string> = {};
  if (industry) updateData.proxyIndustry = industry;
  if (companySize) updateData.proxyCompanySize = companySize;
  if (country) updateData.proxyCountry = country;

  let updatedCount = 0;
  for (const assessmentId of assessmentIds) {
    await db
      .update(schema.assessments)
      .set(updateData)
      .where(eq(schema.assessments.id, assessmentId));
    updatedCount++;
  }

  return {
    success: true,
    message: `Updated demographics for ${updatedCount} assessments`,
    updatedCount,
    demographics: updateData,
  };
}

export async function exportModelAnalysis(modelSlug: string) {
  const modelResult = await db
    .select()
    .from(schema.models)
    .where(eq(schema.models.slug, modelSlug))
    .limit(1);

  const model = modelResult[0];
  if (!model) {
    throw new ServiceError(404, "Model not found");
  }

  const dimensions = await db
    .select()
    .from(schema.dimensions)
    .where(eq(schema.dimensions.modelId, model.id))
    .orderBy(schema.dimensions.order);

  const questions = await db
    .select()
    .from(schema.questions)
    .where(eq(schema.questions.modelId, model.id))
    .orderBy(schema.questions.order);

  const questionIds = questions.map(q => q.id);
  const allAnswers = questionIds.length > 0 ? await db
    .select()
    .from(schema.answers)
    .where(inArray(schema.answers.questionId, questionIds))
    .orderBy(schema.answers.order) : [];

  const assessments = await db
    .select()
    .from(schema.assessments)
    .where(eq(schema.assessments.modelId, model.id));

  const exportData = {
    model: {
      id: model.id,
      name: model.name,
      slug: model.slug,
      description: model.description,
      maturityScale: model.maturityScale,
    },
    dimensions: dimensions.map(d => ({
      id: d.id,
      key: d.key,
      label: d.label,
      description: d.description,
      order: d.order,
    })),
    questions: questions.map(q => {
      const questionAnswers = allAnswers.filter(a => a.questionId === q.id);
      const dimension = dimensions.find(d => d.id === q.dimensionId);

      return {
        id: q.id,
        text: q.text,
        type: q.type,
        dimension: dimension ? {
          key: dimension.key,
          label: dimension.label,
        } : null,
        order: q.order,
        minValue: q.minValue,
        maxValue: q.maxValue,
        unit: q.unit,
        placeholder: q.placeholder,
        answers: questionAnswers.map(a => ({
          id: a.id,
          text: a.text,
          score: a.score,
          order: a.order,
        })),
      };
    }),
    assessments: [] as any[],
  };

  for (const assessment of assessments) {
    let userData = null;
    if (assessment.userId) {
      const userResult = await db
        .select({
          name: schema.users.name,
          company: schema.users.company,
          jobTitle: schema.users.jobTitle,
          industry: schema.users.industry,
          companySize: schema.users.companySize,
          country: schema.users.country,
        })
        .from(schema.users)
        .where(eq(schema.users.id, assessment.userId))
        .limit(1);

      userData = userResult[0] || null;
    }

    const resultResult = await db
      .select()
      .from(schema.results)
      .where(eq(schema.results.assessmentId, assessment.id))
      .limit(1);

    const result = resultResult[0];
    if (!result) continue;

    const responses = await db
      .select()
      .from(schema.assessmentResponses)
      .where(eq(schema.assessmentResponses.assessmentId, assessment.id));

    const tagAssignments = await db
      .select({
        tagName: schema.assessmentTags.name,
        tagColor: schema.assessmentTags.color,
      })
      .from(schema.assessmentTagAssignments)
      .innerJoin(schema.assessmentTags, eq(schema.assessmentTagAssignments.tagId, schema.assessmentTags.id))
      .where(eq(schema.assessmentTagAssignments.assessmentId, assessment.id));

    const responseDetails = responses.map(r => {
      const question = questions.find(q => q.id === r.questionId);
      if (!question) return null;

      let selectedAnswers: Array<{ id: string; text: string; score: number }> = [];

      if (r.answerIds && r.answerIds.length > 0) {
        selectedAnswers = allAnswers
          .filter(a => r.answerIds!.includes(a.id))
          .map(a => ({
            id: a.id,
            text: a.text,
            score: a.score,
          }));
      } else if (r.answerId) {
        const answer = allAnswers.find(a => a.id === r.answerId);
        if (answer) {
          selectedAnswers = [{
            id: answer.id,
            text: answer.text,
            score: answer.score,
          }];
        }
      }

      return {
        questionId: r.questionId,
        questionText: question.text,
        questionType: question.type,
        selectedAnswers,
        numericValue: r.numericValue,
        booleanValue: r.booleanValue,
        textValue: r.textValue,
      };
    }).filter((item): item is NonNullable<typeof item> => item !== null);

    exportData.assessments.push({
      id: assessment.id,
      createdAt: assessment.startedAt,
      startedAt: assessment.startedAt,
      completedAt: assessment.completedAt,
      user: userData,
      isImported: !!assessment.importBatchId,
      isProxy: assessment.isProxy || false,
      tags: tagAssignments.map(t => t.tagName),
      results: {
        overallScore: result.overallScore,
        label: result.label,
        dimensionScores: result.dimensionScores,
      },
      responses: responseDetails,
    });
  }

  return { modelSlug, exportData };
}
