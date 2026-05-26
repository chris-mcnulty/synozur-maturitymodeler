import { storage } from "../storage";
import { db } from "../db";
import { inArray } from "drizzle-orm";
import * as schema from "@shared/schema";
import type { Answer } from "@shared/schema";
import { ServiceError } from "./service-error";

export async function duplicateModel(sourceId: string) {
  const sourceModel = await storage.getModel(sourceId);
  if (!sourceModel) {
    throw new ServiceError(404, "Model not found");
  }

  const dimensions = await storage.getDimensionsByModelId(sourceModel.id);
  const questions = await storage.getQuestionsByModelId(sourceModel.id);

  const baseName = `${sourceModel.name} (Copy)`;
  const baseSlug = `${sourceModel.slug}-copy`;

  const existingModels = await storage.getAllModels();
  let copyNum = 1;
  let newName = baseName;
  let newSlug = baseSlug;

  while (existingModels.some(m => m.name === newName || m.slug === newSlug)) {
    copyNum++;
    newName = `${sourceModel.name} (Copy ${copyNum})`;
    newSlug = `${sourceModel.slug}-copy-${copyNum}`;
  }

  const newModel = await storage.createModel({
    name: newName,
    slug: newSlug,
    description: sourceModel.description,
    version: sourceModel.version,
    estimatedTime: sourceModel.estimatedTime,
    status: 'draft',
    featured: false,
    imageUrl: sourceModel.imageUrl,
    maturityScale: sourceModel.maturityScale as any,
    generalResources: sourceModel.generalResources as any,
    visibility: sourceModel.visibility,
    ownerTenantId: sourceModel.ownerTenantId,
  });

  const dimensionIdMap = new Map<string, string>();
  for (const dim of dimensions.sort((a, b) => a.order - b.order)) {
    const newDim = await storage.createDimension({
      modelId: newModel.id,
      key: dim.key,
      label: dim.label,
      description: dim.description,
      order: dim.order,
    });
    dimensionIdMap.set(dim.id, newDim.id);
  }

  for (const q of questions.sort((a, b) => a.order - b.order)) {
    const newQuestion = await storage.createQuestion({
      modelId: newModel.id,
      dimensionId: q.dimensionId ? dimensionIdMap.get(q.dimensionId) || null : null,
      text: q.text,
      order: q.order,
    });

    const answers = await storage.getAnswersByQuestionId(q.id);
    for (const a of answers.sort((a, b) => a.order - b.order)) {
      await storage.createAnswer({
        questionId: newQuestion.id,
        text: a.text,
        score: a.score,
        order: a.order,
      });
    }
  }

  return {
    success: true,
    model: newModel,
    message: `Created "${newModel.name}" with ${dimensions.length} dimensions and ${questions.length} questions`,
  };
}

export async function exportModelDefinition(modelId: string) {
  const model = await storage.getModel(modelId);
  if (!model) {
    throw new ServiceError(404, "Model not found");
  }

  const dimensions = await storage.getDimensionsByModelId(model.id);
  const questions = await storage.getQuestionsByModelId(model.id);

  const dimensionIdToKey = new Map<string, string>();
  dimensions.forEach(d => dimensionIdToKey.set(d.id, d.key));

  const questionsData = await Promise.all(
    questions.map(async (q) => {
      const answers = await storage.getAnswersByQuestionId(q.id);
      return {
        dimensionKey: q.dimensionId ? dimensionIdToKey.get(q.dimensionId) || null : null,
        text: q.text,
        type: q.type,
        order: q.order,
        minValue: q.minValue,
        maxValue: q.maxValue,
        unit: q.unit,
        placeholder: q.placeholder,
        improvementStatement: q.improvementStatement,
        resourceTitle: q.resourceTitle,
        resourceLink: q.resourceLink,
        resourceDescription: q.resourceDescription,
        answers: answers.map(a => ({
          text: a.text,
          score: a.score,
          order: a.order,
          improvementStatement: a.improvementStatement,
          resourceTitle: a.resourceTitle,
          resourceLink: a.resourceLink,
          resourceDescription: a.resourceDescription,
        })),
      };
    })
  );

  const exportData: schema.ModelExportFormat = {
    formatVersion: "1.0",
    exportedAt: new Date().toISOString(),
    model: {
      name: model.name,
      slug: model.slug,
      description: model.description,
      version: model.version,
      estimatedTime: model.estimatedTime,
      status: model.status,
      featured: model.featured,
      allowAnonymousResults: model.allowAnonymousResults,
      hideScoreAndNarratives: model.hideScoreAndNarratives,
      imageUrl: model.imageUrl,
      maturityScale: model.maturityScale as any,
      generalResources: model.generalResources as any,
    },
    dimensions: dimensions.map(d => ({
      key: d.key,
      label: d.label,
      description: d.description,
      order: d.order,
    })),
    questions: questionsData,
  };

  return { model, exportData };
}

