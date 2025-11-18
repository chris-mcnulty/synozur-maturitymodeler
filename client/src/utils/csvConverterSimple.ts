// Simplified CSV converter for denormalized question/answer format
// Format: Question#, Question Text, Answer, Score, Interpretation, Resource Title, Resource Link, Resource Description

interface SimplifiedRow {
  questionNumber: number;
  questionText: string;
  answer: string;
  score: number;
  interpretation?: string;
  resourceTitle?: string;
  resourceLink?: string;
  resourceDescription?: string;
}

export function questionsToSimpleCSV(questions: any[], answers: any[]): string {
  const rows: string[] = [];
  
  // Header row
  rows.push('Question#,Question Text,Answer,Score,Interpretation,Resource Title,Resource Link,Resource Description');
  
  questions.forEach((question, qIndex) => {
    const questionNumber = qIndex + 1;
    const questionAnswers = answers.filter(a => a.questionId === question.id);
    
    if (question.type === 'multiple_choice' && questionAnswers.length > 0) {
      // For multiple choice, export each answer option
      questionAnswers.forEach((answer) => {
        const row = [
          questionNumber.toString(),
          `"${question.text.replace(/"/g, '""')}"`,
          `"${answer.text.replace(/"/g, '""')}"`,
          answer.score.toString(),
          answer.improvementStatement ? `"${answer.improvementStatement.replace(/"/g, '""')}"` : '',
          answer.resourceTitle ? `"${answer.resourceTitle.replace(/"/g, '""')}"` : '',
          answer.resourceLink ? `"${answer.resourceLink.replace(/"/g, '""')}"` : '',
          answer.resourceDescription ? `"${answer.resourceDescription.replace(/"/g, '""')}"` : ''
        ];
        rows.push(row.join(','));
      });
    } else {
      // For other types (numeric, true/false, text), just export the question
      const row = [
        questionNumber.toString(),
        `"${question.text.replace(/"/g, '""')}"`,
        question.type === 'true_false' ? 'True/False' : 
        question.type === 'numeric' ? `Numeric (${question.minValue || 0}-${question.maxValue || 100}${question.unit ? ' ' + question.unit : ''})` :
        question.type === 'text' ? 'Text Input' : '',
        '', // No score for non-multiple-choice
        question.improvementStatement ? `"${question.improvementStatement.replace(/"/g, '""')}"` : '',
        question.resourceTitle ? `"${question.resourceTitle.replace(/"/g, '""')}"` : '',
        question.resourceLink ? `"${question.resourceLink.replace(/"/g, '""')}"` : '',
        question.resourceDescription ? `"${question.resourceDescription.replace(/"/g, '""')}"` : ''
      ];
      rows.push(row.join(','));
    }
  });
  
  return rows.join('\n');
}

export function simpleCSVToQuestions(csvContent: string, modelId: string): { questions: any[], answers: any[] } {
  const lines = csvContent.split('\n').filter(line => line.trim());
  const questions: any[] = [];
  const answers: any[] = [];
  const questionMap = new Map<number, any>();
  
  console.log('[CSV Parser] Total lines:', lines.length);
  console.log('[CSV Parser] First line:', lines[0]?.substring(0, 100));
  
  // Skip header if it exists
  let startIndex = 0;
  if (lines[0] && lines[0].toLowerCase().includes('question')) {
    console.log('[CSV Parser] Skipping header line');
    startIndex = 1;
  }
  
  for (let i = startIndex; i < lines.length; i++) {
    const values = parseCSVLine(lines[i]);
    
    console.log(`[CSV Parser] Line ${i}: ${values.length} columns, values:`, values.slice(0, 4));
    
    if (values.length < 2) {
      console.log(`[CSV Parser] Skipping line ${i}: insufficient columns`);
      continue;
    }
    
    const questionNumber = parseInt(values[0]);
    const questionText = values[1];
    const answerText = values[2];
    const score = values[3] ? parseInt(values[3]) : 0;
    const interpretation = values[4] || '';
    const resourceTitle = values[5] || '';
    const resourceLink = values[6] || '';
    const resourceDescription = values[7] || '';
    
    if (!questionNumber || isNaN(questionNumber)) {
      console.log(`[CSV Parser] Skipping line ${i}: invalid question number "${values[0]}"`);
      continue;
    }
    
    if (!questionText) {
      console.log(`[CSV Parser] Skipping line ${i}: empty question text`);
      continue;
    }
    
    // Check if we've seen this question before
    if (!questionMap.has(questionNumber)) {
      // Determine question type based on answer text
      let questionType = 'multiple_choice';
      let minValue, maxValue, unit;
      
      if (answerText === 'True/False') {
        questionType = 'true_false';
      } else if (answerText.startsWith('Numeric')) {
        questionType = 'numeric';
        // Parse numeric range if provided
        const match = answerText.match(/Numeric \((\d+)-(\d+)(?:\s+(.+))?\)/);
        if (match) {
          minValue = parseInt(match[1]);
          maxValue = parseInt(match[2]);
          unit = match[3];
        }
      } else if (answerText === 'Text Input') {
        questionType = 'text';
      }
      
      const question = {
        id: `q${questionNumber}`,
        modelId,
        text: questionText,
        type: questionType,
        order: questionNumber - 1,
        minValue,
        maxValue,
        unit,
        improvementStatement: interpretation || undefined,
        resourceTitle: resourceTitle || undefined,
        resourceLink: resourceLink || undefined,
        resourceDescription: resourceDescription || undefined,
      };
      
      questions.push(question);
      questionMap.set(questionNumber, question);
    }
    
    // If this is a multiple choice answer (has answer text and it's not a type indicator)
    if (answerText && 
        answerText !== 'True/False' && 
        answerText !== 'Text Input' && 
        !answerText.startsWith('Numeric')) {
      const question = questionMap.get(questionNumber);
      if (question) {
        answers.push({
          id: `a${questionNumber}_${answers.length + 1}`,
          questionId: question.id,
          text: answerText,
          score: score,
          order: answers.filter(a => a.questionId === question.id).length,
          improvementStatement: interpretation || undefined,
          resourceTitle: resourceTitle || undefined,
          resourceLink: resourceLink || undefined,
          resourceDescription: resourceDescription || undefined,
        });
      }
    }
  }
  
  return { questions, answers };
}

function parseCSVLine(line: string): string[] {
  const values: string[] = [];
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
      // Field separator
      values.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  
  // Add last field
  values.push(current.trim());
  
  return values;
}