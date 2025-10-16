import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import {
  FileText,
  Plus,
  Edit2,
  Save,
  X,
  ChevronDown,
  ChevronRight,
  Sparkles,
  Download,
  Upload,
  Trash2,
  BookOpen,
  Target,
  Lightbulb,
} from "lucide-react";
import type {
  Model,
  Dimension,
  Question,
  Answer,
} from "@shared/schema";

interface ContentData {
  model: Model;
  dimensions: Dimension[];
  questions: Question[];
  answers: Answer[];
  maturityLevels: any[]; // We'll handle this once we have the endpoint
}

interface EditableResource {
  title: string;
  description: string;
  link: string;
  improvementStatement?: string;
}

export function ContentManagement() {
  const { toast } = useToast();
  const [selectedModelId, setSelectedModelId] = useState<string>("");
  const [editingItems, setEditingItems] = useState<Record<string, any>>({});
  const [showAddResourceDialog, setShowAddResourceDialog] = useState(false);
  const [newResource, setNewResource] = useState<EditableResource>({
    title: "",
    description: "",
    link: "",
    improvementStatement: "",
  });
  const [resourceTarget, setResourceTarget] = useState<{
    type: "answer";
    id: string;
  } | null>(null);

  // Fetch all models
  const { data: models = [], isLoading: loadingModels } = useQuery<Model[]>({
    queryKey: ["/api/models"],
  });

  // Fetch content data for selected model
  const { data: contentData, isLoading: loadingContent } = useQuery<ContentData>({
    queryKey: [`/api/admin/models/${selectedModelId}/content`],
    enabled: !!selectedModelId,
  });

  // Group questions by dimension
  const questionsByDimension = useMemo(() => {
    if (!contentData) return {};
    
    const grouped: Record<string, Question[]> = {};
    contentData.dimensions.forEach(dimension => {
      grouped[dimension.id] = contentData.questions
        .filter(q => q.dimensionId === dimension.id)
        .sort((a, b) => a.order - b.order);
    });
    return grouped;
  }, [contentData]);

  // Update answer resource
  const updateAnswerResourceMutation = useMutation({
    mutationFn: async ({ answerId, resource }: {
      answerId: string;
      resource: EditableResource;
    }) => {
      return apiRequest(
        `/api/admin/answers/${answerId}/resource`,
        "PATCH",
        resource
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/admin/models/${selectedModelId}/content`] });
      toast({
        title: "Resource Updated",
        description: "The answer resource has been saved.",
      });
      setEditingItems({});
    },
    onError: () => {
      toast({
        title: "Update Failed",
        description: "Failed to update resource. Please try again.",
        variant: "destructive",
      });
    },
  });

  // Add new resource (answers only - dimensions don't have resources in schema)
  const addResourceMutation = useMutation({
    mutationFn: async () => {
      if (!resourceTarget) return;
      
      const endpoint = `/api/admin/answers/${resourceTarget.id}/resource`;
      
      return apiRequest(endpoint, "POST", newResource);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/admin/models/${selectedModelId}/content`] });
      toast({
        title: "Resource Added",
        description: "The new resource has been created.",
      });
      setShowAddResourceDialog(false);
      setNewResource({
        title: "",
        description: "",
        link: "",
        improvementStatement: "",
      });
      setResourceTarget(null);
    },
    onError: () => {
      toast({
        title: "Add Failed",
        description: "Failed to add resource. Please try again.",
        variant: "destructive",
      });
    },
  });

  // Delete resource (answers only)
  const deleteResourceMutation = useMutation({
    mutationFn: async ({ id }: { id: string }) => {
      const endpoint = `/api/admin/answers/${id}/resource`;
      
      return apiRequest(endpoint, "DELETE");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/admin/models/${selectedModelId}/content`] });
      toast({
        title: "Resource Deleted",
        description: "The resource has been removed.",
      });
    },
    onError: () => {
      toast({
        title: "Delete Failed",
        description: "Failed to delete resource. Please try again.",
        variant: "destructive",
      });
    },
  });

  // Export content as CSV
  const exportContent = () => {
    if (!contentData) return;
    
    // Implementation would format content as CSV and trigger download
    toast({
      title: "Export Started",
      description: "Your content export is being prepared.",
    });
  };

  // Import content from CSV
  const handleImportContent = () => {
    // Implementation would show file upload dialog
    toast({
      title: "Import Feature",
      description: "CSV import feature coming soon.",
    });
  };

  const startEditing = (itemId: string, value: any) => {
    setEditingItems({ ...editingItems, [itemId]: value });
  };

  const cancelEditing = (itemId: string) => {
    const newItems = { ...editingItems };
    delete newItems[itemId];
    setEditingItems(newItems);
  };

  const saveEdit = (id: string) => {
    const value = editingItems[id];
    if (!value) return;
    
    updateAnswerResourceMutation.mutate({
      answerId: id,
      resource: value,
    });
  };

  if (loadingModels) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="text-center text-muted-foreground">Loading models...</div>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Content Management</CardTitle>
              <CardDescription>
                Manage answer resources and improvements in one place
              </CardDescription>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={exportContent}
                disabled={!selectedModelId || loadingContent}
                data-testid="button-export-content"
              >
                <Download className="h-4 w-4 mr-1" />
                Export CSV
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleImportContent}
                disabled={!selectedModelId}
                data-testid="button-import-content"
              >
                <Upload className="h-4 w-4 mr-1" />
                Import CSV
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Model selector */}
          <div className="flex gap-2">
            <Select value={selectedModelId} onValueChange={setSelectedModelId}>
              <SelectTrigger className="w-full" data-testid="select-model">
                <SelectValue placeholder="Select a model to manage content" />
              </SelectTrigger>
              <SelectContent>
                {models.map((model) => (
                  <SelectItem key={model.id} value={model.id}>
                    {model.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Content management area */}
          {selectedModelId && contentData && (
            <div className="space-y-4">
              {/* Maturity Levels */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Target className="h-5 w-5" />
                    Maturity Levels
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {contentData.maturityLevels.map((level) => (
                      <div key={level.id} className="flex items-center justify-between p-2 rounded-md bg-muted">
                        <div className="flex items-center gap-2">
                          <Badge variant="outline">{level.scoreMin}-{level.scoreMax}</Badge>
                          <span className="font-medium">{level.name}</span>
                        </div>
                        <div className="text-sm text-muted-foreground">
                          {level.interpretation || "No interpretation"}
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {/* Dimensions with questions and answers */}
              <Accordion type="single" collapsible className="space-y-2">
                {contentData.dimensions.map((dimension) => (
                  <AccordionItem key={dimension.id} value={dimension.id} className="border rounded-md">
                    <AccordionTrigger className="px-4 hover:no-underline" data-testid={`accordion-dimension-${dimension.id}`}>
                      <div className="flex items-center justify-between w-full mr-2">
                        <div className="flex items-center gap-2">
                          <BookOpen className="h-4 w-4" />
                          <span className="font-medium">{dimension.label}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant="secondary">
                            {questionsByDimension[dimension.id]?.length || 0} questions
                          </Badge>
                        </div>
                      </div>
                    </AccordionTrigger>
                    <AccordionContent className="px-4 pb-4">
                      <div className="space-y-4">
                        {/* Dimension info */}
                        <Card>
                          <CardHeader className="pb-3">
                            <h4 className="text-sm font-medium">Dimension Details</h4>
                          </CardHeader>
                          <CardContent>
                            <p className="text-sm text-muted-foreground">
                              {dimension.description || "No description available"}
                            </p>
                          </CardContent>
                        </Card>

                        {/* Questions and answers */}
                        <div className="space-y-3">
                          {questionsByDimension[dimension.id]?.map((question) => (
                            <Card key={question.id}>
                              <CardHeader className="pb-3">
                                <div className="flex items-center gap-2">
                                  <Badge variant="outline" className="text-xs">Q{question.order}</Badge>
                                  <h5 className="text-sm font-medium flex-1">{question.text}</h5>
                                  <Badge variant="secondary" className="text-xs">
                                    {question.type.replace('_', ' ')}
                                  </Badge>
                                </div>
                              </CardHeader>
                              <CardContent>
                                {(question.type === "multiple_choice" || question.type === "multi_select") && (
                                  <div className="space-y-2">
                                    {contentData.answers
                                      .filter(a => a.questionId === question.id)
                                      .sort((a, b) => a.score - b.score)
                                      .map((answer) => (
                                        <div key={answer.id} className="border-l-2 border-muted pl-3 py-1">
                                          <div className="flex items-start justify-between">
                                            <div className="flex-1">
                                              <div className="flex items-center gap-2">
                                                <Badge variant="outline" className="text-xs">
                                                  {answer.score}%
                                                </Badge>
                                                <span className="text-sm">{answer.text}</span>
                                              </div>
                                              {answer.resourceTitle && (
                                                <div className="mt-1 p-2 bg-muted rounded-md">
                                                  <div className="text-xs font-medium">{answer.resourceTitle}</div>
                                                  <div className="text-xs text-muted-foreground">
                                                    {answer.resourceDescription}
                                                  </div>
                                                  {answer.improvementStatement && (
                                                    <div className="text-xs mt-1 text-orange-600 dark:text-orange-400">
                                                      <Lightbulb className="h-3 w-3 inline mr-1" />
                                                      {answer.improvementStatement}
                                                    </div>
                                                  )}
                                                </div>
                                              )}
                                            </div>
                                            <Button
                                              size="sm"
                                              variant="ghost"
                                              onClick={() => {
                                                setResourceTarget({ type: "answer", id: answer.id });
                                                setNewResource({
                                                  title: answer.resourceTitle || "",
                                                  description: answer.resourceDescription || "",
                                                  link: answer.resourceLink || "",
                                                  improvementStatement: answer.improvementStatement || "",
                                                });
                                                setShowAddResourceDialog(true);
                                              }}
                                              data-testid={`button-edit-answer-resource-${answer.id}`}
                                            >
                                              <Edit2 className="h-3 w-3" />
                                            </Button>
                                          </div>
                                        </div>
                                      ))}
                                  </div>
                                )}
                              </CardContent>
                            </Card>
                          ))}
                        </div>
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Add/Edit Resource Dialog */}
      <Dialog open={showAddResourceDialog} onOpenChange={setShowAddResourceDialog}>
        <DialogContent data-testid="dialog-resource">
          <DialogHeader>
            <DialogTitle>
              Edit Answer Resource
            </DialogTitle>
            <DialogDescription>
              Provide resource details to help users improve in this area.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Title</label>
              <Input
                placeholder="Resource title"
                value={newResource.title}
                onChange={(e) => setNewResource({ ...newResource, title: e.target.value })}
                data-testid="input-resource-title"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Description</label>
              <Textarea
                placeholder="Brief description of the resource"
                value={newResource.description}
                onChange={(e) => setNewResource({ ...newResource, description: e.target.value })}
                rows={3}
                data-testid="textarea-resource-description"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Link</label>
              <Input
                placeholder="https://example.com/resource"
                value={newResource.link}
                onChange={(e) => setNewResource({ ...newResource, link: e.target.value })}
                data-testid="input-resource-link"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Improvement Statement</label>
              <Textarea
                placeholder="What needs to be improved based on this answer"
                value={newResource.improvementStatement}
                onChange={(e) => setNewResource({ ...newResource, improvementStatement: e.target.value })}
                rows={2}
                data-testid="textarea-improvement-statement"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddResourceDialog(false)}>
              Cancel
            </Button>
            <Button onClick={() => addResourceMutation.mutate()} disabled={addResourceMutation.isPending}>
              Save Resource
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}