export async function importModelDefinition(params: {
  modelData: any;
  newName?: string;
  newSlug?: string;
}) {
  const { modelData, newName, newSlug } = params;

  let transformedData = modelData;

  if (modelData && modelData.modelName && modelData.questions?.[0]?.options) {
    console.log('Detected ExecAI simple format, transforming...');

    const generatedSlug = modelData.modelName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');

    const maturityScale = (modelData.routing || []).map((r: any, idx: number) => {
      const [minStr, maxStr] = (r.range || '0-100').split('-');
      return {
        id: String(idx + 1),
        name: r.breakout || `Level ${idx + 1}`,
        description: r.breakout || '',
        minScore: parseInt(minStr, 10) || 0,
        maxScore: parseInt(maxStr, 10) || 100,
      };
    });

    transformedData = {
      formatVersion: '1.0',
      model: {
        name: modelData.modelName,
        slug: generatedSlug,
        description: modelData.description || '',
        version: '1.0',
        estimatedTime: null,
        status: 'draft',
        featured: false,
        imageUrl: null,
        maturityScale: maturityScale.length > 0 ? maturityScale : null,
        generalResources: null,
      },
      dimensions: [],
      questions: (modelData.questions || []).map((q: any, qIdx: number) => ({
        dimensionKey: null,
        text: q.text,
        type: 'multiple_choice',
        order: qIdx,
        minValue: null,
        maxValue: null,
        unit: null,
        placeholder: null,
        improvementStatement: null,
        resourceTitle: null,
        resourceLink: null,
        resourceDescription: null,
        answers: (q.options || []).map((opt: any, optIdx: number) => ({
          text: opt.label,
          score: opt.score,
          order: optIdx,
          improvementStatement: null,
          resourceTitle: null,
          resourceLink: null,
          resourceDescription: null,
        })),
      })),
    };
  } else if (modelData && modelData.answers && Array.isArray(modelData.answers)) {
    console.log('Detected production export format, transforming...');

    const answersByQuestion = new Map<string, any[]>();
    for (const answer of modelData.answers) {
      if (!answersByQuestion.has(answer.questionId)) {
        answersByQuestion.set(answer.questionId, []);
      }
      answersByQuestion.get(answer.questionId)!.push({
        text: answer.text,
        score: answer.score,
        order: answer.order,
        improvementStatement: answer.improvementStatement,
        resourceTitle: answer.resourceTitle,
        resourceLink: answer.resourceLink,
        resourceDescription: answer.resourceDescription,
      });
    }

    const dimensionIdToKey = new Map<string, string>();
    for (const dim of modelData.dimensions || []) {
      dimensionIdToKey.set(dim.id, dim.key);
    }

    transformedData = {
      formatVersion: modelData.formatVersion || '1.0',
      exportedAt: modelData.exportedAt,
      model: {
        name: modelData.model.name,
        slug: modelData.model.slug,
        description: modelData.model.description || '',
        version: modelData.model.version || '1.0',
        estimatedTime: modelData.model.estimatedTime,
        status: modelData.model.status || 'draft',
        featured: modelData.model.featured || false,
        imageUrl: modelData.model.imageUrl,
        maturityScale: modelData.model.maturityScale,
        generalResources: modelData.model.generalResources,
      },
      dimensions: (modelData.dimensions || []).map((d: any) => ({
        key: d.key,
        label: d.label,
        description: d.description || '',
        order: d.order,
      })),
      questions: (modelData.questions || []).map((q: any) => ({
        dimensionKey: q.dimensionId ? dimensionIdToKey.get(q.dimensionId) : (q.dimensionKey || null),
        text: q.text,
        type: q.type,
        order: q.order,
        minValue: q.minValue,
        maxValue: q.maxValue,
        unit: q.unit,
        placeholder: q.placeholder,
        improvementStatement: q.improvementStatement,
        resourceTitle: q.resourceTitle,
        resourceLink: q.resourceLink,
        resourceDescription: q.resourceDescription,
        answers: answersByQuestion.get(q.id) || [],
      })),
    };
  }

  const validationResult = schema.modelExportFormatSchema.safeParse(transformedData);
  if (!validationResult.success) {
    console.error('Model import validation failed:', validationResult.error.issues);
    throw new ServiceError(400, "Invalid model file format", validationResult.error.issues);
  }

  const data = validationResult.data;

  const modelName = newName || data.model.name;
  const modelSlug = newSlug || data.model.slug;

  const existingModel = await storage.getModelBySlug(modelSlug);
  if (existingModel) {
    throw new ServiceError(400, "A model with this slug already exists. Please provide a different slug.");
  }

  const createdModel = await storage.createModel({
    name: modelName,
    slug: modelSlug,
    description: data.model.description,
    version: data.model.version,
    estimatedTime: data.model.estimatedTime,
    status: data.model.status,
    featured: data.model.featured,
    imageUrl: data.model.imageUrl,
    maturityScale: data.model.maturityScale as any,
    generalResources: data.model.generalResources as any,
  });

  const dimensionKeyToId = new Map<string, string>();
  for (const dim of data.dimensions) {
    const createdDimension = await storage.createDimension({
      modelId: createdModel.id,
      key: dim.key,
      label: dim.label,
      description: dim.description,
      order: dim.order,
    });
    dimensionKeyToId.set(dim.key, createdDimension.id);
  }

  let questionsCreated = 0;
  let answersCreated = 0;

  for (const q of data.questions) {
    const createdQuestion = await storage.createQuestion({
      modelId: createdModel.id,
      dimensionId: q.dimensionKey ? dimensionKeyToId.get(q.dimensionKey) || null : null,
      text: q.text,
      type: q.type,
      order: q.order,
      minValue: q.minValue,
      maxValue: q.maxValue,
      unit: q.unit,
      placeholder: q.placeholder,
      improvementStatement: q.improvementStatement,
      resourceTitle: q.resourceTitle,
      resourceLink: q.resourceLink,
      resourceDescription: q.resourceDescription,
    });
    questionsCreated++;

    for (const a of q.answers) {
      await storage.createAnswer({
        questionId: createdQuestion.id,
        text: a.text,
        score: a.score,
        order: a.order,
        improvementStatement: a.improvementStatement,
        resourceTitle: a.resourceTitle,
        resourceLink: a.resourceLink,
        resourceDescription: a.resourceDescription,
      });
      answersCreated++;
    }
  }

  return {
    success: true,
    model: createdModel,
    stats: {
      dimensionsCreated: data.dimensions.length,
      questionsCreated,
      answersCreated,
    },
  };
}

