import type { Model, Dimension, Question, Answer } from '@shared/schema';

// Define scoring level structure for CSV export/import
interface ScoringLevel {
  id: string;
  label: string;
  minScore: number;
  maxScore: number;
  description?: string;
  color?: string;
}

interface CSVRow {
  type: string;
  [key: string]: string;
}

export function modelToCSV(
  model: Model,
  dimensions: Dimension[],
  questions: Question[],
  answers: Answer[],
  scoringLevels: ScoringLevel[]
): string {
  const rows: string[][] = [];
  
  // Headers
  rows.push([
    'Type', 'ID', 'Name/Text', 'Value1', 'Value2', 'Value3', 'Value4', 'Value5', 'Value6', 'Value7', 'Value8'
  ]);
  
  // Model metadata
  rows.push([
    'MODEL',
    model.id,
    model.name,
    model.slug,
    model.description || '',
    model.version || '1.0.0',
    model.estimatedTime || '15-20 minutes',
    model.status || 'draft',
    '', '', ''
  ]);
  
  // Dimensions
  dimensions.forEach(dimension => {
    rows.push([
      'DIMENSION',
      dimension.id,
      dimension.label,
      dimension.key,
      dimension.description || '',
      '', '', '', '', '', ''
    ]);
  });
  
  // Questions
  questions.forEach(question => {
    rows.push([
      'QUESTION',
      question.id,
      question.text,
      question.type,
      question.dimensionId || '',
      question.minValue?.toString() || '',
      question.maxValue?.toString() || '',
      question.unit || '',
      question.placeholder || '',
      question.improvementStatement || '',
      question.resourceTitle || ''
    ]);
    
    // Additional question resource fields (second row for same question)
    rows.push([
      'QUESTION_RESOURCES',
      question.id,
      question.resourceLink || '',
      question.resourceDescription || '',
      '', '', '', '', '', '', ''
    ]);
    
    // Add answers for multiple choice and multi_select questions
    if (question.type === 'multiple_choice' || question.type === 'multi_select') {
      const questionAnswers = answers.filter(a => a.questionId === question.id);
      questionAnswers.forEach(answer => {
        rows.push([
          'ANSWER',
          answer.id,
          answer.text,
          answer.questionId,
          answer.score.toString(),
          answer.improvementStatement || '',
          answer.resourceTitle || '',
          answer.resourceLink || '',
          answer.resourceDescription || '',
          '', ''
        ]);
      });
    }
  });
  
  // Scoring Levels
  scoringLevels.forEach(level => {
    rows.push([
      'SCORING_LEVEL',
      level.id,
      level.label,
      level.minScore.toString(),
      level.maxScore.toString(),
      level.description || '',
      level.color || '',
      '', '', '', ''
    ]);
  });
  
  // Convert to CSV string
  return rows.map(row => 
    row.map(cell => {
      // Escape quotes and wrap in quotes if contains comma, newline, or quotes
      const escaped = cell.replace(/"/g, '""');
      return /[,\n"]/.test(escaped) ? `"${escaped}"` : escaped;
    }).join(',')
  ).join('\n');
}

export function csvToModel(csvContent: string): {
  model: Partial<Model>;
  dimensions: Partial<Dimension>[];
  questions: Partial<Question>[];
  answers: Partial<Answer>[];
  scoringLevels: ScoringLevel[];
} {
  const lines = csvContent.split('\n').filter(line => line.trim());
  const rows = lines.slice(1).map(line => parseCSVLine(line)); // Skip header
  
  const model: Partial<Model> = {};
  const dimensions: Partial<Dimension>[] = [];
  const questions: Partial<Question>[] = [];
  const answers: Partial<Answer>[] = [];
  const scoringLevels: ScoringLevel[] = [];
  
  rows.forEach(row => {
    const type = row[0];
    
    switch(type) {
      case 'MODEL':
        Object.assign(model, {
          id: row[1],
          name: row[2],
          slug: row[3],
          description: row[4] || undefined,
          version: row[5] || '1.0.0',
          estimatedTime: row[6] || '15-20 minutes',
          status: (row[7] || 'draft') as 'draft' | 'published'
        });
        break;
        
      case 'DIMENSION':
        dimensions.push({
          id: row[1],
          label: row[2],
          key: row[3],
          description: row[4] || undefined,
          modelId: model.id
        });
        break;
        
      case 'QUESTION':
        questions.push({
          id: row[1],
          text: row[2],
          type: row[3] as 'multiple_choice' | 'multi_select' | 'numeric' | 'true_false' | 'text',
          dimensionId: row[4] || undefined,
          minValue: row[5] ? parseFloat(row[5]) : undefined,
          maxValue: row[6] ? parseFloat(row[6]) : undefined,
          unit: row[7] || undefined,
          placeholder: row[8] || undefined,
          improvementStatement: row[9] || undefined,
          resourceTitle: row[10] || undefined,
          modelId: model.id,
          order: questions.length
        });
        break;
        
      case 'QUESTION_RESOURCES':
        // Find the last question and add resource fields
        if (questions.length > 0) {
          const lastQuestion = questions[questions.length - 1];
          if (lastQuestion.id === row[1]) {
            lastQuestion.resourceLink = row[2] || undefined;
            lastQuestion.resourceDescription = row[3] || undefined;
          }
        }
        break;
        
      case 'ANSWER':
        answers.push({
          id: row[1],
          text: row[2],
          questionId: row[3],
          score: parseInt(row[4]) || 0,
          improvementStatement: row[5] || undefined,
          resourceTitle: row[6] || undefined,
          resourceLink: row[7] || undefined,
          resourceDescription: row[8] || undefined
        });
        break;
        
      case 'SCORING_LEVEL':
        scoringLevels.push({
          id: row[1],
          label: row[2],
          minScore: parseFloat(row[3]) || 0,
          maxScore: parseFloat(row[4]) || 500,
          description: row[5] || undefined,
          color: row[6] || undefined
        });
        break;
    }
  });
  
  return { model, dimensions, questions, answers, scoringLevels };
}

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const nextChar = line[i + 1];
    
    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        // Escaped quote
        current += '"';
        i++; // Skip next quote
      } else {
        // Toggle quote state
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      // End of field
      result.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  
  // Add last field
  result.push(current);
  
  // Pad with empty strings if needed
  while (result.length < 11) {
    result.push('');
  }
  
  return result;
}