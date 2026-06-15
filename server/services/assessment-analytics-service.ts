import { storage } from "../storage";
import { db } from "../db";
import { eq, inArray } from "drizzle-orm";
import * as schema from "@shared/schema";
import { calculateAssessmentScore, calculateTypeResult, type ScoringQuestion } from "./scoring";
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
  const answersByQuestionId = new Map<string, Array<{ id: string; score: number; typeKey?: string | null }>>();
  for (const a of allAnswersForModel) {
    if (!answersByQuestionId.has(a.questionId)) {
      answersByQuestionId.set(a.questionId, []);
    }
    answersByQuestionId.get(a.questionId)!.push({ id: a.id, score: a.score, typeKey: a.typeKey ?? null });
  }

  const scoringQuestions: ScoringQuestion[] = questions.map(q => ({
    id: q.id,
    dimensionId: q.dimensionId ?? null,
    type: q.type as ScoringQuestion['type'],
    minValue: q.minValue ?? null,
    maxValue: q.maxValue ?? null,
    answers: answersByQuestionId.get(q.id) ?? [],
  }));

  // ----- Type / propensity (archetype) models: tally votes instead of scoring -----
  if (model.assessmentMode === 'type') {
    const modelTypes = await storage.getModelTypesByModelId(model.id);
    const typeResult = calculateTypeResult({
      questions: scoringQuestions,
      responses: responses.map(r => ({
        questionId: r.questionId,
        answerId: r.answerId ?? null,
      })),
      types: modelTypes.map(t => ({ key: t.key, name: t.name })),
    });

    // Persist: overallScore is unused for type models (kept 0 to satisfy the
    // NOT NULL column); label = winning archetype name(s); dimensionScores
    // stores the per-type vote tally so the results page can derive winners.
    const existingTypeResult = await storage.getResult(assessmentId);
    const typeResultRow = existingTypeResult
      ? (await storage.updateResult(existingTypeResult.id, {
          overallScore: 0,
          label: typeResult.label,
          dimensionScores: typeResult.tally,
        })) ?? existingTypeResult
      : await storage.createResult({
          assessmentId,
          overallScore: 0,
          label: typeResult.label,
          dimensionScores: typeResult.tally,
        });

    await storage.updateAssessment(assessmentId, {
      status: "completed",
      completedAt: new Date(),
    } as any);

    try {
      if (assessment.tenantId) {
        const { emitGalaxyEvent } = await import('../routes/galaxy/webhooks');
        await emitGalaxyEvent(assessment.tenantId, 'assessment.completed', {
          assessmentId,
          modelId: assessment.modelId,
          userId: assessment.userId,
          score: 0,
          label: typeResult.label,
        });
      }
    } catch (err) {
      console.error('[galaxy] webhook emission failed', err);
    }

    return typeResultRow;
  }

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

  // Upsert: regenerating an already-scored assessment must update the
  // existing row rather than violating the unique(assessment_id) index.
  const existingResult = await storage.getResult(assessmentId);
  const result = existingResult
    ? (await storage.updateResult(existingResult.id, {
        overallScore: scoringResult.overallScore,
        label: scoringResult.label,
        dimensionScores: scoringResult.dimensionScores,
      })) ?? existingResult
    : await storage.createResult({
        assessmentId,
        overallScore: scoringResult.overallScore,
        label: scoringResult.label,
        dimensionScores: scoringResult.dimensionScores,
      });

  await storage.updateAssessment(assessmentId, {
    status: "completed",
    completedAt: new Date(),
  } as any);

  // Galaxy webhook emission. Best-effort; never blocks completion.
  try {
    if (assessment.tenantId) {
      const { emitGalaxyEvent } = await import('../routes/galaxy/webhooks');
      await emitGalaxyEvent(assessment.tenantId, 'assessment.completed', {
        assessmentId,
        modelId: assessment.modelId,
        userId: assessment.userId,
        score: scoringResult.overallScore,
        label: scoringResult.label,
      });
    }
  } catch (err) {
    console.error('[galaxy] webhook emission failed', err);
  }

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

  const assessmentIds = assessments.map(a => a.id);
  const userIds = Array.from(
    new Set(assessments.map(a => a.userId).filter((id): id is string => !!id))
  );

  const usersList = userIds.length > 0
    ? await db
        .select({
          id: schema.users.id,
          name: schema.users.name,
          company: schema.users.company,
          jobTitle: schema.users.jobTitle,
          industry: schema.users.industry,
          companySize: schema.users.companySize,
          country: schema.users.country,
        })
        .from(schema.users)
        .where(inArray(schema.users.id, userIds))
    : [];
  const usersById = new Map(usersList.map(u => [u.id, u]));

  const resultsList = assessmentIds.length > 0
    ? await db
        .select()
        .from(schema.results)
        .where(inArray(schema.results.assessmentId, assessmentIds))
    : [];
  const resultsByAssessment = new Map(resultsList.map(r => [r.assessmentId, r]));

  const responsesList = assessmentIds.length > 0
    ? await db
        .select()
        .from(schema.assessmentResponses)
        .where(inArray(schema.assessmentResponses.assessmentId, assessmentIds))
    : [];
  const responsesByAssessment = new Map<string, typeof responsesList>();
  for (const r of responsesList) {
    const list = responsesByAssessment.get(r.assessmentId);
    if (list) list.push(r);
    else responsesByAssessment.set(r.assessmentId, [r]);
  }

  const tagAssignmentsList = assessmentIds.length > 0
    ? await db
        .select({
          assessmentId: schema.assessmentTagAssignments.assessmentId,
          tagName: schema.assessmentTags.name,
          tagColor: schema.assessmentTags.color,
        })
        .from(schema.assessmentTagAssignments)
        .innerJoin(schema.assessmentTags, eq(schema.assessmentTagAssignments.tagId, schema.assessmentTags.id))
        .where(inArray(schema.assessmentTagAssignments.assessmentId, assessmentIds))
    : [];
  const tagsByAssessment = new Map<string, typeof tagAssignmentsList>();
  for (const t of tagAssignmentsList) {
    const list = tagsByAssessment.get(t.assessmentId);
    if (list) list.push(t);
    else tagsByAssessment.set(t.assessmentId, [t]);
  }

  const questionsById = new Map(questions.map(q => [q.id, q]));
  const answersById = new Map(allAnswers.map(a => [a.id, a]));

  for (const assessment of assessments) {
    const userData = assessment.userId
      ? (() => {
          const u = usersById.get(assessment.userId);
          if (!u) return null;
          const { id: _id, ...rest } = u;
          return rest;
        })()
      : null;

    const result = resultsByAssessment.get(assessment.id);
    if (!result) continue;

    const responses = responsesByAssessment.get(assessment.id) ?? [];
    const tagAssignments = tagsByAssessment.get(assessment.id) ?? [];

    const responseDetails = responses.map(r => {
      const question = questionsById.get(r.questionId);
      if (!question) return null;

      let selectedAnswers: Array<{ id: string; text: string; score: number }> = [];

      if (r.answerIds && r.answerIds.length > 0) {
        selectedAnswers = r.answerIds
          .map(id => answersById.get(id))
          .filter((a): a is NonNullable<typeof a> => !!a)
          .map(a => ({
            id: a.id,
            text: a.text,
            score: a.score,
          }));
      } else if (r.answerId) {
        const answer = answersById.get(r.answerId);
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