export async function exportInterviewGuide(modelId: string) {
  const model = await storage.getModel(modelId);
  if (!model) {
    throw new ServiceError(404, "Model not found");
  }

  const dimensions = await storage.getDimensionsByModelId(model.id);
  const questions = await storage.getQuestionsByModelId(model.id);

  const exportQuestionIds = questions.map(q => q.id);
  const exportAllAnswers = exportQuestionIds.length > 0
    ? await db.select().from(schema.answers)
        .where(inArray(schema.answers.questionId, exportQuestionIds))
        .orderBy(schema.answers.order)
    : [];
  const exportAnswersByQuestion = new Map<string, typeof exportAllAnswers>();
  for (const a of exportAllAnswers) {
    if (!exportAnswersByQuestion.has(a.questionId)) {
      exportAnswersByQuestion.set(a.questionId, []);
    }
    exportAnswersByQuestion.get(a.questionId)!.push(a);
  }

  const sortedDimensions = dimensions.sort((a, b) => a.order - b.order);

  let markdown = `# ${model.name} - Interview Guide\n\n`;
  markdown += `${model.description || ''}\n\n`;
  markdown += `**Estimated Time:** ${model.estimatedTime || 'Not specified'}\n\n`;
  markdown += `---\n\n`;

  for (const dimension of sortedDimensions) {
    markdown += `## ${dimension.label}\n\n`;
    if (dimension.description) {
      markdown += `*${dimension.description}*\n\n`;
    }

    const dimensionQuestions = questions
      .filter(q => q.dimensionId === dimension.id)
      .sort((a, b) => a.order - b.order);

    for (const question of dimensionQuestions) {
      markdown += `### ${question.text}\n\n`;

      const sortedAnswers = exportAnswersByQuestion.get(question.id) ?? [];

      if (sortedAnswers.length > 0) {
        for (const answer of sortedAnswers) {
          markdown += `- [ ] ${answer.text}`;
          if (answer.score !== null && answer.score !== undefined) {
            markdown += ` *(Score: ${answer.score})*`;
          }
          markdown += `\n`;
        }
        markdown += `\n`;
      } else if (question.type === 'numeric') {
        markdown += `**Response:** ____________ ${question.unit || ''}\n`;
        if (question.minValue !== null || question.maxValue !== null) {
          markdown += `*(Range: ${question.minValue || 'min'} - ${question.maxValue || 'max'})*\n`;
        }
        markdown += `\n`;
      } else if (question.type === 'text') {
        markdown += `**Response:**\n\n`;
        markdown += `_______________________________________\n\n`;
        markdown += `_______________________________________\n\n`;
        markdown += `_______________________________________\n\n`;
      }
    }
  }

  markdown += `---\n\n`;
  markdown += `*Generated by Orion - Find Your North Star*\n`;

  return { model, markdown };
}
