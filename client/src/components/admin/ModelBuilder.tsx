import { useState, useRef, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Plus, Edit, Trash, GripVertical, ChevronRight } from "lucide-react";
import type { Model, Dimension, Question, Answer } from "@shared/schema";

interface ModelBuilderProps {
  model: Model;
  dimensions: Dimension[];
  questions: Question[];
  answers: Answer[];
  onUpdateModel: (updates: Partial<Model>) => void;
  onAddDimension: () => void;
  onEditDimension: (dimension: Dimension) => void;
  onDeleteDimension: (dimensionId: string) => void;
  onAddQuestion: (dimensionId?: string) => void;
  onEditQuestion: (question: Question) => void;
  onDeleteQuestion: (questionId: string) => void;
  onManageAnswers: (question: Question) => void;
}

export function ModelBuilder({
  model,
  dimensions,
  questions,
  answers,
  onUpdateModel,
  onAddDimension,
  onEditDimension,
  onDeleteDimension,
  onAddQuestion,
  onEditQuestion,
  onDeleteQuestion,
  onManageAnswers,
}: ModelBuilderProps) {
  const [activeTab, setActiveTab] = useState("overview");
  
  // Local state for form fields (for responsive UI)
  const [localName, setLocalName] = useState(model.name);
  const [localSlug, setLocalSlug] = useState(model.slug);
  const [localDescription, setLocalDescription] = useState(model.description || "");
  
  // Debounce refs for text inputs
  const nameDebounceRef = useRef<NodeJS.Timeout>();
  const descriptionDebounceRef = useRef<NodeJS.Timeout>();
  const slugDebounceRef = useRef<NodeJS.Timeout>();

  // Sync local state when model prop changes
  useEffect(() => {
    setLocalName(model.name);
    setLocalSlug(model.slug);
    setLocalDescription(model.description || "");
    
    // Cleanup: clear pending debounce timers when model changes
    return () => {
      if (nameDebounceRef.current) clearTimeout(nameDebounceRef.current);
      if (descriptionDebounceRef.current) clearTimeout(descriptionDebounceRef.current);
      if (slugDebounceRef.current) clearTimeout(slugDebounceRef.current);
    };
  }, [model.id, model.name, model.slug, model.description]); // Re-run when model or its fields change

  // Debounced update handlers
  const handleNameChange = (value: string) => {
    setLocalName(value);
    if (nameDebounceRef.current) clearTimeout(nameDebounceRef.current);
    nameDebounceRef.current = setTimeout(() => onUpdateModel({ name: value }), 500);
  };

  const handleDescriptionChange = (value: string) => {
    setLocalDescription(value);
    if (descriptionDebounceRef.current) clearTimeout(descriptionDebounceRef.current);
    descriptionDebounceRef.current = setTimeout(() => onUpdateModel({ description: value }), 500);
  };

  const handleSlugChange = (value: string) => {
    setLocalSlug(value);
    if (slugDebounceRef.current) clearTimeout(slugDebounceRef.current);
    slugDebounceRef.current = setTimeout(() => onUpdateModel({ slug: value }), 500);
  };

  // Get questions for a specific dimension
  const getQuestionsForDimension = (dimensionId: string) => {
    return questions
      .filter((q) => q.dimensionId === dimensionId)
      .sort((a, b) => a.order - b.order);
  };

  // Get answers for a specific question
  const getAnswersForQuestion = (questionId: string) => {
    return answers
      .filter((a) => a.questionId === questionId)
      .sort((a, b) => a.order - b.order);
  };

  // Get questions without a dimension
  const getUngroupedQuestions = () => {
    return questions
      .filter((q) => !q.dimensionId)
      .sort((a, b) => a.order - b.order);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-2xl font-bold">{model.name}</h2>
          <p className="text-sm text-muted-foreground">/{model.slug}</p>
        </div>
        <Badge variant={model.status === "published" ? "default" : "secondary"}>
          {model.status || "draft"}
        </Badge>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="overview" data-testid="tab-overview">
            Overview
          </TabsTrigger>
          <TabsTrigger value="structure" data-testid="tab-structure">
            Structure
          </TabsTrigger>
          <TabsTrigger value="resources" data-testid="tab-resources">
            Resources
          </TabsTrigger>
          <TabsTrigger value="maturity-scale" data-testid="tab-maturity-scale">
            Maturity Scale
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <Card className="p-6">
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="model-name">Name</Label>
                  <Input
                    id="model-name"
                    value={localName}
                    onChange={(e) => handleNameChange(e.target.value)}
                    data-testid="input-model-name"
                  />
                </div>
                <div>
                  <Label htmlFor="model-slug">Slug</Label>
                  <Input
                    id="model-slug"
                    value={localSlug}
                    onChange={(e) =>
                      handleSlugChange(e.target.value.toLowerCase().replace(/\s+/g, "-"))
                    }
                    data-testid="input-model-slug"
                  />
                </div>
              </div>

              <div>
                <Label htmlFor="model-description">Description</Label>
                <Textarea
                  id="model-description"
                  value={localDescription}
                  onChange={(e) => handleDescriptionChange(e.target.value)}
                  rows={4}
                  data-testid="input-model-description"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="model-version">Version</Label>
                  <Input
                    id="model-version"
                    value={model.version || ""}
                    onChange={(e) => onUpdateModel({ version: e.target.value })}
                    placeholder="1.0.0"
                    data-testid="input-model-version"
                  />
                </div>
                <div>
                  <Label htmlFor="model-time">Estimated Time</Label>
                  <Input
                    id="model-time"
                    value={model.estimatedTime || ""}
                    onChange={(e) => onUpdateModel({ estimatedTime: e.target.value })}
                    placeholder="15-20 minutes"
                    data-testid="input-model-time"
                  />
                </div>
              </div>
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="structure" className="space-y-4">
          <div className="flex justify-between items-center">
            <div>
              <h3 className="text-lg font-semibold">Dimensions & Questions</h3>
              <p className="text-sm text-muted-foreground">
                Organize your assessment into dimensions with related questions
              </p>
            </div>
            <Button onClick={onAddDimension} data-testid="button-add-dimension">
              <Plus className="mr-2 h-4 w-4" />
              Add Dimension
            </Button>
          </div>

          {dimensions.length === 0 && getUngroupedQuestions().length === 0 ? (
            <Card className="p-12">
              <div className="text-center space-y-3">
                <h3 className="text-lg font-semibold">No content yet</h3>
                <p className="text-sm text-muted-foreground">
                  Add dimensions to organize your questions, or add questions directly
                </p>
                <div className="flex gap-2 justify-center">
                  <Button onClick={onAddDimension} variant="outline">
                    Add Dimension
                  </Button>
                  <Button onClick={() => onAddQuestion()} variant="outline">
                    Add Question
                  </Button>
                </div>
              </div>
            </Card>
          ) : (
            <Accordion type="multiple" className="space-y-2">
              {dimensions.sort((a, b) => a.order - b.order).map((dimension) => {
                const dimensionQuestions = getQuestionsForDimension(dimension.id);
                
                return (
                  <AccordionItem
                    key={dimension.id}
                    value={dimension.id}
                    className="border rounded-lg"
                    data-testid={`accordion-dimension-${dimension.id}`}
                  >
                    <AccordionTrigger className="px-4 hover:no-underline hover-elevate">
                      <div className="flex items-center gap-3 flex-1">
                        <GripVertical className="h-4 w-4 text-muted-foreground" />
                        <div className="flex-1 text-left">
                          <div className="font-semibold">{dimension.label}</div>
                          {dimension.description && (
                            <div className="text-sm text-muted-foreground">
                              {dimension.description}
                            </div>
                          )}
                        </div>
                        <Badge variant="outline">{dimensionQuestions.length} questions</Badge>
                      </div>
                    </AccordionTrigger>
                    <AccordionContent className="px-4 pb-4">
                      <div className="space-y-4 pt-2">
                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => onEditDimension(dimension)}
                            data-testid={`button-edit-dimension-${dimension.id}`}
                          >
                            <Edit className="mr-2 h-3 w-3" />
                            Edit Dimension
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => onAddQuestion(dimension.id)}
                            data-testid={`button-add-question-to-${dimension.id}`}
                          >
                            <Plus className="mr-2 h-3 w-3" />
                            Add Question
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => onDeleteDimension(dimension.id)}
                            data-testid={`button-delete-dimension-${dimension.id}`}
                          >
                            <Trash className="mr-2 h-3 w-3" />
                            Delete
                          </Button>
                        </div>

                        {dimensionQuestions.length === 0 ? (
                          <div className="text-center py-6 text-sm text-muted-foreground border rounded-md">
                            No questions yet. Add your first question to this dimension.
                          </div>
                        ) : (
                          <div className="space-y-2">
                            {dimensionQuestions.map((question, qIndex) => {
                              const questionAnswers = getAnswersForQuestion(question.id);
                              
                              return (
                                <Card
                                  key={question.id}
                                  className="p-4"
                                  data-testid={`question-card-${question.id}`}
                                >
                                  <div className="flex items-start gap-3">
                                    <GripVertical className="h-4 w-4 text-muted-foreground mt-1" />
                                    <div className="flex-1 space-y-3">
                                      <div className="flex items-start justify-between gap-2">
                                        <div className="flex-1">
                                          <div className="flex items-center gap-2">
                                            <span className="text-xs font-medium text-muted-foreground">
                                              Q{qIndex + 1}
                                            </span>
                                            <span className="font-medium">{question.text}</span>
                                          </div>
                                          {question.placeholder && (
                                            <p className="text-sm text-muted-foreground mt-1">
                                              Placeholder: {question.placeholder}
                                            </p>
                                          )}
                                        </div>
                                        <Badge variant="outline" className="flex-shrink-0">
                                          {questionAnswers.length} answers
                                        </Badge>
                                      </div>

                                      {questionAnswers.length > 0 && (
                                        <div className="space-y-1 pl-4 border-l-2">
                                          {questionAnswers.map((answer) => (
                                            <div
                                              key={answer.id}
                                              className="flex items-center gap-2 text-sm"
                                            >
                                              <ChevronRight className="h-3 w-3 text-muted-foreground" />
                                              <span className="flex-1">{answer.text}</span>
                                              <span className="text-xs text-muted-foreground">
                                                {answer.score} pts
                                              </span>
                                            </div>
                                          ))}
                                        </div>
                                      )}

                                      <div className="flex gap-2">
                                        <Button
                                          variant="ghost"
                                          size="sm"
                                          onClick={() => onEditQuestion(question)}
                                          data-testid={`button-edit-question-${question.id}`}
                                        >
                                          <Edit className="mr-2 h-3 w-3" />
                                          Edit
                                        </Button>
                                        <Button
                                          variant="ghost"
                                          size="sm"
                                          onClick={() => onManageAnswers(question)}
                                          data-testid={`button-manage-answers-${question.id}`}
                                        >
                                          Manage Answers
                                        </Button>
                                        <Button
                                          variant="ghost"
                                          size="sm"
                                          onClick={() => onDeleteQuestion(question.id)}
                                          data-testid={`button-delete-question-${question.id}`}
                                          aria-label="Delete question"
                                        >
                                          <Trash className="h-3 w-3" />
                                        </Button>
                                      </div>
                                    </div>
                                  </div>
                                </Card>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                );
              })}

              {/* Ungrouped Questions */}
              {getUngroupedQuestions().length > 0 && (
                <AccordionItem
                  value="ungrouped"
                  className="border rounded-lg"
                  data-testid="accordion-ungrouped-questions"
                >
                  <AccordionTrigger className="px-4 hover:no-underline hover-elevate">
                    <div className="flex items-center gap-3 flex-1">
                      <div className="flex-1 text-left">
                        <div className="font-semibold">Ungrouped Questions</div>
                        <div className="text-sm text-muted-foreground">
                          Questions not assigned to any dimension
                        </div>
                      </div>
                      <Badge variant="outline">{getUngroupedQuestions().length} questions</Badge>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent className="px-4 pb-4">
                    <div className="space-y-2 pt-2">
                      {getUngroupedQuestions().map((question, qIndex) => {
                        const questionAnswers = getAnswersForQuestion(question.id);
                        
                        return (
                          <Card
                            key={question.id}
                            className="p-4"
                            data-testid={`question-card-${question.id}`}
                          >
                            <div className="flex items-start gap-3">
                              <GripVertical className="h-4 w-4 text-muted-foreground mt-1" />
                              <div className="flex-1 space-y-3">
                                <div className="flex items-start justify-between gap-2">
                                  <div className="flex-1">
                                    <div className="flex items-center gap-2">
                                      <span className="text-xs font-medium text-muted-foreground">
                                        Q{qIndex + 1}
                                      </span>
                                      <span className="font-medium">{question.text}</span>
                                    </div>
                                    {question.placeholder && (
                                      <p className="text-sm text-muted-foreground mt-1">
                                        Placeholder: {question.placeholder}
                                      </p>
                                    )}
                                  </div>
                                  <Badge variant="outline" className="flex-shrink-0">
                                    {questionAnswers.length} answers
                                  </Badge>
                                </div>

                                <div className="flex gap-2">
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => onEditQuestion(question)}
                                    data-testid={`button-edit-question-${question.id}`}
                                  >
                                    <Edit className="mr-2 h-3 w-3" />
                                    Edit
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => onManageAnswers(question)}
                                    data-testid={`button-manage-answers-${question.id}`}
                                  >
                                    Manage Answers
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => onDeleteQuestion(question.id)}
                                    data-testid={`button-delete-question-${question.id}`}
                                    aria-label="Delete question"
                                  >
                                    <Trash className="h-3 w-3" />
                                  </Button>
                                </div>
                              </div>
                            </div>
                          </Card>
                        );
                      })}
                    </div>
                  </AccordionContent>
                </AccordionItem>
              )}
            </Accordion>
          )}
        </TabsContent>

        <TabsContent value="resources" className="space-y-4">
          <Card className="p-6">
            <div className="space-y-4">
              <div>
                <Label>General Resources</Label>
                <p className="text-sm text-muted-foreground mb-2">
                  Add resources that apply to the entire assessment
                </p>
                <Textarea
                  value={JSON.stringify(model.generalResources || [], null, 2)}
                  onChange={(e) => {
                    try {
                      const parsed = JSON.parse(e.target.value);
                      onUpdateModel({ generalResources: parsed });
                    } catch {
                      // Invalid JSON, don't update
                    }
                  }}
                  rows={10}
                  className="font-mono text-sm"
                  placeholder="[]"
                  data-testid="input-general-resources"
                />
              </div>
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="maturity-scale" className="space-y-4">
          <Card className="p-6">
            <div className="space-y-4">
              <div>
                <h3 className="text-lg font-semibold">Maturity Scale Levels</h3>
                <p className="text-sm text-muted-foreground">
                  Define the scoring levels for this assessment
                </p>
              </div>

              <div className="space-y-2">
                {(model.maturityScale || []).map((level, index) => (
                  <Card key={level.id} className="p-4">
                    <div className="flex items-center gap-4">
                      <div className="flex-1 grid grid-cols-4 gap-3">
                        <div>
                          <Label className="text-xs">Name</Label>
                          <div className="font-medium">{level.name}</div>
                        </div>
                        <div>
                          <Label className="text-xs">Min Score</Label>
                          <div className="font-medium">{level.minScore}</div>
                        </div>
                        <div>
                          <Label className="text-xs">Max Score</Label>
                          <div className="font-medium">{level.maxScore}</div>
                        </div>
                        <div className="col-span-4">
                          <Label className="text-xs">Description</Label>
                          <div className="text-sm text-muted-foreground">{level.description}</div>
                        </div>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            </div>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
