import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Separator } from "@/components/ui/separator";
import { AiAssistant } from "@/components/admin/AiAssistant";
import {
  Plus, Trash, ChevronDown, ChevronRight, Sparkles,
  Link2, Lightbulb, GripVertical,
} from "lucide-react";
import type { Question, Answer, Dimension } from "@shared/schema";

const QUESTION_TYPE_LABELS: Record<string, string> = {
  multiple_choice: "Multiple Choice",
  multi_select: "Multi-Select",
  numeric: "Numeric",
  true_false: "True/False",
  text: "Text Input",
};

interface UnifiedQuestionEditorProps {
  question: Question;
  dimensions: Dimension[];
  onUpdateQuestion: (id: string, updates: Partial<Question>) => void;
  onDeleteQuestion: (id: string) => void;
  questionIndex: number;
  defaultExpanded?: boolean;
}

export function UnifiedQuestionEditor({
  question,
  dimensions,
  onUpdateQuestion,
  onDeleteQuestion,
  questionIndex,
  defaultExpanded = false,
}: UnifiedQuestionEditorProps) {
  const { toast } = useToast();
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  const [guidanceOpen, setGuidanceOpen] = useState(false);
  const [openResourcesFor, setOpenResourcesFor] = useState<Set<string>>(new Set());

  // Local question state (reset when question.id changes)
  const [localText, setLocalText] = useState(question.text);
  const [localType, setLocalType] = useState(question.type);
  const [localDimensionId, setLocalDimensionId] = useState(question.dimensionId || '');
  const [localOrder, setLocalOrder] = useState(question.order);
  const [localMinValue, setLocalMinValue] = useState(question.minValue ?? 0);
  const [localMaxValue, setLocalMaxValue] = useState(question.maxValue ?? 100);
  const [localUnit, setLocalUnit] = useState(question.unit || '');
  const [localPlaceholder, setLocalPlaceholder] = useState(question.placeholder || '');
  const [localImprovement, setLocalImprovement] = useState(question.improvementStatement || '');

  useEffect(() => {
    setLocalText(question.text);
    setLocalType(question.type);
    setLocalDimensionId(question.dimensionId || '');
    setLocalOrder(question.order);
    setLocalMinValue(question.minValue ?? 0);
    setLocalMaxValue(question.maxValue ?? 100);
    setLocalUnit(question.unit || '');
    setLocalPlaceholder(question.placeholder || '');
    setLocalImprovement(question.improvementStatement || '');
  }, [question.id]);

  // Local answer state for inline editing
  const [localAnswers, setLocalAnswers] = useState<
    Record<string, { text: string; score: number; order: number; improvementStatement: string; resourceTitle: string; resourceDescription: string; resourceLink: string }>
  >({});

  // Fetch answers for this question (only when expanded to avoid N+1 on load)
  const { data: answers = [], refetch: refetchAnswers } = useQuery<Answer[]>({
    queryKey: ["/api/answers", question.id],
    queryFn: () => apiRequest<Answer[]>(`/api/answers/${question.id}`),
    staleTime: 30000,
    enabled: isExpanded,
  });

  // Sync local answer state when server data arrives
  useEffect(() => {
    setLocalAnswers((prev) => {
      const next = { ...prev };
      answers.forEach((a) => {
        if (!next[a.id]) {
          next[a.id] = {
            text: a.text,
            score: a.score,
            order: a.order,
            improvementStatement: a.improvementStatement || "",
            resourceTitle: a.resourceTitle || "",
            resourceDescription: a.resourceDescription || "",
            resourceLink: a.resourceLink || "",
          };
        }
      });
      return next;
    });
  }, [answers]);

  const getLocal = (answer: Answer) =>
    localAnswers[answer.id] || {
      text: answer.text,
      score: answer.score,
      order: answer.order,
      improvementStatement: answer.improvementStatement || "",
      resourceTitle: answer.resourceTitle || "",
      resourceDescription: answer.resourceDescription || "",
      resourceLink: answer.resourceLink || "",
    };

  // Answer mutations
  const createAnswer = useMutation({
    mutationFn: (data: { questionId: string; text: string; score: number; order: number }) =>
      apiRequest("/api/answers", "POST", data),
    onSuccess: () => {
      refetchAnswers();
      toast({ title: "Answer added" });
    },
    onError: () =>
      toast({ title: "Error", description: "Failed to add answer.", variant: "destructive" }),
  });

  const updateAnswer = useMutation({
    mutationFn: ({ id, ...rest }: { id: string } & Partial<Answer>) =>
      apiRequest(`/api/answers/${id}`, "PUT", rest),
    onSuccess: () => refetchAnswers(),
    onError: () =>
      toast({ title: "Error", description: "Failed to update answer.", variant: "destructive" }),
  });

  const deleteAnswer = useMutation({
    mutationFn: (answerId: string) => apiRequest(`/api/answers/${answerId}`, "DELETE"),
    onSuccess: () => {
      refetchAnswers();
      toast({ title: "Answer deleted" });
    },
    onError: () =>
      toast({ title: "Error", description: "Failed to delete answer.", variant: "destructive" }),
  });

  // Save question field on blur
  const saveQuestionField = (updates: Partial<Question>) => {
    onUpdateQuestion(question.id, updates);
  };

  // Save answer field on blur
  const saveAnswerField = (answerId: string, updates: Partial<Answer>) => {
    updateAnswer.mutate({ id: answerId, ...updates });
  };

  const toggleResources = (answerId: string) => {
    setOpenResourcesFor((prev) => {
      const next = new Set(prev);
      if (next.has(answerId)) next.delete(answerId);
      else next.add(answerId);
      return next;
    });
  };

  const handleRewriteAllAnswers = async () => {
    if (answers.length === 0) return;
    try {
      const response = await apiRequest("/api/admin/ai/rewrite-all-answers", "POST", {
        questionId: question.id,
        questionText: question.text,
        answers: answers.map((a) => ({ id: a.id, text: a.text, score: a.score })),
      });
      toast({
        title: "Rewrites Sent to Review Queue",
        description:
          (response as any).message || `${answers.length} answer rewrites pending approval.`,
      });
    } catch {
      toast({
        title: "Generation Failed",
        description: "Failed to generate rewrites.",
        variant: "destructive",
      });
    }
  };

  const hasAnswers = ["multiple_choice", "multi_select", "true_false"].includes(question.type);
  const sortedAnswers = [...answers].sort((a, b) => a.order - b.order);

  return (
    <Card
      className={`transition-all ${isExpanded ? "ring-1 ring-primary/30" : ""}`}
      data-testid={`unified-question-${question.id}`}
    >
      {/* Collapsed header — always visible */}
      <div
        className="flex items-center gap-3 px-4 py-3 cursor-pointer select-none rounded-lg"
        onClick={() => setIsExpanded((v) => !v)}
      >
        <GripVertical className="h-4 w-4 text-muted-foreground flex-shrink-0" />
        <Badge variant="outline" className="flex-shrink-0 font-mono text-xs">
          Q{questionIndex + 1}
        </Badge>
        <span className="flex-1 font-medium text-sm line-clamp-2">{question.text}</span>
        <div className="flex items-center gap-2 flex-shrink-0">
          <Badge variant="secondary" className="text-xs hidden sm:inline-flex">
            {QUESTION_TYPE_LABELS[question.type] ?? question.type}
          </Badge>
          {hasAnswers && (
            <Badge variant="outline" className="text-xs">
              {answers.length} ans
            </Badge>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-muted-foreground hover:text-destructive"
            onClick={(e) => {
              e.stopPropagation();
              if (confirm("Delete this question and all its answers?")) {
                onDeleteQuestion(question.id);
              }
            }}
            data-testid={`button-delete-question-${question.id}`}
          >
            <Trash className="h-3.5 w-3.5" />
          </Button>
          <ChevronDown
            className={`h-4 w-4 text-muted-foreground transition-transform duration-200 ${isExpanded ? "rotate-180" : ""}`}
          />
        </div>
      </div>

      {/* Expanded editor */}
      {isExpanded && (
        <div
          className="px-4 pb-5 space-y-5 border-t"
          onClick={(e) => e.stopPropagation()}
        >
          {/* ── Question fields ── */}
          <div className="space-y-4 pt-4">
            <div>
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">Question Text</Label>
              <Textarea
                value={localText}
                onChange={(e) => setLocalText(e.target.value)}
                onBlur={() => {
                  if (localText !== question.text) saveQuestionField({ text: localText });
                }}
                placeholder="Enter your question..."
                rows={2}
                className="mt-1"
                data-testid={`input-question-text-${question.id}`}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-xs uppercase tracking-wide text-muted-foreground">Type</Label>
                <Select
                  value={localType}
                  onValueChange={(v) => {
                    setLocalType(v as Question["type"]);
                    saveQuestionField({ type: v as Question["type"] });
                  }}
                >
                  <SelectTrigger className="mt-1" data-testid={`select-type-${question.id}`}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="multiple_choice">Multiple Choice</SelectItem>
                    <SelectItem value="multi_select">Multi-Select</SelectItem>
                    <SelectItem value="numeric">Numeric</SelectItem>
                    <SelectItem value="true_false">True / False</SelectItem>
                    <SelectItem value="text">Text Input</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label className="text-xs uppercase tracking-wide text-muted-foreground">Dimension</Label>
                <Select
                  value={localDimensionId || "none"}
                  onValueChange={(v) => {
                    const dim = v === "none" ? "" : v;
                    setLocalDimensionId(dim);
                    saveQuestionField({ dimensionId: dim || undefined });
                  }}
                >
                  <SelectTrigger className="mt-1" data-testid={`select-dimension-${question.id}`}>
                    <SelectValue placeholder="No dimension" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No dimension</SelectItem>
                    {dimensions.map((d) => (
                      <SelectItem key={d.id} value={d.id}>
                        {d.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Numeric range fields */}
            {localType === "numeric" && (
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <Label className="text-xs">Min Value</Label>
                  <Input
                    type="number"
                    value={localMinValue}
                    onChange={(e) => setLocalMinValue(Number(e.target.value))}
                    onBlur={() => {
                      if (localMinValue !== question.minValue)
                        saveQuestionField({ minValue: localMinValue });
                    }}
                    className="mt-1 h-8"
                  />
                </div>
                <div>
                  <Label className="text-xs">Max Value</Label>
                  <Input
                    type="number"
                    value={localMaxValue}
                    onChange={(e) => setLocalMaxValue(Number(e.target.value))}
                    onBlur={() => {
                      if (localMaxValue !== question.maxValue)
                        saveQuestionField({ maxValue: localMaxValue });
                    }}
                    className="mt-1 h-8"
                  />
                </div>
                <div>
                  <Label className="text-xs">Unit</Label>
                  <Input
                    value={localUnit}
                    onChange={(e) => setLocalUnit(e.target.value)}
                    onBlur={() => {
                      if (localUnit !== question.unit) saveQuestionField({ unit: localUnit });
                    }}
                    placeholder="e.g., %"
                    className="mt-1 h-8"
                  />
                </div>
              </div>
            )}

            {/* Text placeholder */}
            {localType === "text" && (
              <div>
                <Label className="text-xs">Placeholder Text</Label>
                <Input
                  value={localPlaceholder}
                  onChange={(e) => setLocalPlaceholder(e.target.value)}
                  onBlur={() => {
                    if (localPlaceholder !== question.placeholder)
                      saveQuestionField({ placeholder: localPlaceholder });
                  }}
                  placeholder="e.g., Enter your response…"
                  className="mt-1 h-8"
                />
              </div>
            )}

            {/* Question-level guidance (collapsible) */}
            <Collapsible open={guidanceOpen} onOpenChange={setGuidanceOpen}>
              <CollapsibleTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-muted-foreground h-7 px-2 -ml-2"
                  type="button"
                >
                  <Lightbulb className="h-3.5 w-3.5 mr-1.5 text-amber-500" />
                  Question guidance
                  <ChevronRight
                    className={`h-3 w-3 ml-1 transition-transform duration-200 ${guidanceOpen ? "rotate-90" : ""}`}
                  />
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <Textarea
                  value={localImprovement}
                  onChange={(e) => setLocalImprovement(e.target.value)}
                  onBlur={() => {
                    if (localImprovement !== question.improvementStatement)
                      saveQuestionField({ improvementStatement: localImprovement });
                  }}
                  placeholder="General improvement guidance for this question area…"
                  rows={2}
                  className="mt-2"
                  data-testid={`input-question-improvement-${question.id}`}
                />
              </CollapsibleContent>
            </Collapsible>
          </div>

          {/* ── Answers section ── */}
          {hasAnswers && (
            <>
              <Separator />
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold">Answer Options</span>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleRewriteAllAnswers}
                      disabled={answers.length === 0}
                      data-testid={`button-rewrite-all-${question.id}`}
                    >
                      <Sparkles className="h-3.5 w-3.5 mr-1.5" />
                      Rewrite All (AI)
                    </Button>
                    <Button
                      size="sm"
                      onClick={() =>
                        createAnswer.mutate({
                          questionId: question.id,
                          text: `Option ${answers.length + 1}`,
                          score: (answers.length + 1) * 100,
                          order: answers.length + 1,
                        })
                      }
                      disabled={createAnswer.isPending}
                      data-testid={`button-add-answer-${question.id}`}
                    >
                      <Plus className="h-3.5 w-3.5 mr-1.5" />
                      Add Answer
                    </Button>
                  </div>
                </div>

                {sortedAnswers.length === 0 ? (
                  <div className="text-center text-sm text-muted-foreground py-6 border rounded-md border-dashed">
                    No answer options yet — click "Add Answer" to get started.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {sortedAnswers.map((answer) => {
                      const local = getLocal(answer);
                      const resourcesOpen = openResourcesFor.has(answer.id);

                      return (
                        <div
                          key={answer.id}
                          className="border rounded-md"
                          data-testid={`answer-row-${answer.id}`}
                        >
                          {/* Answer main row */}
                          <div className="flex items-center gap-2 px-3 py-2">
                            <Input
                              value={local.text}
                              onChange={(e) =>
                                setLocalAnswers((prev) => ({
                                  ...prev,
                                  [answer.id]: { ...local, text: e.target.value },
                                }))
                              }
                              onBlur={() => {
                                if (local.text !== answer.text)
                                  saveAnswerField(answer.id, { text: local.text });
                              }}
                              placeholder="Answer text…"
                              className="flex-1 h-8 text-sm"
                              data-testid={`input-answer-text-${answer.id}`}
                            />
                            <div className="flex items-center gap-1 flex-shrink-0">
                              <span className="text-xs text-muted-foreground whitespace-nowrap">Score</span>
                              <Input
                                type="number"
                                value={local.score}
                                onChange={(e) =>
                                  setLocalAnswers((prev) => ({
                                    ...prev,
                                    [answer.id]: { ...local, score: Number(e.target.value) },
                                  }))
                                }
                                onBlur={() => {
                                  if (local.score !== answer.score)
                                    saveAnswerField(answer.id, { score: local.score });
                                }}
                                className="w-20 h-8 text-sm"
                                data-testid={`input-answer-score-${answer.id}`}
                              />
                            </div>
                            <AiAssistant
                              type="answer-rewrite"
                              context={{
                                questionText: question.text,
                                answerText: local.text,
                                answerScore: local.score,
                              }}
                              onGenerated={(data) => {
                                if (data.rewrittenAnswer) {
                                  setLocalAnswers((prev) => ({
                                    ...prev,
                                    [answer.id]: { ...local, text: data.rewrittenAnswer },
                                  }));
                                  saveAnswerField(answer.id, { text: data.rewrittenAnswer });
                                }
                              }}
                              trigger={
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8 flex-shrink-0"
                                  title="AI rewrite this answer"
                                  data-testid={`button-ai-answer-${answer.id}`}
                                >
                                  <Sparkles className="h-3.5 w-3.5" />
                                </Button>
                              }
                            />
                            <Button
                              variant="ghost"
                              size="icon"
                              className={`h-8 w-8 flex-shrink-0 transition-colors ${resourcesOpen ? "text-primary" : "text-muted-foreground"}`}
                              onClick={() => toggleResources(answer.id)}
                              title="Toggle resources & guidance"
                              data-testid={`button-resources-${answer.id}`}
                            >
                              <Link2 className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 flex-shrink-0 text-muted-foreground hover:text-destructive"
                              onClick={() => {
                                if (confirm("Delete this answer?")) deleteAnswer.mutate(answer.id);
                              }}
                              data-testid={`button-delete-answer-${answer.id}`}
                            >
                              <Trash className="h-3.5 w-3.5" />
                            </Button>
                          </div>

                          {/* Resources & guidance panel */}
                          {resourcesOpen && (
                            <div className="border-t px-3 py-3 space-y-3 bg-muted/20 rounded-b-md">
                              {/* Improvement statement */}
                              <div>
                                <div className="flex items-center gap-2 mb-1">
                                  <Lightbulb className="h-3.5 w-3.5 text-amber-500" />
                                  <span className="text-xs font-medium">Improvement Statement</span>
                                  <AiAssistant
                                    type="improvement"
                                    context={{
                                      questionText: question.text,
                                      answerText: local.text,
                                      answerScore: local.score,
                                    }}
                                    onGenerated={(content) => {
                                      if (content.improvementStatement) {
                                        setLocalAnswers((prev) => ({
                                          ...prev,
                                          [answer.id]: {
                                            ...local,
                                            improvementStatement: content.improvementStatement,
                                          },
                                        }));
                                        saveAnswerField(answer.id, {
                                          improvementStatement: content.improvementStatement,
                                        });
                                      }
                                    }}
                                  />
                                </div>
                                <Textarea
                                  value={local.improvementStatement}
                                  onChange={(e) =>
                                    setLocalAnswers((prev) => ({
                                      ...prev,
                                      [answer.id]: {
                                        ...local,
                                        improvementStatement: e.target.value,
                                      },
                                    }))
                                  }
                                  onBlur={() => {
                                    if (local.improvementStatement !== answer.improvementStatement)
                                      saveAnswerField(answer.id, {
                                        improvementStatement: local.improvementStatement,
                                      });
                                  }}
                                  placeholder="What should the user do to improve from this answer level…"
                                  rows={2}
                                  className="text-sm"
                                  data-testid={`input-improvement-${answer.id}`}
                                />
                              </div>

                              {/* Resource link */}
                              <div className="space-y-2">
                                <span className="text-xs font-medium flex items-center gap-1.5">
                                  <Link2 className="h-3.5 w-3.5" />
                                  Resource Link
                                </span>
                                <Input
                                  value={local.resourceTitle}
                                  onChange={(e) =>
                                    setLocalAnswers((prev) => ({
                                      ...prev,
                                      [answer.id]: { ...local, resourceTitle: e.target.value },
                                    }))
                                  }
                                  onBlur={() => {
                                    if (local.resourceTitle !== answer.resourceTitle)
                                      saveAnswerField(answer.id, {
                                        resourceTitle: local.resourceTitle,
                                      });
                                  }}
                                  placeholder="Resource title"
                                  className="h-8 text-sm"
                                  data-testid={`input-resource-title-${answer.id}`}
                                />
                                <Textarea
                                  value={local.resourceDescription}
                                  onChange={(e) =>
                                    setLocalAnswers((prev) => ({
                                      ...prev,
                                      [answer.id]: {
                                        ...local,
                                        resourceDescription: e.target.value,
                                      },
                                    }))
                                  }
                                  onBlur={() => {
                                    if (
                                      local.resourceDescription !== answer.resourceDescription
                                    )
                                      saveAnswerField(answer.id, {
                                        resourceDescription: local.resourceDescription,
                                      });
                                  }}
                                  placeholder="Brief description of this resource…"
                                  rows={2}
                                  className="text-sm"
                                  data-testid={`input-resource-desc-${answer.id}`}
                                />
                                <Input
                                  type="url"
                                  value={local.resourceLink}
                                  onChange={(e) =>
                                    setLocalAnswers((prev) => ({
                                      ...prev,
                                      [answer.id]: { ...local, resourceLink: e.target.value },
                                    }))
                                  }
                                  onBlur={() => {
                                    if (local.resourceLink !== answer.resourceLink)
                                      saveAnswerField(answer.id, {
                                        resourceLink: local.resourceLink,
                                      });
                                  }}
                                  placeholder="https://…"
                                  className="h-8 text-sm"
                                  data-testid={`input-resource-url-${answer.id}`}
                                />
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </Card>
  );
}
