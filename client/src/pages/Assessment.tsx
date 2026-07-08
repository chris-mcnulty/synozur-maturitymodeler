import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { useRoute, useLocation } from "wouter";
import { Footer } from "@/components/Footer";
import { ProgressBar } from "@/components/ProgressBar";
import { QuestionCard } from "@/components/QuestionCard";
import { QuestionNavigator } from "@/components/QuestionNavigator";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { DataState } from "@/components/DataState";
import { ChevronLeft, ChevronRight, AlertCircle } from "lucide-react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { usePageTitle } from "@/hooks/use-page-title";
import { useTranslation } from "react-i18next";
import type { Assessment as AssessmentType, Question, Answer, Dimension } from "@shared/schema";

interface QuestionWithAnswers extends Question {
  answers: Answer[];
}

type SaveStatus = "idle" | "saving" | "saved" | "failed";

type SavePayload = {
  questionId: string;
  answerId?: string;
  answerIds?: string[];
  numericValue?: number;
  booleanValue?: boolean;
  textValue?: string;
};

function isAnswerComplete(question: Question, value: string | string[] | undefined): boolean {
  if (value === undefined || value === null) return false;
  switch (question.type) {
    case "numeric": {
      const v = typeof value === "string" ? value : "";
      const num = parseFloat(v);
      if (v === "" || Number.isNaN(num)) return false;
      if (question.minValue !== undefined && question.minValue !== null && num < question.minValue) return false;
      if (question.maxValue !== undefined && question.maxValue !== null && num > question.maxValue) return false;
      return true;
    }
    case "true_false":
      return value === "true" || value === "false";
    case "text":
      return typeof value === "string" && value.trim().length > 0;
    case "multi_select":
      // Multi-select: any selection (including intentionally none) counts once recorded.
      // We require at least one selection so users explicitly indicate completion.
      return Array.isArray(value) && value.length > 0;
    case "multiple_choice":
    default:
      return typeof value === "string" && value.length > 0;
  }
}

