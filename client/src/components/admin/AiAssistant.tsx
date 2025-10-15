import { useState } from 'react';
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Sparkles, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface AiAssistantProps {
  type: 'interpretation' | 'resources' | 'improvement' | 'answer-rewrite';
  onGenerated: (content: any) => void;
  context?: {
    modelId?: string;
    modelName?: string;
    modelContext?: string;
    dimensionId?: string;
    dimensionLabel?: string;
    questionText?: string;
    answerText?: string;
    answerScore?: number;
    maturityLevel?: number;
    score?: number;
  };
  trigger?: React.ReactNode;
}

export function AiAssistant({ type, onGenerated, context = {}, trigger }: AiAssistantProps) {
  const { toast } = useToast();
  const [isOpen, setIsOpen] = useState(false);
  const [formData, setFormData] = useState({
    maturityLevel: context.maturityLevel ?? 3,
    score: context.score ?? 300,
    scoreLevel: 'medium',
    improvementFocus: '',
  });

  const generateInterpretation = useMutation({
    mutationFn: (data: any) => apiRequest('/api/admin/ai/generate-interpretations', 'POST', data),
    onSuccess: (data) => {
      onGenerated(data);
      setIsOpen(false);
      toast({
        title: "Interpretation Generated",
        description: "AI-generated maturity level interpretation has been created.",
      });
    },
    onError: () => {
      toast({
        title: "Generation Failed",
        description: "Failed to generate interpretation. Please try again.",
        variant: "destructive",
      });
    },
  });

  const generateResources = useMutation({
    mutationFn: (data: any) => apiRequest('/api/admin/ai/generate-resources', 'POST', data),
    onSuccess: (data) => {
      onGenerated(data);
      setIsOpen(false);
      toast({
        title: "Resources Generated",
        description: "AI-generated resource suggestions have been created.",
      });
    },
    onError: () => {
      toast({
        title: "Generation Failed",
        description: "Failed to generate resources. Please try again.",
        variant: "destructive",
      });
    },
  });

  const generateImprovement = useMutation({
    mutationFn: (data: any) => apiRequest('/api/admin/ai/generate-improvement', 'POST', data),
    onSuccess: (data) => {
      onGenerated(data);
      setIsOpen(false);
      toast({
        title: "Improvement Statement Generated",
        description: "AI-generated improvement statement has been created.",
      });
    },
    onError: () => {
      toast({
        title: "Generation Failed",
        description: "Failed to generate improvement statement. Please try again.",
        variant: "destructive",
      });
    },
  });

  const rewriteAnswer = useMutation({
    mutationFn: (data: any) => apiRequest('/api/admin/ai/rewrite-answer', 'POST', data),
    onSuccess: (data) => {
      onGenerated(data);
      setIsOpen(false);
      toast({
        title: "Answer Rewritten",
        description: "Answer has been rewritten to be more contextual and specific.",
      });
    },
    onError: () => {
      toast({
        title: "Rewrite Failed",
        description: "Failed to rewrite answer. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleGenerate = () => {
    if (type === 'interpretation') {
      generateInterpretation.mutate({
        modelId: context.modelId,
        maturityLevel: formData.maturityLevel,
        score: formData.score,
      });
    } else if (type === 'resources') {
      generateResources.mutate({
        modelId: context.modelId,
        dimensionId: context.dimensionId,
        scoreLevel: formData.scoreLevel,
      });
    } else if (type === 'improvement') {
      generateImprovement.mutate({
        questionText: context.questionText,
        answerText: context.answerText,
        answerScore: context.answerScore,
      });
    } else if (type === 'answer-rewrite') {
      rewriteAnswer.mutate({
        questionText: context.questionText,
        answerText: context.answerText,
        answerScore: context.answerScore,
        modelContext: context.modelContext,
      });
    }
  };

  const isGenerating = generateInterpretation.isPending || generateResources.isPending || generateImprovement.isPending || rewriteAnswer.isPending;

  return (
    <>
      {trigger ? (
        <div onClick={() => setIsOpen(true)}>{trigger}</div>
      ) : (
        <Button
          variant="outline"
          size="sm"
          onClick={() => setIsOpen(true)}
          data-testid={`button-ai-generate-${type}`}
        >
          <Sparkles className="mr-2 h-4 w-4" />
          Generate with AI
        </Button>
      )}

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="sm:max-w-[525px]">
          <DialogHeader>
            <DialogTitle>
              <div className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-primary" />
                {type === 'interpretation' && 'Generate Maturity Level Interpretation'}
                {type === 'resources' && 'Generate Resource Suggestions'}
                {type === 'improvement' && 'Generate Improvement Statement'}
                {type === 'answer-rewrite' && 'Rewrite Answer for Context'}
              </div>
            </DialogTitle>
            <DialogDescription>
              Use AI to generate high-quality content for your assessment model.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            {type === 'interpretation' && (
              <>
                <Alert>
                  <AlertDescription>
                    Generate interpretation text for maturity level {formData.maturityLevel} with score {formData.score}/500 in the {context.modelName} model.
                  </AlertDescription>
                </Alert>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="maturity-level">Maturity Level</Label>
                    <Input
                      id="maturity-level"
                      type="number"
                      min="1"
                      max="5"
                      value={formData.maturityLevel}
                      onChange={(e) => setFormData({ ...formData, maturityLevel: parseInt(e.target.value) })}
                      data-testid="input-maturity-level"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="score">Score (0-500)</Label>
                    <Input
                      id="score"
                      type="number"
                      min="0"
                      max="500"
                      value={formData.score}
                      onChange={(e) => setFormData({ ...formData, score: parseInt(e.target.value) })}
                      data-testid="input-score"
                    />
                  </div>
                </div>
              </>
            )}

            {type === 'resources' && (
              <>
                <Alert>
                  <AlertDescription>
                    Generate improvement resources for the "{context.dimensionLabel}" dimension in the {context.modelName} model.
                  </AlertDescription>
                </Alert>
                <div className="space-y-2">
                  <Label htmlFor="score-level">Performance Level</Label>
                  <Select value={formData.scoreLevel} onValueChange={(value) => setFormData({ ...formData, scoreLevel: value })}>
                    <SelectTrigger id="score-level" data-testid="select-score-level">
                      <SelectValue placeholder="Select performance level" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="low">Low (Needs Improvement)</SelectItem>
                      <SelectItem value="medium">Medium (Developing)</SelectItem>
                      <SelectItem value="high">High (Advanced)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="improvement-focus">Specific Focus Area (Optional)</Label>
                  <Textarea
                    id="improvement-focus"
                    placeholder="e.g., 'Focus on automation tools' or 'Emphasize team collaboration'"
                    value={formData.improvementFocus}
                    onChange={(e) => setFormData({ ...formData, improvementFocus: e.target.value })}
                    data-testid="textarea-improvement-focus"
                    className="min-h-[80px]"
                  />
                </div>
              </>
            )}

            {type === 'improvement' && (
              <Alert>
                <AlertDescription>
                  <div className="space-y-2">
                    <p><strong>Question:</strong> {context.questionText}</p>
                    <p><strong>Answer:</strong> {context.answerText}</p>
                    <p><strong>Score:</strong> {context.answerScore}/100</p>
                  </div>
                </AlertDescription>
              </Alert>
            )}

            {type === 'answer-rewrite' && (
              <Alert>
                <AlertDescription>
                  <div className="space-y-2">
                    <p><strong>Question:</strong> {context.questionText}</p>
                    <p><strong>Current Answer:</strong> {context.answerText}</p>
                    <p><strong>Score Level:</strong> {context.answerScore}/100</p>
                    <div className="mt-3 pt-3 border-t">
                      <p className="text-sm text-muted-foreground">
                        The AI will rewrite this answer to be more specific and contextual to the question, 
                        while maintaining the same maturity level. This helps eliminate generic answers 
                        and makes each option more relevant to what's being assessed.
                      </p>
                    </div>
                  </div>
                </AlertDescription>
              </Alert>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsOpen(false)} disabled={isGenerating}>
              Cancel
            </Button>
            <Button onClick={handleGenerate} disabled={isGenerating} data-testid="button-generate">
              {isGenerating ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <Sparkles className="mr-2 h-4 w-4" />
                  Generate
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}