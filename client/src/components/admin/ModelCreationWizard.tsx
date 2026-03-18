import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { UnifiedQuestionEditor } from "@/components/admin/UnifiedQuestionEditor";
import {
  Plus, Trash, ChevronRight, ChevronLeft, Check,
  BookOpen, HelpCircle, BarChart3, Layers, Rocket,
} from "lucide-react";
import type { Model, Dimension, Question } from "@shared/schema";

// ── Step definitions ──────────────────────────────────────────────────────────

const STEPS = [
  { id: 1, label: "Basics",        icon: BookOpen },
  { id: 2, label: "Dimensions",    icon: Layers },
  { id: 3, label: "Questions",     icon: HelpCircle },
  { id: 4, label: "Maturity Scale", icon: BarChart3 },
  { id: 5, label: "Publish",       icon: Rocket },
];

// ── Slug helper ───────────────────────────────────────────────────────────────

function slugify(text: string) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

// ── Step indicator ────────────────────────────────────────────────────────────

function StepIndicator({ currentStep }: { currentStep: number }) {
  return (
    <div className="flex items-center gap-1 mb-6">
      {STEPS.map((step, i) => {
        const Icon = step.icon;
        const done = step.id < currentStep;
        const active = step.id === currentStep;
        return (
          <div key={step.id} className="flex items-center">
            <div
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                done
                  ? "bg-primary/10 text-primary"
                  : active
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground"
              }`}
            >
              {done ? <Check className="h-3 w-3" /> : <Icon className="h-3 w-3" />}
              <span className="hidden sm:inline">{step.label}</span>
            </div>
            {i < STEPS.length - 1 && (
              <ChevronRight className="h-3 w-3 text-muted-foreground mx-0.5" />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

interface ModelCreationWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onModelCreated: (model: Model) => void;
}

export function ModelCreationWizard({
  open,
  onOpenChange,
  onModelCreated,
}: ModelCreationWizardProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [step, setStep] = useState(1);
  const [modelId, setModelId] = useState<string | null>(null);

  // Step 1 form state
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugManual, setSlugManual] = useState(false);
  const [description, setDescription] = useState("");
  const [modelClass, setModelClass] = useState<"organizational" | "individual">("organizational");
  const [visibility, setVisibility] = useState<"public" | "private">("public");
  const [estimatedTime, setEstimatedTime] = useState("15-20 minutes");
  const [version, setVersion] = useState("1.0.0");

  // Step 2: dimensions (created in-place after model exists)
  const [newDimLabel, setNewDimLabel] = useState("");
  const [newDimDesc, setNewDimDesc] = useState("");

  // Step 3: new question form
  const [newQText, setNewQText] = useState("");
  const [newQType, setNewQType] = useState<Question["type"]>("multiple_choice");
  const [newQDimId, setNewQDimId] = useState<string>("");

  // Step 4: maturity scale
  const [maturityLevels, setMaturityLevels] = useState<
    Array<{ id: string; name: string; description: string; minScore: number; maxScore: number }>
  >([]);
  const [scoringMethod, setScoringMethod] = useState<"average" | "sum">("average");

  // ── Queries for in-progress model data ────────────────────────────────────

  const { data: dimensions = [], refetch: refetchDimensions } = useQuery<Dimension[]>({
    queryKey: ["/api/dimensions", modelId],
    queryFn: () => apiRequest(`/api/dimensions/${modelId}`),
    enabled: !!modelId,
  });

  const { data: questions = [], refetch: refetchQuestions } = useQuery<Question[]>({
    queryKey: ["/api/questions", modelId],
    queryFn: () => apiRequest(`/api/questions?modelId=${modelId}`),
    enabled: !!modelId,
  });

  // ── Mutations ──────────────────────────────────────────────────────────────

  const createModel = useMutation({
    mutationFn: (data: any) => apiRequest("/api/models", "POST", data),
    onSuccess: (created: any) => {
      setModelId(created.id);
      queryClient.invalidateQueries({ queryKey: ["/api/admin/models"] });
      setStep(2);
      toast({ title: "Model created", description: "Now add dimensions (optional)." });
    },
    onError: (err: any) => {
      toast({
        title: "Error creating model",
        description: err.message || "Please try again.",
        variant: "destructive",
      });
    },
  });

  const updateModel = useMutation({
    mutationFn: (data: any) => apiRequest(`/api/models/${modelId}`, "PUT", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/models"] });
    },
  });

  const publishModel = useMutation({
    mutationFn: () => apiRequest(`/api/models/${modelId}`, "PUT", { status: "published" }),
    onSuccess: (updated: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/models"] });
      toast({ title: "Model published!", description: `"${name}" is now live.` });
      onModelCreated(updated);
      handleClose();
    },
    onError: () =>
      toast({ title: "Failed to publish", variant: "destructive" }),
  });

  const createDimension = useMutation({
    mutationFn: (data: any) => apiRequest("/api/dimensions", "POST", data),
    onSuccess: () => {
      refetchDimensions();
      setNewDimLabel("");
      setNewDimDesc("");
      toast({ title: "Dimension added" });
    },
    onError: () =>
      toast({ title: "Error", description: "Failed to add dimension.", variant: "destructive" }),
  });

  const deleteDimension = useMutation({
    mutationFn: (id: string) => apiRequest(`/api/dimensions/${id}`, "DELETE"),
    onSuccess: () => refetchDimensions(),
  });

  const createQuestion = useMutation({
    mutationFn: (data: any) => apiRequest("/api/questions", "POST", data),
    onSuccess: () => {
      refetchQuestions();
      setNewQText("");
      setNewQType("multiple_choice");
      setNewQDimId("");
      toast({ title: "Question added" });
    },
    onError: () =>
      toast({ title: "Error", description: "Failed to add question.", variant: "destructive" }),
  });

  const updateQuestion = useMutation({
    mutationFn: ({ id, ...rest }: { id: string } & Partial<Question>) =>
      apiRequest(`/api/questions/${id}`, "PUT", rest),
    onSuccess: () => refetchQuestions(),
  });

  const deleteQuestion = useMutation({
    mutationFn: (id: string) => apiRequest(`/api/questions/${id}`, "DELETE"),
    onSuccess: () => refetchQuestions(),
  });

  // ── Handlers ───────────────────────────────────────────────────────────────

  const handleClose = () => {
    setStep(1);
    setModelId(null);
    setName("");
    setSlug("");
    setSlugManual(false);
    setDescription("");
    setModelClass("organizational");
    setVisibility("public");
    setEstimatedTime("15-20 minutes");
    setVersion("1.0.0");
    setNewDimLabel("");
    setNewDimDesc("");
    setNewQText("");
    setNewQType("multiple_choice");
    setNewQDimId("");
    setMaturityLevels([]);
    setScoringMethod("average");
    onOpenChange(false);
  };

  const handleNameChange = (value: string) => {
    setName(value);
    if (!slugManual) setSlug(slugify(value));
  };

  const handleStep1Submit = () => {
    if (!name.trim()) {
      toast({ title: "Model name is required.", variant: "destructive" });
      return;
    }
    if (!slug.trim()) {
      toast({ title: "Slug is required.", variant: "destructive" });
      return;
    }
    createModel.mutate({
      name: name.trim(),
      slug: slug.trim(),
      description: description.trim(),
      modelClass,
      visibility,
      estimatedTime: estimatedTime.trim(),
      version: version.trim(),
      status: "draft",
    });
  };

  const handleSaveMaturityScale = () => {
    if (!modelId) return;
    updateModel.mutate({
      maturityScale: maturityLevels,
      scoringMethod,
    });
    setStep(5);
  };

  const handleSaveAsDraft = () => {
    toast({ title: "Saved as draft", description: `"${name}" is saved. You can continue editing it anytime.` });
    // Find and return the model
    queryClient.invalidateQueries({ queryKey: ["/api/admin/models"] });
    handleClose();
  };

  // ── Step renders ───────────────────────────────────────────────────────────

  const renderStep1 = () => (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Start with the basics. You can always update these later.
      </p>

      <div>
        <Label htmlFor="wiz-name">Model Name <span className="text-destructive">*</span></Label>
        <Input
          id="wiz-name"
          value={name}
          onChange={(e) => handleNameChange(e.target.value)}
          placeholder="e.g., AI Maturity Assessment"
          className="mt-1"
          data-testid="wiz-input-name"
        />
      </div>

      <div>
        <Label htmlFor="wiz-slug">URL Slug <span className="text-destructive">*</span></Label>
        <Input
          id="wiz-slug"
          value={slug}
          onChange={(e) => {
            setSlug(e.target.value);
            setSlugManual(true);
          }}
          placeholder="ai-maturity-assessment"
          className="mt-1 font-mono"
          data-testid="wiz-input-slug"
        />
        <p className="text-xs text-muted-foreground mt-1">
          Used in the URL: /{slug || "your-slug"}
        </p>
      </div>

      <div>
        <Label htmlFor="wiz-desc">Description</Label>
        <Textarea
          id="wiz-desc"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="What does this assessment measure?"
          rows={3}
          className="mt-1"
          data-testid="wiz-input-description"
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label>Model Class</Label>
          <Select value={modelClass} onValueChange={(v) => setModelClass(v as any)}>
            <SelectTrigger className="mt-1">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="organizational">Organizational</SelectItem>
              <SelectItem value="individual">Individual</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Visibility</Label>
          <Select value={visibility} onValueChange={(v) => setVisibility(v as any)}>
            <SelectTrigger className="mt-1">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="public">Public</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label>Estimated Time</Label>
          <Input
            value={estimatedTime}
            onChange={(e) => setEstimatedTime(e.target.value)}
            placeholder="15-20 minutes"
            className="mt-1"
          />
        </div>
        <div>
          <Label>Version</Label>
          <Input
            value={version}
            onChange={(e) => setVersion(e.target.value)}
            placeholder="1.0.0"
            className="mt-1"
          />
        </div>
      </div>
    </div>
  );

  const renderStep2 = () => (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Dimensions group related questions together (e.g., "Strategy", "Technology",
        "People"). They're optional — you can skip this step and add questions without
        dimensions, or add dimensions later.
      </p>

      {/* Add dimension form */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Add a Dimension</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Input
            value={newDimLabel}
            onChange={(e) => setNewDimLabel(e.target.value)}
            placeholder="Dimension name, e.g., Strategy"
            data-testid="wiz-input-dim-label"
          />
          <Input
            value={newDimDesc}
            onChange={(e) => setNewDimDesc(e.target.value)}
            placeholder="Optional description"
            data-testid="wiz-input-dim-desc"
          />
          <Button
            onClick={() => {
              if (!newDimLabel.trim()) return;
              createDimension.mutate({
                modelId,
                label: newDimLabel.trim(),
                key: slugify(newDimLabel),
                description: newDimDesc.trim(),
                order: dimensions.length + 1,
              });
            }}
            disabled={!newDimLabel.trim() || createDimension.isPending}
            size="sm"
            data-testid="wiz-button-add-dimension"
          >
            <Plus className="h-3.5 w-3.5 mr-1.5" />
            Add Dimension
          </Button>
        </CardContent>
      </Card>

      {/* Existing dimensions */}
      {dimensions.length > 0 && (
        <div className="space-y-2">
          {dimensions.map((dim, i) => (
            <div
              key={dim.id}
              className="flex items-center justify-between p-3 border rounded-md"
            >
              <div>
                <div className="font-medium text-sm">{dim.label}</div>
                {dim.description && (
                  <div className="text-xs text-muted-foreground">{dim.description}</div>
                )}
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-muted-foreground hover:text-destructive"
                onClick={() => deleteDimension.mutate(dim.id)}
              >
                <Trash className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
        </div>
      )}

      {dimensions.length === 0 && (
        <div className="text-center text-sm text-muted-foreground py-4 border rounded-md border-dashed">
          No dimensions yet — add some above, or click "Next" to skip.
        </div>
      )}
    </div>
  );

  const renderStep3 = () => (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Add questions and their answer options. Click any question to expand and edit
        answers, improvement statements, and resource links inline.
      </p>

      {/* Quick add question */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Add a Question</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Textarea
            value={newQText}
            onChange={(e) => setNewQText(e.target.value)}
            placeholder="e.g., How does your organization currently approach AI strategy?"
            rows={2}
            data-testid="wiz-input-question-text"
          />
          <div className="grid grid-cols-2 gap-3">
            <Select value={newQType} onValueChange={(v) => setNewQType(v as any)}>
              <SelectTrigger>
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
            {dimensions.length > 0 && (
              <Select value={newQDimId || "none"} onValueChange={(v) => setNewQDimId(v === "none" ? "" : v)}>
                <SelectTrigger>
                  <SelectValue placeholder="No dimension" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No dimension</SelectItem>
                  {dimensions.map((d) => (
                    <SelectItem key={d.id} value={d.id}>{d.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
          <Button
            size="sm"
            onClick={() => {
              if (!newQText.trim()) return;
              createQuestion.mutate({
                modelId,
                text: newQText.trim(),
                type: newQType,
                dimensionId: newQDimId || undefined,
                order: questions.length + 1,
              });
            }}
            disabled={!newQText.trim() || createQuestion.isPending}
            data-testid="wiz-button-add-question"
          >
            <Plus className="h-3.5 w-3.5 mr-1.5" />
            Add Question
          </Button>
        </CardContent>
      </Card>

      {/* Existing questions */}
      {questions.length > 0 ? (
        <div className="space-y-2">
          {questions
            .sort((a, b) => a.order - b.order)
            .map((q, i) => (
              <UnifiedQuestionEditor
                key={q.id}
                question={q}
                dimensions={dimensions}
                onUpdateQuestion={(id, updates) => updateQuestion.mutate({ id, ...updates })}
                onDeleteQuestion={(id) => deleteQuestion.mutate(id)}
                questionIndex={i}
              />
            ))}
        </div>
      ) : (
        <div className="text-center text-sm text-muted-foreground py-6 border rounded-md border-dashed">
          No questions yet — add the first one above.
        </div>
      )}
    </div>
  );

  const renderStep4 = () => (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Define the maturity levels that correspond to score ranges. Users will see
        their level label and description in their results.
      </p>

      <div className="flex items-center gap-3 p-3 border rounded-md">
        <div className="flex-1">
          <div className="font-medium text-sm">Scoring Method</div>
          <div className="text-xs text-muted-foreground">
            Average: overall score = mean of all question scores.
            Sum: overall score = sum of raw answer scores (up to 500 points per question).
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className={`text-xs ${scoringMethod === "average" ? "font-semibold" : "text-muted-foreground"}`}>Average</span>
          <Switch
            checked={scoringMethod === "sum"}
            onCheckedChange={(v) => setScoringMethod(v ? "sum" : "average")}
          />
          <span className={`text-xs ${scoringMethod === "sum" ? "font-semibold" : "text-muted-foreground"}`}>Sum</span>
        </div>
      </div>

      <Button
        variant="outline"
        size="sm"
        onClick={() => {
          const newLevel = {
            id: crypto.randomUUID(),
            name: `Level ${maturityLevels.length + 1}`,
            description: "",
            minScore: 0,
            maxScore: 100,
          };
          setMaturityLevels([...maturityLevels, newLevel]);
        }}
        data-testid="wiz-button-add-level"
      >
        <Plus className="h-3.5 w-3.5 mr-1.5" />
        Add Maturity Level
      </Button>

      {maturityLevels.length > 0 ? (
        <div className="space-y-3">
          {maturityLevels.map((level, i) => (
            <Card key={level.id} className="p-4">
              <div className="flex gap-3">
                <div className="flex-1 space-y-3">
                  <div className="grid grid-cols-3 gap-3">
                    <div className="col-span-1">
                      <Label className="text-xs">Level Name</Label>
                      <Input
                        value={level.name}
                        onChange={(e) =>
                          setMaturityLevels((prev) =>
                            prev.map((l) => (l.id === level.id ? { ...l, name: e.target.value } : l))
                          )
                        }
                        className="mt-1 h-8 text-sm"
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Min Score</Label>
                      <Input
                        type="number"
                        value={level.minScore}
                        onChange={(e) =>
                          setMaturityLevels((prev) =>
                            prev.map((l) =>
                              l.id === level.id ? { ...l, minScore: Number(e.target.value) } : l
                            )
                          )
                        }
                        className="mt-1 h-8 text-sm"
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Max Score</Label>
                      <Input
                        type="number"
                        value={level.maxScore}
                        onChange={(e) =>
                          setMaturityLevels((prev) =>
                            prev.map((l) =>
                              l.id === level.id ? { ...l, maxScore: Number(e.target.value) } : l
                            )
                          )
                        }
                        className="mt-1 h-8 text-sm"
                      />
                    </div>
                  </div>
                  <div>
                    <Label className="text-xs">Description</Label>
                    <Textarea
                      value={level.description}
                      onChange={(e) =>
                        setMaturityLevels((prev) =>
                          prev.map((l) =>
                            l.id === level.id ? { ...l, description: e.target.value } : l
                          )
                        )
                      }
                      placeholder="Describe what this maturity level looks like…"
                      rows={2}
                      className="mt-1 text-sm"
                    />
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 self-start text-muted-foreground hover:text-destructive flex-shrink-0"
                  onClick={() =>
                    setMaturityLevels((prev) => prev.filter((l) => l.id !== level.id))
                  }
                >
                  <Trash className="h-3.5 w-3.5" />
                </Button>
              </div>
            </Card>
          ))}
        </div>
      ) : (
        <div className="text-center text-sm text-muted-foreground py-6 border rounded-md border-dashed">
          No maturity levels defined yet. Add levels above, or skip to save as draft.
        </div>
      )}
    </div>
  );

  const renderStep5 = () => (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Review your model before publishing. You can always edit it later from the Admin Console.
      </p>

      <div className="grid grid-cols-2 gap-3">
        <Card className="p-4 text-center">
          <div className="text-2xl font-bold">{dimensions.length}</div>
          <div className="text-sm text-muted-foreground">Dimensions</div>
        </Card>
        <Card className="p-4 text-center">
          <div className="text-2xl font-bold">{questions.length}</div>
          <div className="text-sm text-muted-foreground">Questions</div>
        </Card>
        <Card className="p-4 text-center">
          <div className="text-2xl font-bold">{maturityLevels.length}</div>
          <div className="text-sm text-muted-foreground">Maturity Levels</div>
        </Card>
        <Card className="p-4 text-center">
          <div className="text-sm font-semibold capitalize">{visibility}</div>
          <div className="text-sm text-muted-foreground">Visibility</div>
        </Card>
      </div>

      <Card className="p-4 space-y-1">
        <div className="font-semibold">{name}</div>
        {description && <div className="text-sm text-muted-foreground">{description}</div>}
        <div className="flex gap-2 mt-2">
          <Badge variant="outline">{modelClass}</Badge>
          <Badge variant="secondary">{estimatedTime}</Badge>
        </div>
      </Card>

      <div className="flex gap-3 pt-2">
        <Button
          variant="outline"
          className="flex-1"
          onClick={handleSaveAsDraft}
        >
          Save as Draft
        </Button>
        <Button
          className="flex-1"
          onClick={() => publishModel.mutate()}
          disabled={publishModel.isPending}
          data-testid="wiz-button-publish"
        >
          <Rocket className="h-4 w-4 mr-2" />
          {publishModel.isPending ? "Publishing…" : "Publish Now"}
        </Button>
      </div>
    </div>
  );

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleClose(); }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create New Model</DialogTitle>
          <DialogDescription>
            Step {step} of {STEPS.length} — {STEPS[step - 1].label}
          </DialogDescription>
        </DialogHeader>

        <StepIndicator currentStep={step} />

        {step === 1 && renderStep1()}
        {step === 2 && renderStep2()}
        {step === 3 && renderStep3()}
        {step === 4 && renderStep4()}
        {step === 5 && renderStep5()}

        {/* Navigation */}
        {step < 5 && (
          <div className="flex justify-between pt-4 border-t mt-4">
            <Button
              variant="outline"
              onClick={() => {
                if (step === 1) handleClose();
                else setStep((s) => s - 1);
              }}
            >
              <ChevronLeft className="h-4 w-4 mr-1.5" />
              {step === 1 ? "Cancel" : "Back"}
            </Button>
            <Button
              onClick={() => {
                if (step === 1) handleStep1Submit();
                else if (step === 4) handleSaveMaturityScale();
                else setStep((s) => s + 1);
              }}
              disabled={step === 1 && createModel.isPending}
              data-testid={`wiz-button-next-${step}`}
            >
              {step === 1 && createModel.isPending
                ? "Creating…"
                : step === 4
                ? "Save & Review"
                : step === STEPS.length - 1
                ? "Review"
                : "Next"}
              {step !== 4 && <ChevronRight className="h-4 w-4 ml-1.5" />}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
