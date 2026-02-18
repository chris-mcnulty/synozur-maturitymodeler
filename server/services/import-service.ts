import { db } from "../db";
import * as schema from "../../shared/schema";
import { eq } from "drizzle-orm";

// Types for the import JSON structure
export interface ExternalQuestionMapping {
  question_id: string;
  question_text: string;
  dimension: string;
  answer_options: {
    score: number;
    text: string;
  }[];
}

export interface ExternalAssessment {
  id: string;
  overall_score: number;
  dimension_scores: Record<string, number>;
  maturity_level: string;
  answers: {
    questionId: string;
    value: number;
  }[];
  created_at: string;
}

export interface ImportExportData {
  model_info: {
    name: string;
    dimensions: string[];
  };
  question_mapping: ExternalQuestionMapping[];
  assessments: ExternalAssessment[];
}

export interface QuestionMatch {
  externalId: string;
  externalText: string;
  internalId: string | null;
  internalText: string | null;
  confidence: number;
  dimension: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  questionMatches: QuestionMatch[];
  assessmentCount: number;
  dimensionMappings: Record<string, string>; // External dimension -> internal dimension key
}

// Calculate string similarity using Levenshtein distance
function calculateSimilarity(str1: string, str2: string): number {
  const s1 = str1.toLowerCase().trim();
  const s2 = str2.toLowerCase().trim();
  
  if (s1 === s2) return 1.0;
  
  const len1 = s1.length;
  const len2 = s2.length;
  
  if (len1 === 0 || len2 === 0) return 0.0;
  
  // Levenshtein distance matrix
  const matrix: number[][] = [];
  
  for (let i = 0; i <= len2; i++) {
    matrix[i] = [i];
  }
  
  for (let j = 0; j <= len1; j++) {
    matrix[0][j] = j;
  }
  
  for (let i = 1; i <= len2; i++) {
    for (let j = 1; j <= len1; j++) {
      if (s2.charAt(i - 1) === s1.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          matrix[i][j - 1] + 1,     // insertion
          matrix[i - 1][j] + 1      // deletion
        );
      }
    }
  }
  
  const distance = matrix[len2][len1];
  const maxLen = Math.max(len1, len2);
  
  return 1 - (distance / maxLen);
}

// Match external questions to internal questions by text similarity
export async function matchQuestions(
  externalQuestions: ExternalQuestionMapping[],
  modelId: string
): Promise<QuestionMatch[]> {
  // Get all questions for the model
  const internalQuestions = await db
    .select()
    .from(schema.questions)
    .where(eq(schema.questions.modelId, modelId));
  
  const matches: QuestionMatch[] = [];
  
  for (const externalQ of externalQuestions) {
    let bestMatch: QuestionMatch = {
      externalId: externalQ.question_id,
      externalText: externalQ.question_text,
      internalId: null,
      internalText: null,
      confidence: 0,
      dimension: externalQ.dimension,
    };
    
    // Find best matching internal question
    for (const internalQ of internalQuestions) {
      const similarity = calculateSimilarity(
        externalQ.question_text,
        internalQ.text
      );
      
      if (similarity > bestMatch.confidence) {
        bestMatch = {
          externalId: externalQ.question_id,
          externalText: externalQ.question_text,
          internalId: internalQ.id,
          internalText: internalQ.text,
          confidence: similarity,
          dimension: externalQ.dimension,
        };
      }
    }
    
    matches.push(bestMatch);
  }
  
  return matches;
}

