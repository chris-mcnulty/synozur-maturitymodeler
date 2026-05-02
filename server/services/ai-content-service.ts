import { storage } from "../storage";
import { db } from "../db";
import { eq, inArray } from "drizzle-orm";
import * as schema from "@shared/schema";
import { aiService } from "./ai-service";
import { providerRegistry } from "./ai-providers/registry";
import { ServiceError } from "./service-error";
import { createHash } from "crypto";

export async function generateAssessmentRecommendations(assessmentId: string) {
  const assessment = await storage.getAssessment(assessmentId);
  if (!assessment || assessment.status !== 'completed') {
    throw new ServiceError(404, "Completed assessment not found");
  }

  const [model, dimensions, result, user] = await Promise.all([
    storage.getModel(assessment.modelId),
    storage.getDimensionsByModelId(assessment.modelId),
    storage.getResult(assessmentId),
    assessment.userId ? storage.getUser(assessment.userId) : null,
  ]);

  if (!model || !result) {
    throw new ServiceError(404, "Required data not found");
  }

  const context = {
    assessment,
    model,
    dimensions,
    user: user || undefined,
    scores: result.dimensionScores as Record<string, number>,
  };

  const contextString = JSON.stringify({
    modelId: model.id,
    scores: result.dimensionScores,
    industry: user?.industry,
    companySize: user?.companySize,
  });
  const contextHash = createHash('sha256').update(contextString).digest('hex');

  const cached = await storage.getAiGeneratedContent('recommendation', contextHash);
  if (cached && new Date(cached.expiresAt) > new Date()) {
    return cached.content;
  }

  const recommendations = await aiService.generateRecommendations(context);

  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 7);

  await storage.createAiGeneratedContent({
    type: 'recommendation',
    contextHash,
    content: recommendations as any,
    metadata: { assessmentId: assessment.id, modelId: model.id },
    expiresAt,
  });

  if (assessment.userId) {
    await storage.createAiUsageLog({
      userId: assessment.userId,
      modelName: (await providerRegistry.getActiveConfig()).modelId || 'unknown',
      operation: 'recommendation',
      estimatedCost: 5,
    });
  }

  return recommendations;
}

export async function bulkRewriteAnswers(params: {
  questionId: string;
  questionText: string;
  answers: Array<{ id: string; text: string; score: number }>;
  modelContext?: any;
  userId: string;
}) {
  const { questionId, questionText, answers, modelContext, userId } = params;

  if (!questionId || !questionText || !Array.isArray(answers) || answers.length === 0) {
    throw new ServiceError(400, "Question ID, question text, and answers array are required");
  }

  const reviewIds: string[] = [];

  for (const answer of answers) {
    if (!answer.text || answer.score === undefined) {
      continue;
    }

    try {
      const rewrittenAnswer = await aiService.rewriteAnswer(
        questionText,
        answer.text,
        answer.score,
        modelContext
      );

      const review = await storage.createAiContentReview({
        type: 'answer-rewrite',
        contentType: 'answer_rewrite',
        targetId: answer.id,
        generatedContent: { rewrittenAnswer } as any,
        metadata: { questionText, answerText: answer.text, answerScore: answer.score, modelContext },
        status: 'pending',
        createdBy: userId,
      });

      reviewIds.push(review.id);

      await storage.createAiUsageLog({
        userId,
        modelName: (await providerRegistry.getActiveConfig()).modelId || 'unknown',
        operation: 'rewrite-answer',
        estimatedCost: 1,
      });
    } catch (answerError) {
      console.error(`Failed to rewrite answer ${answer.id}:`, answerError);
    }
  }

  return {
    success: true,
    message: `${reviewIds.length} answer rewrites generated and sent to review queue`,
    reviewIds,
    count: reviewIds.length,
  };
}