export default function Assessment() {
  usePageTitle("Assessment in Progress");
  const [, params] = useRoute("/assessment/:assessmentId");
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { t } = useTranslation();
  const assessmentId = params?.assessmentId;

  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [selectedAnswers, setSelectedAnswers] = useState<Record<string, string | string[]>>({});
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [showIncomplete, setShowIncomplete] = useState(false);

  // Track in-flight saves keyed by questionId so we can wait before submitting.
  const pendingSavesRef = useRef<Set<string>>(new Set());
  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const failedPayloadsRef = useRef<Map<string, SavePayload>>(new Map());
  const didResumeRef = useRef(false);

  // Fetch assessment
  const { data: assessment, isLoading: assessmentLoading, isError: assessmentIsError, error: assessmentError, refetch: refetchAssessment } = useQuery<AssessmentType>({
    queryKey: ['/api/assessments', assessmentId],
    enabled: !!assessmentId,
  });

  // Fetch model with questions
  const { data: questions = [], isLoading, isError: questionsIsError, error: questionsError, refetch: refetchQuestions } = useQuery<QuestionWithAnswers[]>({
    queryKey: ['/api/models', assessment?.modelId, 'questions'],
    enabled: !!assessment?.modelId,
    queryFn: async () => {
      const model = await fetch(`/api/models/by-id/${assessment?.modelId}`).then(r => r.json());
      return fetch(`/api/models/${model.slug}/questions`).then(r => r.json());
    },
  });

  // Fetch dimensions
  const { data: dimensions = [] } = useQuery<Dimension[]>({
    queryKey: ['/api/dimensions', assessment?.modelId],
    enabled: !!assessment?.modelId,
    queryFn: async () => {
      const response = await fetch(`/api/dimensions/${assessment?.modelId}`);
      if (!response.ok) throw new Error('Failed to fetch dimensions');
      return response.json();
    },
  });

  // Fetch existing responses
  const { data: existingResponses = [], isFetched: responsesFetched } = useQuery<{
    questionId: string;
    answerId?: string;
    answerIds?: string[];
    numericValue?: number;
    booleanValue?: boolean;
    textValue?: string;
  }[]>({
    queryKey: ['/api/assessments', assessmentId, 'responses'],
    enabled: !!assessmentId,
  });

  // Populate existing answers
  useEffect(() => {
    if (existingResponses.length > 0) {
      const answers: Record<string, string | string[]> = {};
      existingResponses.forEach((r: any) => {
        if (r.numericValue !== undefined && r.numericValue !== null) {
          answers[r.questionId] = r.numericValue.toString();
        } else if (r.booleanValue !== undefined && r.booleanValue !== null) {
          answers[r.questionId] = r.booleanValue.toString();
        } else if (r.textValue !== undefined && r.textValue !== null) {
          answers[r.questionId] = r.textValue;
        } else if (r.answerIds) {
          answers[r.questionId] = r.answerIds;
        } else if (r.answerId) {
          answers[r.questionId] = r.answerId;
        }
      });
      setSelectedAnswers(prev => ({ ...answers, ...prev }));
    }
  }, [existingResponses]);

  // On first load, resume at the first unanswered question (or the last
  // question if every answer is already saved). Manual jumps after this
  // point are preserved because the effect runs only once.
  useEffect(() => {
    if (didResumeRef.current) return;
    if (!questions.length) return;
    // Wait for the responses query to actually finish before deciding.
    if (!responsesFetched) return;

    // Build the initial answered-value map directly from existingResponses
    // so we don't depend on the populate effect having flushed first.
    const initialValues: Record<string, string | string[]> = {};
    for (const r of existingResponses) {
      if (r.numericValue !== undefined && r.numericValue !== null) {
        initialValues[r.questionId] = r.numericValue.toString();
      } else if (r.booleanValue !== undefined && r.booleanValue !== null) {
        initialValues[r.questionId] = r.booleanValue.toString();
      } else if (r.textValue !== undefined && r.textValue !== null) {
        initialValues[r.questionId] = r.textValue;
      } else if (r.answerIds) {
        initialValues[r.questionId] = r.answerIds;
      } else if (r.answerId) {
        initialValues[r.questionId] = r.answerId;
      }
    }

    const firstUnanswered = questions.findIndex(
      q => !isAnswerComplete(q, initialValues[q.id])
    );
    const targetIndex = firstUnanswered === -1 ? questions.length - 1 : firstUnanswered;
    if (targetIndex > 0) {
      setCurrentQuestionIndex(targetIndex);
    }
    didResumeRef.current = true;
  }, [questions, existingResponses, responsesFetched]);

  // Reset resume guard if the assessment id changes (in case the component
  // is reused for a different assessment without unmounting).
  useEffect(() => {
    didResumeRef.current = false;
  }, [assessmentId]);

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
    };
  }, []);

  const flashSaved = useCallback(() => {
    if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
    setSaveStatus("saved");
    savedTimerRef.current = setTimeout(() => {
      // Only clear if there are no other pending saves and no failures.
      if (pendingSavesRef.current.size === 0 && failedPayloadsRef.current.size === 0) {
        setSaveStatus("idle");
      }
    }, 1500);
  }, []);

  // Background save with retry. Uses raw fetch via apiRequest so we can attempt
  // multiple times without going through react-query's mutation lifecycle.
  const performSave = useCallback(async (payload: SavePayload) => {
    const { questionId, ...rest } = payload;
    const body: any = { questionId };
    if (rest.numericValue !== undefined) body.numericValue = rest.numericValue;
    else if (rest.booleanValue !== undefined) body.booleanValue = rest.booleanValue;
    else if (rest.textValue !== undefined) body.textValue = rest.textValue;
    else if (rest.answerIds !== undefined) body.answerIds = rest.answerIds;
    else if (rest.answerId !== undefined) body.answerId = rest.answerId;

    pendingSavesRef.current.add(questionId);
    setSaveStatus("saving");

    const maxAttempts = 3;
    let lastError: unknown = null;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        await apiRequest(`/api/assessments/${assessmentId}/responses`, "POST", body);
        pendingSavesRef.current.delete(questionId);
        failedPayloadsRef.current.delete(questionId);
        // If still other in-flight, keep "saving"; else flash saved
        if (pendingSavesRef.current.size === 0) {
          if (failedPayloadsRef.current.size === 0) {
            flashSaved();
          } else {
            setSaveStatus("failed");
          }
        }
        // Refresh the cache without blocking the UI
        queryClient.invalidateQueries({ queryKey: ['/api/assessments', assessmentId, 'responses'] });
        return;
      } catch (err) {
        lastError = err;
        // Exponential backoff: 400ms, 1200ms
        if (attempt < maxAttempts) {
          await new Promise(r => setTimeout(r, attempt * 400));
        }
      }
    }

    // All attempts failed
    pendingSavesRef.current.delete(questionId);
    failedPayloadsRef.current.set(questionId, payload);
    setSaveStatus("failed");
    toast({
      title: t('assessment.cantSaveTitle'),
      description: t('assessment.cantSaveDescription'),
      variant: "destructive",
    });
    // eslint-disable-next-line no-console
    console.error("Failed to save response after retries:", lastError);
  }, [assessmentId, flashSaved, toast]);

  const queueSave = useCallback((payload: SavePayload) => {
    // Fire and forget — UI already updated optimistically
    void performSave(payload);
  }, [performSave]);

  // Calculate results mutation
  const calculateResults = useMutation({
    mutationFn: async () => {
      return await apiRequest(`/api/assessments/${assessmentId}/calculate`, 'POST');
    },
    onSuccess: () => {
      setLocation(`/results/${assessmentId}`);
    },
    onError: (error: Error) => {
      console.error('Failed to calculate results:', error);
      toast({
        title: t('assessment.unableCompleteTitle'),
        description: error.message
          ? `${error.message} ${t('assessment.unableCompleteDescription')}`
          : t('assessment.unableCompleteDescription'),
        variant: "destructive",
      });
    },
  });

  const handleAnswer = (value: string | string[]) => {
    const question = questions[currentQuestionIndex];
    if (!question) return;
    const questionId = question.id;
    setSelectedAnswers(prev => ({ ...prev, [questionId]: value }));

    // Build payload by question type. Skip saves for clearly invalid input.
    const payload: SavePayload = { questionId };
    if (question.type === 'numeric') {
      const num = parseFloat(value as string);
      if (Number.isNaN(num)) return;
      payload.numericValue = num;
    } else if (question.type === 'true_false') {
      payload.booleanValue = (value as string) === 'true';
    } else if (question.type === 'text') {
      payload.textValue = value as string;
    } else if (question.type === 'multi_select') {
      payload.answerIds = value as string[];
    } else {
      payload.answerId = value as string;
    }

    queueSave(payload);
  };

  // Indices that count as answered (for navigator + incomplete panel)
  const answeredIndices = useMemo(() => {
    const set = new Set<number>();
    questions.forEach((q, i) => {
      if (isAnswerComplete(q, selectedAnswers[q.id])) set.add(i);
    });
    return set;
  }, [questions, selectedAnswers]);

  const unansweredQuestions = useMemo(() => {
    return questions
      .map((q, index) => ({ q, index }))
      .filter(({ q }) => !isAnswerComplete(q, selectedAnswers[q.id]));
  }, [questions, selectedAnswers]);

  // Wait until all in-flight saves have settled
  const waitForPendingSaves = useCallback(async () => {
    const start = Date.now();
    while (pendingSavesRef.current.size > 0) {
      if (Date.now() - start > 8000) break; // safety cap
      await new Promise(r => setTimeout(r, 100));
    }
  }, []);

  const handleNext = async () => {
    if (currentQuestionIndex === questions.length - 1) {
      // Final question — validate completeness before submitting
      if (unansweredQuestions.length > 0) {
        setShowIncomplete(true);
        // Bring panel into view
        requestAnimationFrame(() => {
          document
            .getElementById("incomplete-panel")
            ?.scrollIntoView({ behavior: "smooth", block: "center" });
        });
        return;
      }
      setShowIncomplete(false);
      await waitForPendingSaves();
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

  const handleJump = (index: number) => {
    if (index >= 0 && index < questions.length) {
      setCurrentQuestionIndex(index);
    }
  };

  // Keyboard shortcuts: ←/→ to move between questions, Enter to advance,
  // Alt+digit to jump. Shortcuts are disabled only while focus is in a
  // text-entry context (input/textarea/select/contentEditable or a widget
  // with role=textbox/searchbox/spinbutton/combobox) so we don't intercept
  // normal typing. Enter mirrors the Next button's eligibility rules so it
  // can't bypass the unanswered-question gate, and is suppressed when focus
  // is on interactive controls (buttons, links, etc.) so they activate
  // themselves.
  useEffect(() => {
    if (!questions.length) return;

    const TYPING_TAGS = new Set(["INPUT", "TEXTAREA", "SELECT"]);
    const TYPING_ROLES = new Set(["textbox", "searchbox", "spinbutton", "combobox"]);
    const INTERACTIVE_TAGS = new Set([
      "BUTTON",
      "A",
      "INPUT",
      "TEXTAREA",
      "SELECT",
      "OPTION",
      "DETAILS",
      "SUMMARY",
    ]);
    const INTERACTIVE_ROLES = new Set([
      "button",
      "link",
      "menuitem",
      "menuitemcheckbox",
      "menuitemradio",
      "option",
      "tab",
      "switch",
      "checkbox",
      "radio",
    ]);

    const isTypingTarget = (el: EventTarget | null) => {
      if (!(el instanceof HTMLElement)) return false;
      if (TYPING_TAGS.has(el.tagName)) return true;
      if (el.isContentEditable) return true;
      const role = el.getAttribute("role");
      if (role && TYPING_ROLES.has(role)) return true;
      return false;
    };

    const isInteractiveTarget = (el: EventTarget | null) => {
      if (!(el instanceof HTMLElement)) return false;
      if (INTERACTIVE_TAGS.has(el.tagName)) return true;
      if (el.isContentEditable) return true;
      const role = el.getAttribute("role");
      if (role && INTERACTIVE_ROLES.has(role)) return true;
      if (el.closest('button, a, [role="button"], [role="link"], [role="tab"], [role="menuitem"], [role="option"], [role="switch"], [role="checkbox"], [role="radio"]')) {
        return true;
      }
      return false;
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return;
      if (e.ctrlKey || e.metaKey) return;

      const typing = isTypingTarget(e.target);

      // Alt+digit jump: never intercept while typing so digits still go to
      // the input.
      if (e.altKey && /^[0-9]$/.test(e.key)) {
        if (typing) return;
        const digit = parseInt(e.key, 10);
        // 1-9 -> indexes 0-8; 0 -> index 9 (10th question), if it exists
        const targetIndex = digit === 0 ? 9 : digit - 1;
        if (targetIndex >= 0 && targetIndex < questions.length) {
          e.preventDefault();
          handleJump(targetIndex);
        }
        return;
      }

      if (e.altKey || e.shiftKey) return;

      // Don't hijack normal typing in text/numeric entry contexts. Per task:
      // arrow keys move between questions whenever focus is not inside an
      // input/textarea (etc.), even when focus is on answer widgets.
      if (typing) return;

      if (e.key === "ArrowRight") {
        if (currentQuestionIndex < questions.length - 1) {
          e.preventDefault();
          setCurrentQuestionIndex(currentQuestionIndex + 1);
        }
      } else if (e.key === "ArrowLeft") {
        if (currentQuestionIndex > 0) {
          e.preventDefault();
          setCurrentQuestionIndex(currentQuestionIndex - 1);
        }
      } else if (e.key === "Enter") {
        // Don't hijack Enter on focused buttons/links/widgets — they should
        // activate themselves.
        if (isInteractiveTarget(e.target)) return;
        // Mirror Next button eligibility: don't advance past an unanswered
        // non-final question, and don't fire while results are calculating.
        const last = currentQuestionIndex === questions.length - 1;
        const q = questions[currentQuestionIndex];
        const answered = q ? isAnswerComplete(q, selectedAnswers[q.id]) : false;
        if (calculateResults.isPending) return;
        if (!last && !answered) return;
        e.preventDefault();
        void handleNext();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentQuestionIndex, questions, selectedAnswers, calculateResults.isPending]);

  const initialError = assessmentIsError || questionsIsError;
  const initialLoading = !initialError && (assessmentLoading || (!!assessment && isLoading) || (!assessment && !!assessmentId));
  if (initialLoading || initialError || !questions.length) {
    return (
      <div className="min-h-screen flex flex-col">
        <main className="flex-1 py-12">
          <div className="container mx-auto px-4 max-w-4xl" data-testid="loading-assessment">
            <DataState
              isLoading={initialLoading}
              isError={initialError}
              error={(assessmentError || questionsError) as Error | null}
              onRetry={() => {
                if (assessmentIsError) refetchAssessment();
                if (questionsIsError) refetchQuestions();
              }}
              isEmpty={!initialLoading && !initialError && questions.length === 0}
              emptyTitle="No questions available"
              emptyDescription="This assessment doesn't have any questions yet. Please check back later."
              errorTitle="We couldn't load this assessment"
              loading={
                <>
                  <div className="mb-8 space-y-2">
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-3 w-full" />
                  </div>
                  <Card className="p-8 space-y-6">
                    <div className="space-y-3">
                      <Skeleton className="h-6 w-3/4" />
                      <Skeleton className="h-4 w-1/2" />
                    </div>
                    <div className="space-y-3">
                      {Array.from({ length: 4 }).map((_, i) => (
                        <Skeleton key={i} className="h-12 w-full" />
                      ))}
                    </div>
                  </Card>
                  <div className="flex justify-between mt-8">
                    <Skeleton className="h-10 w-28" />
                    <Skeleton className="h-10 w-28" />
                  </div>
                </>
              }
            >
              <div />
            </DataState>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  const currentQuestion = questions[currentQuestionIndex];
  const currentAnswer = selectedAnswers[currentQuestion.id];
  const currentDimension = dimensions.find(d => d.id === currentQuestion.dimensionId);

  const isCurrentAnswered = isAnswerComplete(currentQuestion, currentAnswer);
  const canGoPrev = currentQuestionIndex > 0;
  const isLast = currentQuestionIndex === questions.length - 1;

  return (
    <div className="min-h-screen flex flex-col">
      <main className="flex-1 py-6 sm:py-8 md:py-12">
        <div className="container mx-auto px-3 sm:px-4 max-w-4xl">
          <div className="mb-6 sm:mb-8">
            <ProgressBar
              current={currentQuestionIndex + 1}
              total={questions.length}
              dimensionLabel={currentDimension?.label}
            />
          </div>

          <div className="mb-6">
            <QuestionNavigator
              total={questions.length}
              currentIndex={currentQuestionIndex}
              answeredIndices={answeredIndices}
              onJump={handleJump}
              saveStatus={saveStatus}
            />
          </div>

          <QuestionCard
            question={currentQuestion.text}
            questionType={currentQuestion.type as 'multiple_choice' | 'multi_select' | 'numeric' | 'true_false' | 'text'}
            answers={(currentQuestion.type === 'multiple_choice' || currentQuestion.type === 'multi_select') ? currentQuestion.answers.map(a => ({
              key: a.id,
              label: a.text,
              score: a.score,
            })) : undefined}
            minValue={currentQuestion.minValue ?? undefined}
            maxValue={currentQuestion.maxValue ?? undefined}
            unit={currentQuestion.unit ?? undefined}
            placeholder={currentQuestion.placeholder ?? undefined}
            onAnswer={handleAnswer}
            selectedAnswer={currentAnswer}
          />

          {showIncomplete && unansweredQuestions.length > 0 && (
            <Card
              id="incomplete-panel"
              className="mt-6 border-destructive/50 bg-destructive/5 p-6"
              data-testid="panel-incomplete"
            >
              <div className="flex items-start gap-3">
                <AlertCircle className="h-5 w-5 text-destructive mt-0.5 shrink-0" aria-hidden="true" />
                <div className="flex-1">
                  <h3 className="font-semibold mb-2" data-testid="text-incomplete-title">
                    {unansweredQuestions.length === 1
                      ? t('assessment.incompleteOne')
                      : t('assessment.incompleteMany', { count: unansweredQuestions.length })}
                  </h3>
                  <p className="text-sm text-muted-foreground mb-4">
                    {t('assessment.incompleteHint')}
                  </p>
                  <ul className="space-y-2">
                    {unansweredQuestions.map(({ q, index }) => (
                      <li key={q.id}>
                        <button
                          type="button"
                          onClick={() => {
                            setCurrentQuestionIndex(index);
                            setShowIncomplete(false);
                            window.scrollTo({ top: 0, behavior: "smooth" });
                          }}
                          className="w-full text-left p-3 rounded-md border bg-background hover-elevate active-elevate-2"
                          data-testid={`link-incomplete-${index + 1}`}
                        >
                          <div className="flex items-baseline gap-2">
                            <span className="text-xs font-semibold text-muted-foreground shrink-0">
                              Q{index + 1}
                            </span>
                            <span className="text-sm line-clamp-2">{q.text}</span>
                          </div>
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </Card>
          )}

          <div className="sticky bottom-0 z-10 -mx-3 mt-6 flex justify-between gap-3 border-t bg-background/95 px-3 py-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] backdrop-blur supports-[backdrop-filter]:bg-background/80 sm:static sm:mx-0 sm:mt-8 sm:flex-wrap sm:border-0 sm:bg-transparent sm:p-0 sm:pb-0 sm:backdrop-blur-none">
            <Button
              variant="outline"
              size="lg"
              onClick={handlePrevious}
              disabled={!canGoPrev}
              data-testid="button-previous"
              className="flex-1 sm:flex-none sm:h-10"
            >
              <ChevronLeft className="mr-1 sm:mr-2 h-4 w-4" />
              <span className="hidden sm:inline">{t('common.previous')}</span>
              <span className="sm:hidden">{t('common.back')}</span>
            </Button>
            <Button
              size="lg"
              onClick={handleNext}
              disabled={
                calculateResults.isPending ||
                (!isLast && !isCurrentAnswered)
              }
              data-testid="button-next"
              className="flex-1 sm:flex-none sm:h-10"
            >
              {calculateResults.isPending
                ? t('common.calculating')
                : isLast
                ? t('common.complete')
                : t('common.next')}
              <ChevronRight className="ml-1 sm:ml-2 h-4 w-4" />
            </Button>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