// Validate import data structure and create question mappings
export async function validateImportData(
  data: ImportExportData,
  modelSlug: string
): Promise<ValidationResult> {
  const errors: string[] = [];
  const warnings: string[] = [];
  
  // Find target model
  const modelResult = await db
    .select()
    .from(schema.models)
    .where(eq(schema.models.slug, modelSlug))
    .limit(1);
  
  const model = modelResult[0];
  
  if (!model) {
    errors.push(`Model with slug "${modelSlug}" not found`);
    return {
      valid: false,
      errors,
      warnings,
      questionMatches: [],
      assessmentCount: 0,
      dimensionMappings: {},
    };
  }
  
  const rawData = data as any;
  if (rawData.formatVersion && rawData.model && rawData.dimensions && rawData.questions) {
    errors.push("This is a .model definition file, not an assessment data file. To import this model, use the 'Import Model' button in the Models section of the admin console instead.");
    return {
      valid: false,
      errors,
      warnings,
      questionMatches: [],
      assessmentCount: 0,
      dimensionMappings: {},
    };
  }

  if (!data.model_info || !data.question_mapping || !data.assessments) {
    errors.push("Invalid import file structure - missing required fields (model_info, question_mapping, assessments)");
  }
  
  if (!Array.isArray(data.question_mapping)) {
    errors.push("question_mapping must be an array");
  }
  
  if (!Array.isArray(data.assessments)) {
    errors.push("assessments must be an array");
  }
  
  if (errors.length > 0) {
    return {
      valid: false,
      errors,
      warnings,
      questionMatches: [],
      assessmentCount: 0,
      dimensionMappings: {},
    };
  }
  
  // Fetch dimensions for the model
  const modelDimensions = await db
    .select()
    .from(schema.dimensions)
    .where(eq(schema.dimensions.modelId, model.id));
  
  // Create dimension mappings
  const dimensionMappings: Record<string, string> = {};
  const externalDimensions = data.model_info.dimensions || [];
  
  for (const extDim of externalDimensions) {
    // Try to find matching internal dimension by label
    const internalDim = modelDimensions.find(
      (d) => d.label.toLowerCase() === extDim.toLowerCase()
    );
    
    if (internalDim) {
      dimensionMappings[extDim] = internalDim.key;
    } else {
      warnings.push(`External dimension "${extDim}" has no matching internal dimension`);
    }
  }
  
  // Match questions
  const questionMatches = await matchQuestions(data.question_mapping, model.id);
  
  // Check for low-confidence matches
  const lowConfidenceMatches = questionMatches.filter(m => m.confidence < 0.7);
  if (lowConfidenceMatches.length > 0) {
    warnings.push(
      `${lowConfidenceMatches.length} question(s) have low confidence matches (< 70%)`
    );
  }
  
  // Check for unmatched questions
  const unmatchedQuestions = questionMatches.filter(m => m.internalId === null);
  if (unmatchedQuestions.length > 0) {
    errors.push(
      `${unmatchedQuestions.length} question(s) could not be matched to internal questions`
    );
  }
  
  // Validate assessments
  const assessmentCount = data.assessments.length;
  
  if (assessmentCount === 0) {
    warnings.push("No assessments found in import file");
  }
  
  // Validate each assessment has required fields
  for (let i = 0; i < Math.min(data.assessments.length, 10); i++) {
    const assessment = data.assessments[i];
    
    if (!assessment.id || !assessment.overall_score || !assessment.answers) {
      errors.push(`Assessment at index ${i} is missing required fields`);
    }
    
    if (!assessment.created_at) {
      warnings.push(`Assessment ${assessment.id} has no created_at timestamp`);
    }
  }
  
  return {
    valid: errors.length === 0,
    errors,
    warnings,
    questionMatches,
    assessmentCount,
    dimensionMappings,
  };
}

// Execute the import
export async function executeImport(
  data: ImportExportData,
  modelSlug: string,
  importedBy: string,
  filename: string | null
): Promise<{ batchId: string; importedCount: number }> {
  // First validate
  const validation = await validateImportData(data, modelSlug);
  
  if (!validation.valid) {
    throw new Error(`Import validation failed: ${validation.errors.join(", ")}`);
  }
  
  // Find target model
  const modelResult = await db
    .select()
    .from(schema.models)
    .where(eq(schema.models.slug, modelSlug))
    .limit(1);
  
  const model = modelResult[0];
  
  if (!model) {
    throw new Error(`Model "${modelSlug}" not found`);
  }
  
  // Create question mapping lookup
  const questionMap: Record<string, string> = {};
  for (const match of validation.questionMatches) {
    if (match.internalId) {
      questionMap[match.externalId] = match.internalId;
    }
  }
  
  // Create import batch
  const [batch] = await db.insert(schema.importBatches).values({
    source: "legacy_ai_maturity",
    filename: filename || "unknown.json",
    importedBy,
    assessmentCount: data.assessments.length,
    questionMappings: questionMap,
    metadata: {
      originalModelName: data.model_info.name,
      dimensionMappings: validation.dimensionMappings,
      importedAt: new Date().toISOString(),
    },
  }).returning();
  
  let importedCount = 0;
  
  // Import each assessment
  for (const extAssessment of data.assessments) {
    try {
      // Create assessment record
      const [assessment] = await db.insert(schema.assessments).values({
        modelId: model.id,
        userId: null, // Anonymous
        sessionId: `import-${batch.id}-${extAssessment.id}`,
        status: "completed",
        startedAt: new Date(extAssessment.created_at),
        completedAt: new Date(extAssessment.created_at),
        importBatchId: batch.id,
      }).returning();
      
      // Create responses for each answer
      const responses = [];
      for (const answer of extAssessment.answers) {
        const internalQuestionId = questionMap[answer.questionId];
        
        if (!internalQuestionId) {
          console.warn(`Skipping answer for unmapped question: ${answer.questionId}`);
          continue;
        }
        
        // Find the answer ID that matches the score
        const questionAnswers = await db
          .select()
          .from(schema.answers)
          .where(eq(schema.answers.questionId, internalQuestionId));
        
        if (!questionAnswers || questionAnswers.length === 0) continue;
        
        const matchingAnswer = questionAnswers.find((a) => a.score === answer.value);
        
        if (matchingAnswer) {
          responses.push({
            assessmentId: assessment.id,
            questionId: internalQuestionId,
            answerId: matchingAnswer.id,
          });
        }
      }
      
      if (responses.length > 0) {
        await db.insert(schema.assessmentResponses).values(responses);
      }
      
      // Create result record
      await db.insert(schema.results).values({
        assessmentId: assessment.id,
        overallScore: extAssessment.overall_score,
        label: extAssessment.maturity_level,
        dimensionScores: extAssessment.dimension_scores,
        emailSent: false,
      });
      
      importedCount++;
    } catch (error) {
      console.error(`Failed to import assessment ${extAssessment.id}:`, error);
      // Continue with next assessment
    }
  }
  
  // Update batch with actual imported count
  await db.update(schema.importBatches)
    .set({ assessmentCount: importedCount })
    .where(eq(schema.importBatches.id, batch.id));
  
  return {
    batchId: batch.id,
    importedCount,
  };
}