export async function approveAiReview(params: {
  id: string;
  selectedItemIds?: string[];
  editedContent?: any;
  userId: string;
}) {
  const { id, selectedItemIds, editedContent, userId } = params;

  const review = await storage.getAiReviewById(id);
  if (!review) {
    throw new ServiceError(404, "Review not found");
  }

  if (review.status !== 'pending') {
    throw new ServiceError(400, "Review has already been processed");
  }

  const contentToApprove = editedContent || review.generatedContent;
  let partialContent: any = contentToApprove;

  if (selectedItemIds && selectedItemIds.length > 0) {
    switch (review.contentType) {
      case 'dimension_resources': {
        const resourceIndices = selectedItemIds
          .filter((sid: string) => sid.startsWith('resource-'))
          .map((sid: string) => parseInt(sid.replace('resource-', '')));

        if (contentToApprove.resources) {
          partialContent = {
            ...contentToApprove,
            resources: contentToApprove.resources.filter((_: any, idx: number) =>
              resourceIndices.includes(idx)
            ),
          };
        }
        break;
      }

      case 'maturity_level_interpretation': {
        partialContent = { ...contentToApprove };

        const charIndices = selectedItemIds
          .filter((sid: string) => sid.startsWith('characteristic-'))
          .map((sid: string) => parseInt(sid.replace('characteristic-', '')));

        if (charIndices.length > 0 && contentToApprove.characteristics) {
          partialContent = {
            ...partialContent,
            characteristics: contentToApprove.characteristics.filter((_: string, idx: number) =>
              charIndices.includes(idx)
            ),
          };
        }

        if (!selectedItemIds.includes('interpretation')) {
          delete (partialContent as any).interpretation;
          delete (partialContent as any).title;
        }
        break;
      }

      case 'answer_improvement':
      case 'answer_rewrite':
        if (!selectedItemIds.includes('main-content')) {
          throw new ServiceError(400, "No content selected for approval");
        }
        break;
    }
  }

  review.generatedContent = partialContent;

  const approved = await storage.approveAiReview(id, userId);

  try {
    switch (review.contentType) {
      case 'answer_rewrite':
        if (review.targetId && partialContent.rewrittenAnswer) {
          await db.update(schema.answers)
            .set({ text: partialContent.rewrittenAnswer })
            .where(eq(schema.answers.id, review.targetId));
        }
        break;

      case 'answer_improvement':
        if (review.targetId && partialContent.improvementStatement) {
          await db.update(schema.answers)
            .set({ improvementStatement: partialContent.improvementStatement })
            .where(eq(schema.answers.id, review.targetId));
        }
        break;
    }
  } catch (applyError) {
    console.error('Failed to apply approved content:', applyError);
  }

  return {
    success: true,
    message: selectedItemIds ? "Selected content approved and applied successfully" : "Content approved and applied successfully",
    review: approved,
  };
}

export async function rejectAiReview(params: {
  id: string;
  reason?: string;
  selectedItemIds?: string[];
  userId: string;
}) {
  const { id, reason, selectedItemIds, userId } = params;

  const review = await storage.getAiReviewById(id);
  if (!review) {
    throw new ServiceError(404, "Review not found");
  }

  if (review.status !== 'pending') {
    throw new ServiceError(400, "Review has already been processed");
  }

  if (selectedItemIds && selectedItemIds.length > 0) {
    let remainingContent: any = { ...(review.generatedContent || {}) };

    switch (review.contentType) {
      case 'dimension_resources': {
        const rejectedResourceIndices = selectedItemIds
          .filter((sid: string) => sid.startsWith('resource-'))
          .map((sid: string) => parseInt(sid.replace('resource-', '')));

        if (remainingContent.resources) {
          remainingContent = {
            ...remainingContent,
            resources: remainingContent.resources.filter((_: any, idx: number) =>
              !rejectedResourceIndices.includes(idx)
            ),
          };
        }
        break;
      }

      case 'maturity_level_interpretation': {
        const rejectedCharIndices = selectedItemIds
          .filter((sid: string) => sid.startsWith('characteristic-'))
          .map((sid: string) => parseInt(sid.replace('characteristic-', '')));

        if (rejectedCharIndices.length > 0 && remainingContent.characteristics) {
          remainingContent = {
            ...remainingContent,
            characteristics: remainingContent.characteristics.filter((_: string, idx: number) =>
              !rejectedCharIndices.includes(idx)
            ),
          };
        }

        if (selectedItemIds.includes('interpretation')) {
          delete remainingContent.interpretation;
          delete remainingContent.title;
        }
        break;
      }

      case 'answer_improvement':
      case 'answer_rewrite':
        if (selectedItemIds.includes('main-content')) {
          const rejected = await storage.rejectAiReview(id, userId, reason);
          return {
            success: true,
            message: "Content rejected successfully",
            review: rejected,
          };
        }
        break;
    }

    review.generatedContent = remainingContent;

    const hasRemainingContent =
      (review.contentType === 'dimension_resources' && remainingContent.resources?.length > 0) ||
      (review.contentType === 'maturity_level_interpretation' &&
        (remainingContent.interpretation || remainingContent.characteristics?.length > 0)) ||
      (review.contentType === 'answer_improvement' && remainingContent.improvementStatement) ||
      (review.contentType === 'answer_rewrite' && remainingContent.rewrittenAnswer);

    if (!hasRemainingContent) {
      const rejected = await storage.rejectAiReview(id, userId, reason);
      return {
        success: true,
        message: "All content rejected",
        review: rejected,
      };
    }

    return {
      success: true,
      message: "Selected items rejected, remaining items still pending",
      review,
    };
  } else {
    const rejected = await storage.rejectAiReview(id, userId, reason);

    return {
      success: true,
      message: "Content rejected successfully",
      review: rejected,
    };
  }
}

