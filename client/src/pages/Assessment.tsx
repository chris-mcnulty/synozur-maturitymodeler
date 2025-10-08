import { useState, useEffect } from "react";
import { useRoute, useLocation } from "wouter";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { ProgressBar } from "@/components/ProgressBar";
import { QuestionCard } from "@/components/QuestionCard";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { Assessment as AssessmentType, Question, Answer } from "@shared/schema";

interface QuestionWithAnswers extends Question {
  answers: Answer[];
}

export default function Assessment() {
  const [, params] = useRoute("/assessment/:assessmentId");
  const [, setLocation] = useLocation();
  const assessmentId = params?.assessmentId;

  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [selectedAnswers, setSelectedAnswers] = useState<Record<string, string>>({});

  // Fetch assessment
  const { data: assessment } = useQuery<AssessmentType>({
    queryKey: ['/api/assessments', assessmentId],
    enabled: !!assessmentId,
  });

  // Fetch model with questions
  const { data: questions = [], isLoading } = useQuery<QuestionWithAnswers[]>({
    queryKey: ['/api/models', assessment?.modelId, 'questions'],
    enabled: !!assessment?.modelId,
    queryFn: async () => {
      const model = await fetch(`/api/models/by-id/${assessment?.modelId}`).then(r => r.json());
      return fetch(`/api/models/${model.slug}/questions`).then(r => r.json());
    },
  });

  // Fetch existing responses
  const { data: existingResponses = [] } = useQuery<{ questionId: string; answerId?: string; numericValue?: number }[]>({
    queryKey: ['/api/assessments', assessmentId, 'responses'],
    enabled: !!assessmentId,
  });

  // Populate existing answers
  useEffect(() => {
    if (existingResponses.length > 0) {
      const answers: Record<string, string> = {};
      existingResponses.forEach(r => {
        if (r.numericValue !== undefined) {
          answers[r.questionId] = r.numericValue.toString();
        } else if (r.answerId) {
          answers[r.questionId] = r.answerId;
        }
      });
      setSelectedAnswers(answers);
    }
  }, [existingResponses]);

  // Save response mutation
  const saveResponse = useMutation({
    mutationFn: async ({ questionId, answerId, numericValue }: { 
      questionId: string; 
      answerId?: string;
      numericValue?: number;
    }) => {
      const body: any = { questionId };
      if (numericValue !== undefined) {
        body.numericValue = numericValue;
      } else {
        body.answerId = answerId;
      }
      
      const res = await apiRequest('POST', `/api/assessments/${assessmentId}/responses`, body);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/assessments', assessmentId, 'responses'] });
    },
  });

  // Calculate results mutation
  const calculateResults = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('POST', `/api/assessments/${assessmentId}/calculate`);
      return res.json();
    },
    onSuccess: () => {
      setLocation(`/results/${assessmentId}`);
    },
  });

  const handleAnswer = async (value: string) => {
    const question = questions[currentQuestionIndex];
    const questionId = question.id;
    setSelectedAnswers({ ...selectedAnswers, [questionId]: value });
    
    // Prepare the save data based on question type
    let saveData: any = { questionId };
    
    if (question.type === 'numeric') {
      const numericValue = parseFloat(value);
      if (!isNaN(numericValue)) {
        saveData.numericValue = numericValue;
      } else {
        return; // Don't save invalid numeric values
      }
    } else {
      saveData.answerId = value;
    }
    
    // Wait for the save to complete before allowing next action
    await new Promise<void>((resolve) => {
      saveResponse.mutate(saveData, {
        onSettled: () => resolve(),
      });
    });
  };

  const handleNext = () => {
    if (currentQuestionIndex === questions.length - 1) {
      // Complete assessment - safe to calculate since last save is complete
      calculateResults.mutate();
    } else {
      setCurrentQuestionIndex(currentQuestionIndex + 1);
    }
  };

  const handlePrevious = () => {
    if (currentQuestionIndex > 0) {
      setCurrentQuestionIndex(currentQuestionIndex - 1);
    }
  };

  if (isLoading || !questions.length) {
    return (
      <div className="min-h-screen flex flex-col">
        <Header />
        <main className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <div className="text-lg text-muted-foreground" data-testid="loading-assessment">Loading assessment...</div>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  const currentQuestion = questions[currentQuestionIndex];
  const currentAnswer = selectedAnswers[currentQuestion.id];
  
  // For numeric questions, check if value is valid
  let canGoNext = false;
  if (currentQuestion.type === 'numeric') {
    const numValue = parseFloat(currentAnswer);
    canGoNext = !isNaN(numValue) && currentAnswer !== "";
    if (currentQuestion.minValue !== undefined && currentQuestion.minValue !== null) {
      canGoNext = canGoNext && numValue >= currentQuestion.minValue;
    }
    if (currentQuestion.maxValue !== undefined && currentQuestion.maxValue !== null) {
      canGoNext = canGoNext && numValue <= currentQuestion.maxValue;
    }
  } else {
    canGoNext = !!currentAnswer;
  }
  
  const canGoPrev = currentQuestionIndex > 0;

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1 py-12">
        <div className="container mx-auto px-4 max-w-4xl">
          <div className="mb-8">
            <ProgressBar current={currentQuestionIndex + 1} total={questions.length} />
          </div>

          <QuestionCard
            question={currentQuestion.text}
            questionType={currentQuestion.type as 'multiple_choice' | 'numeric'}
            answers={currentQuestion.type === 'multiple_choice' ? currentQuestion.answers.map(a => ({
              key: a.id,
              label: a.text,
              score: a.score,
            })) : undefined}
            minValue={currentQuestion.minValue ?? undefined}
            maxValue={currentQuestion.maxValue ?? undefined}
            unit={currentQuestion.unit ?? undefined}
            onAnswer={handleAnswer}
            selectedAnswer={currentAnswer}
          />

          <div className="flex justify-between mt-8">
            <Button
              variant="outline"
              onClick={handlePrevious}
              disabled={!canGoPrev}
              data-testid="button-previous"
            >
              <ChevronLeft className="mr-2 h-4 w-4" />
              Previous
            </Button>
            <Button
              onClick={handleNext}
              disabled={!canGoNext || calculateResults.isPending}
              data-testid="button-next"
            >
              {calculateResults.isPending
                ? "Calculating..."
                : currentQuestionIndex === questions.length - 1
                ? "Complete Assessment"
                : "Next"}
              <ChevronRight className="ml-2 h-4 w-4" />
            </Button>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}