export async function generateAssessmentInsights(params: {
  assessmentIds: string[];
  userId: string;
}) {
  const { assessmentIds, userId } = params;

  if (!assessmentIds || !Array.isArray(assessmentIds) || assessmentIds.length === 0) {
    throw new ServiceError(400, "Assessment IDs are required");
  }

  const assessments = await db.select()
    .from(schema.assessments)
    .where(inArray(schema.assessments.id, assessmentIds));

  if (assessments.length === 0) {
    throw new ServiceError(404, "No assessments found");
  }

  const results = await db.select()
    .from(schema.results)
    .where(inArray(schema.results.assessmentId, assessmentIds));
  const resultsMap = new Map(results.map(r => [r.assessmentId, r]));

  const modelIds = Array.from(new Set(assessments.map(a => a.modelId)));
  const models = await db.select()
    .from(schema.models)
    .where(inArray(schema.models.id, modelIds));
  const modelMap = new Map(models.map(m => [m.id, m]));

  const dimensions = await db.select()
    .from(schema.dimensions)
    .where(inArray(schema.dimensions.modelId, modelIds));
  const dimensionsByModel = dimensions.reduce((acc, d) => {
    if (!acc[d.modelId]) acc[d.modelId] = [];
    acc[d.modelId].push(d);
    return acc;
  }, {} as Record<string, typeof dimensions>);

  const userIds = Array.from(new Set(assessments.filter(a => a.userId).map(a => a.userId!)));
  const users = userIds.length > 0
    ? await db.select().from(schema.users).where(inArray(schema.users.id, userIds))
    : [];
  const userMap = new Map(users.map(u => [u.id, u]));

  const tagAssignments = await db.select()
    .from(schema.assessmentTagAssignments)
    .where(inArray(schema.assessmentTagAssignments.assessmentId, assessmentIds));

  const tagIds = Array.from(new Set(tagAssignments.map(ta => ta.tagId)));
  const tags = tagIds.length > 0
    ? await db.select().from(schema.assessmentTags).where(inArray(schema.assessmentTags.id, tagIds))
    : [];
  const tagMap = new Map(tags.map(t => [t.id, t]));

  const assessmentTagsMap = new Map<string, string[]>();
  tagAssignments.forEach(ta => {
    if (!assessmentTagsMap.has(ta.assessmentId)) {
      assessmentTagsMap.set(ta.assessmentId, []);
    }
    const tag = tagMap.get(ta.tagId);
    if (tag) {
      assessmentTagsMap.get(ta.assessmentId)!.push(tag.name);
    }
  });

  const assessmentData = assessments.map(a => {
    const model = modelMap.get(a.modelId);
    const result = resultsMap.get(a.id);
    const dims = dimensionsByModel[a.modelId] || [];
    const user = a.userId ? userMap.get(a.userId) : null;

    const dimensionScoresRaw = (result?.dimensionScores || {}) as Record<string, number>;
    const dimensionScores: Record<string, number> = {};
    const dimensionLabels: Record<string, string> = {};

    dims.forEach(dim => {
      dimensionScores[dim.key] = dimensionScoresRaw[dim.key] || 0;
      dimensionLabels[dim.key] = dim.label;
    });

    let userContext: { industry?: string; companySize?: string; jobTitle?: string; country?: string } = {};
    if (a.isProxy) {
      userContext = {
        industry: a.proxyIndustry || undefined,
        companySize: a.proxyCompanySize || undefined,
        jobTitle: a.proxyJobTitle || undefined,
        country: a.proxyCountry || undefined,
      };
    } else if (user) {
      userContext = {
        industry: user.industry || undefined,
        companySize: user.companySize || undefined,
        jobTitle: user.jobTitle || undefined,
        country: user.country || undefined,
      };
    }

    const maturityScale = model?.maturityScale as any[] || [];
    const maxScaleScore = maturityScale.length > 0 ? Math.max(...maturityScale.map(s => s.maxScore || 100)) : 100;
    const maxScore = maxScaleScore;

    return {
      id: a.id,
      modelId: a.modelId,
      modelName: model?.name || 'Unknown Model',
      totalScore: result?.overallScore || 0,
      maxScore,
      completedAt: a.completedAt,
      dimensionScores,
      dimensionLabels,
      userContext,
      isProxy: a.isProxy || false,
      tags: assessmentTagsMap.get(a.id) || [],
    };
  });

  const insights = await aiService.generateAssessmentInsights(assessmentData);

  await storage.createAiUsageLog({
    userId,
    modelName: (await providerRegistry.getActiveConfig()).modelId || 'unknown',
    operation: 'generate-assessment-insights',
    estimatedCost: 5,
  });

  return insights;
}
