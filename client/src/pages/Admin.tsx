import { useState } from "react";
import { Footer } from "@/components/Footer";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Download, Plus, Edit, Trash, FileSpreadsheet, Eye, BarChart3, Settings, FileDown, FileUp, ListOrdered } from "lucide-react";
import type { Model, Result, Assessment, Dimension, Question, Answer } from "@shared/schema";

interface AdminResult extends Result {
  assessmentId: string;
  userName?: string;
  company?: string;
  modelName?: string;
  date?: string;
}

export default function Admin() {
  const { toast } = useToast();
  const [editingModel, setEditingModel] = useState<Model | null>(null);
  const [isModelDialogOpen, setIsModelDialogOpen] = useState(false);
  const [isSettingsDialogOpen, setIsSettingsDialogOpen] = useState(false);
  const [isQuestionDialogOpen, setIsQuestionDialogOpen] = useState(false);
  const [isDimensionDialogOpen, setIsDimensionDialogOpen] = useState(false);
  const [isAnswerDialogOpen, setIsAnswerDialogOpen] = useState(false);
  const [selectedModelId, setSelectedModelId] = useState<string>('');
  const [editingQuestion, setEditingQuestion] = useState<Question | null>(null);
  const [editingDimension, setEditingDimension] = useState<Dimension | null>(null);
  const [heroModelId, setHeroModelId] = useState<string>('');
  const [modelForm, setModelForm] = useState({
    name: '',
    slug: '',
    description: '',
    version: '1.0.0',
    estimatedTime: '15-20 minutes',
    status: 'draft' as 'draft' | 'published',
  });
  const [dimensionForm, setDimensionForm] = useState({
    label: '',
    key: '',
    description: '',
    order: 1,
  });
  const [questionForm, setQuestionForm] = useState({
    text: '',
    type: 'multiple_choice' as 'multiple_choice' | 'numeric' | 'true_false' | 'text',
    dimensionId: '',
    minValue: 0,
    maxValue: 100,
    unit: '',
    placeholder: '',
    improvementStatement: '',
    resourceLink: '',
  });

  // Fetch models
  const { data: models = [], isLoading: modelsLoading } = useQuery<Model[]>({
    queryKey: ['/api/models'],
  });

  // Fetch questions for selected model
  const { data: questions = [], isLoading: questionsLoading } = useQuery<Question[]>({
    queryKey: ['/api/questions', selectedModelId],
    queryFn: async () => {
      if (!selectedModelId) return [];
      return fetch(`/api/questions?modelId=${selectedModelId}`).then(r => r.json());
    },
    enabled: !!selectedModelId,
  });

  // Fetch dimensions for selected model
  const { data: dimensions = [] } = useQuery<Dimension[]>({
    queryKey: ['/api/dimensions', selectedModelId],
    queryFn: async () => {
      if (!selectedModelId) return [];
      return fetch(`/api/dimensions/${selectedModelId}`).then(r => r.json());
    },
    enabled: !!selectedModelId,
  });

  // Fetch answers for selected question
  const { data: answers = [], refetch: refetchAnswers } = useQuery<Answer[]>({
    queryKey: ['/api/answers', editingQuestion?.id],
    queryFn: async () => {
      if (!editingQuestion?.id) return [];
      return fetch(`/api/answers/${editingQuestion.id}`).then(r => r.json());
    },
    enabled: !!editingQuestion?.id && isAnswerDialogOpen,
  });

  // Fetch hero model setting
  const { data: heroModelSetting } = useQuery({
    queryKey: ['/api/settings/heroModel'],
    queryFn: async () => {
      try {
        const response = await fetch('/api/settings/heroModel');
        if (response.ok) {
          const setting = await response.json();
          setHeroModelId(setting.value as string);
          return setting;
        }
        return null;
      } catch {
        return null;
      }
    },
  });

  // Fetch all assessments with results
  const { data: results = [], isLoading: resultsLoading } = useQuery<AdminResult[]>({
    queryKey: ['/api/admin/results'],
    queryFn: async () => {
      // Fetch all assessments
      const assessments = await fetch('/api/assessments').then(r => r.json());
      
      // Fetch results and models for each assessment
      const resultsWithDetails = await Promise.all(
        assessments.map(async (assessment: Assessment) => {
          try {
            const [result, model] = await Promise.all([
              fetch(`/api/results/${assessment.id}`).then(r => r.ok ? r.json() : null),
              fetch(`/api/models/by-id/${assessment.modelId}`).then(r => r.json()),
            ]);
            
            if (result) {
              return {
                ...result,
                assessmentId: assessment.id,
                modelName: model?.name || 'Unknown Model',
                userName: 'User', // Would come from auth
                company: 'Company', // Would come from profile
                date: assessment.startedAt ? new Date(assessment.startedAt).toISOString() : new Date().toISOString(),
              };
            }
          } catch {
            return null;
          }
        })
      );
      
      return resultsWithDetails.filter(Boolean);
    },
  });

  // Create model mutation (backend support needs to be added)
  const createModel = useMutation({
    mutationFn: async (data: typeof modelForm) => {
      return apiRequest('/api/models', 'POST', data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/models'] });
      setIsModelDialogOpen(false);
      resetModelForm();
      toast({
        title: "Model created",
        description: "The new model has been created successfully.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to create model",
        variant: "destructive",
      });
    },
  });

  // Update model mutation
  const updateModel = useMutation({
    mutationFn: async (data: typeof modelForm & { id: string }) => {
      return apiRequest(`/api/models/${data.id}`, 'PUT', data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/models'] });
      setIsModelDialogOpen(false);
      resetModelForm();
      toast({
        title: "Model updated",
        description: "The model has been updated successfully.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update model",
        variant: "destructive",
      });
    },
  });

  // Save hero model setting mutation
  const saveHeroModelSetting = useMutation({
    mutationFn: async (modelId: string) => {
      return apiRequest('/api/settings/heroModel', 'POST', { value: modelId });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/settings/heroModel'] });
      setIsSettingsDialogOpen(false);
      toast({
        title: "Settings saved",
        description: "Hero model has been updated successfully.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to save settings.",
        variant: "destructive",
      });
    },
  });

  // Delete model mutation
  const deleteModel = useMutation({
    mutationFn: async (modelId: string) => {
      return apiRequest(`/api/models/${modelId}`, 'DELETE');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/models'] });
      toast({
        title: "Model deleted",
        description: "The model has been removed successfully.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to delete model",
        variant: "destructive",
      });
    },
  });

  // Create question mutation
  const createQuestion = useMutation({
    mutationFn: async (data: typeof questionForm & { modelId: string }) => {
      return apiRequest('/api/questions', 'POST', data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/questions', selectedModelId] });
      setIsQuestionDialogOpen(false);
      resetQuestionForm();
      toast({
        title: "Question created",
        description: "The new question has been added successfully.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to create question.",
        variant: "destructive",
      });
    },
  });

  // Update question mutation
  const updateQuestion = useMutation({
    mutationFn: async (data: typeof questionForm & { modelId: string; id: string }) => {
      return apiRequest(`/api/questions/${data.id}`, 'PUT', data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/questions', selectedModelId] });
      setIsQuestionDialogOpen(false);
      setEditingQuestion(null);
      resetQuestionForm();
      toast({
        title: "Question updated",
        description: "The question has been updated successfully.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to update question.",
        variant: "destructive",
      });
    },
  });

  // Delete question mutation
  const deleteQuestion = useMutation({
    mutationFn: async (questionId: string) => {
      return apiRequest(`/api/questions/${questionId}`, 'DELETE');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/questions', selectedModelId] });
      toast({
        title: "Question deleted",
        description: "The question has been removed.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to delete question.",
        variant: "destructive",
      });
    },
  });

  // Dimension mutations
  const createDimension = useMutation({
    mutationFn: async (data: typeof dimensionForm & { modelId: string }) => {
      return apiRequest('/api/dimensions', 'POST', data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/dimensions', selectedModelId] });
      setIsDimensionDialogOpen(false);
      setDimensionForm({ label: '', key: '', description: '', order: 1 });
      toast({
        title: "Dimension created",
        description: "The new dimension has been added successfully.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to create dimension.",
        variant: "destructive",
      });
    },
  });

  const updateDimension = useMutation({
    mutationFn: async (data: typeof dimensionForm & { id: string }) => {
      return apiRequest(`/api/dimensions/${data.id}`, 'PUT', data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/dimensions', selectedModelId] });
      setIsDimensionDialogOpen(false);
      setEditingDimension(null);
      setDimensionForm({ label: '', key: '', description: '', order: 1 });
      toast({
        title: "Dimension updated",
        description: "The dimension has been updated successfully.",
      });
    },
    onError: () => {
      toast({
        title: "Error", 
        description: "Failed to update dimension.",
        variant: "destructive",
      });
    },
  });

  const deleteDimension = useMutation({
    mutationFn: async (dimensionId: string) => {
      return apiRequest(`/api/dimensions/${dimensionId}`, 'DELETE');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/dimensions', selectedModelId] });
      toast({
        title: "Dimension deleted",
        description: "The dimension has been removed.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to delete dimension.",
        variant: "destructive",
      });
    },
  });

  // Answer mutations
  const createAnswer = useMutation({
    mutationFn: async (data: { questionId: string; text: string; score: number; order: number }) => {
      return apiRequest('/api/answers', 'POST', data);
    },
    onSuccess: () => {
      refetchAnswers();
      toast({
        title: "Answer created",
        description: "The answer option has been added successfully.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to create answer.",
        variant: "destructive",
      });
    },
  });

  const updateAnswer = useMutation({
    mutationFn: async (data: { id: string; text?: string; score?: number; order?: number }) => {
      const { id, ...rest } = data;
      return apiRequest(`/api/answers/${id}`, 'PUT', rest);
    },
    onSuccess: () => {
      refetchAnswers();
      toast({
        title: "Answer updated",
        description: "The answer option has been updated successfully.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to update answer.",
        variant: "destructive",
      });
    },
  });

  const deleteAnswer = useMutation({
    mutationFn: async (answerId: string) => {
      return apiRequest(`/api/answers/${answerId}`, 'DELETE');
    },
    onSuccess: () => {
      refetchAnswers();
      toast({
        title: "Answer deleted",
        description: "The answer option has been removed.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to delete answer.",
        variant: "destructive",
      });
    },
  });

  const resetModelForm = () => {
    setModelForm({
      name: '',
      slug: '',
      description: '',
      version: '1.0.0',
      estimatedTime: '15-20 minutes',
      status: 'draft',
    });

    setEditingModel(null);
  };

  const resetQuestionForm = () => {
    setQuestionForm({
      text: '',
      type: 'multiple_choice',
      dimensionId: '',
      minValue: 0,
      maxValue: 100,
      unit: '',
      placeholder: '',
      improvementStatement: '',
      resourceLink: '',
    });
    setEditingQuestion(null);
  };

  const handleEditModel = (model: Model) => {
    setEditingModel(model);
    setModelForm({
      name: model.name,
      slug: model.slug,
      description: model.description || '',
      version: model.version || '1.0.0',
      estimatedTime: model.estimatedTime || '15-20 minutes',
      status: (model.status || 'draft') as 'draft' | 'published',
    });
    // Would need to fetch dimensions here

    setIsModelDialogOpen(true);
  };

  const handleSaveModel = () => {
    // Validate form
    if (!modelForm.name || !modelForm.slug) {
      toast({
        title: "Validation Error",
        description: "Name and slug are required.",
        variant: "destructive",
      });
      return;
    }

    if (editingModel) {
      updateModel.mutate({
        ...modelForm,
        id: editingModel.id,
      });
    } else {
      createModel.mutate({
        ...modelForm,
      });
    }
  };

  const exportModelToCSV = async (modelId: string) => {
    try {
      const response = await fetch(`/api/models/${modelId}/export`);
      if (!response.ok) throw new Error('Export failed');
      
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const model = models.find(m => m.id === modelId);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${model?.slug || 'model'}-export.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
      
      toast({
        title: "Export successful",
        description: `Model exported to CSV successfully.`,
      });
    } catch (error) {
      toast({
        title: "Export failed",
        description: "Failed to export model. Please try again.",
        variant: "destructive",
      });
    }
  };

  const importQuestionsFromCSV = async (file: File, modelId: string) => {
    try {
      const csvContent = await file.text();
      const response = await fetch(`/api/models/${modelId}/import-questions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ csvContent }),
      });
      
      if (!response.ok) throw new Error('Import failed');
      
      const result = await response.json();
      await queryClient.invalidateQueries({ queryKey: ['/api/questions', modelId] });
      
      toast({
        title: "Import successful",
        description: `Imported ${result.questionsImported} questions with ${result.answersImported} answer options.`,
      });
    } catch (error) {
      toast({
        title: "Import failed",
        description: "Failed to import questions. Please check the CSV format.",
        variant: "destructive",
      });
    }
  };

  const handleImportClick = (modelId: string) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.csv';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) {
        await importQuestionsFromCSV(file, modelId);
      }
    };
    input.click();
  };

  const exportResultsToCSV = () => {
    if (!results.length) {
      toast({
        title: "No data",
        description: "No results to export.",
        variant: "destructive",
      });
      return;
    }

    // Create CSV content
    const headers = ['Date', 'User Name', 'Company', 'Model', 'Score', 'Level'];
    const rows = results.map(r => [
      new Date(r.date || Date.now()).toLocaleDateString(),
      r.userName || '',
      r.company || '',
      r.modelName || '',
      r.overallScore.toString(),
      r.label,
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(',')),
    ].join('\n');

    // Download CSV
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `assessment-results-${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);

    toast({
      title: "Export successful",
      description: `Exported ${results.length} results to CSV.`,
    });
  };

  // Calculate statistics
  const totalAssessments = results.length;
  const averageScore = totalAssessments > 0 
    ? Math.round(results.reduce((acc, r) => acc + r.overallScore, 0) / totalAssessments)
    : 0;
  const publishedModels = models.filter(m => m.status !== 'draft').length;
  const completionRate = 89; // Would need to calculate from actual data

  return (
    <div className="min-h-screen flex flex-col">
      <main className="flex-1 py-12">
        <div className="container mx-auto px-4 max-w-7xl">
          <div className="flex justify-between items-center mb-8">
            <h1 className="text-4xl font-bold">Admin Console</h1>
            <Button 
              variant="outline" 
              data-testid="button-settings"
              onClick={() => setIsSettingsDialogOpen(true)}
            >
              <Settings className="mr-2 h-4 w-4" />
              Settings
            </Button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
            <Card className="p-6">
              <div className="text-3xl font-bold text-primary mb-2">{models.length}</div>
              <div className="text-sm text-muted-foreground">Active Models</div>
            </Card>
            <Card className="p-6">
              <div className="text-3xl font-bold text-secondary mb-2">{totalAssessments}</div>
              <div className="text-sm text-muted-foreground">Total Assessments</div>
            </Card>
            <Card className="p-6">
              <div className="text-3xl font-bold text-chart-3 mb-2">{averageScore}</div>
              <div className="text-sm text-muted-foreground">Average Score</div>
            </Card>
            <Card className="p-6">
              <div className="text-3xl font-bold text-chart-4 mb-2">{publishedModels}</div>
              <div className="text-sm text-muted-foreground">Published Models</div>
            </Card>
          </div>

          <Tabs defaultValue="models" className="w-full">
            <TabsList className="grid w-full grid-cols-6">
              <TabsTrigger value="models" data-testid="tab-models">Models</TabsTrigger>
              <TabsTrigger value="dimensions" data-testid="tab-dimensions">Dimensions</TabsTrigger>
              <TabsTrigger value="questions" data-testid="tab-questions">Questions</TabsTrigger>
              <TabsTrigger value="results" data-testid="tab-results">Results</TabsTrigger>
              <TabsTrigger value="benchmarks" data-testid="tab-benchmarks">Benchmarks</TabsTrigger>
              <TabsTrigger value="audit" data-testid="tab-audit">Audit Log</TabsTrigger>
            </TabsList>

            <TabsContent value="models" className="space-y-4">
              <Card className="p-6">
                <div className="flex justify-between items-center mb-6">
                  <h2 className="text-xl font-bold">Model Management</h2>
                  <div className="flex gap-2">
                    <Button 
                      variant="outline"
                      onClick={() => {
                        const link = document.createElement('a');
                        link.href = '/csv-template.csv';
                        link.download = 'maturity-model-questions-template.csv';
                        link.click();
                      }}
                      data-testid="button-download-template"
                    >
                      <Download className="mr-2 h-4 w-4" />
                      Download CSV Template
                    </Button>
                    <Button 
                      onClick={() => {
                        resetModelForm();
                        setIsModelDialogOpen(true);
                      }}
                      data-testid="button-create-model"
                    >
                      <Plus className="mr-2 h-4 w-4" />
                      Create Model
                    </Button>
                  </div>
                </div>
                
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Slug</TableHead>
                      <TableHead>Version</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {modelsLoading ? (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center">Loading models...</TableCell>
                      </TableRow>
                    ) : models.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center">No models found</TableCell>
                      </TableRow>
                    ) : (
                      models.map((model) => (
                        <TableRow key={model.id} data-testid={`model-row-${model.id}`}>
                          <TableCell className="font-medium">{model.name}</TableCell>
                          <TableCell>{model.slug}</TableCell>
                          <TableCell>{model.version || '1.0.0'}</TableCell>
                          <TableCell>
                            <Badge variant={model.status === 'published' ? 'default' : 'secondary'}>
                              {model.status || 'draft'}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-2">
                              <Button 
                                variant="ghost" 
                                size="icon"
                                onClick={() => window.open(`/${model.slug}`, '_blank')}
                                data-testid={`button-view-${model.id}`}
                              >
                                <Eye className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleImportClick(model.id)}
                                data-testid={`button-import-${model.id}`}
                                title="Import Questions CSV"
                              >
                                <FileUp className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => exportModelToCSV(model.id)}
                                data-testid={`button-export-${model.id}`}
                                title="Export Questions CSV"
                              >
                                <FileDown className="h-4 w-4" />
                              </Button>
                              <Button 
                                variant="ghost" 
                                size="icon"
                                onClick={() => handleEditModel(model)}
                                data-testid={`button-edit-${model.id}`}
                              >
                                <Edit className="h-4 w-4" />
                              </Button>
                              <Button 
                                variant="ghost" 
                                size="icon"
                                onClick={() => {
                                  if (confirm('Are you sure you want to delete this model?')) {
                                    deleteModel.mutate(model.id);
                                  }
                                }}
                                data-testid={`button-delete-${model.id}`}
                              >
                                <Trash className="h-4 w-4" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </Card>
            </TabsContent>

            <TabsContent value="dimensions" className="space-y-4">
              <Card className="p-6">
                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <h2 className="text-xl font-bold">Dimension Management</h2>
                  </div>
                  
                  <div className="flex items-center gap-4">
                    <Label htmlFor="dimension-model-select">Select Model:</Label>
                    <Select value={selectedModelId} onValueChange={setSelectedModelId}>
                      <SelectTrigger id="dimension-model-select" className="w-64" data-testid="select-model-for-dimensions">
                        <SelectValue placeholder="Choose a model" />
                      </SelectTrigger>
                      <SelectContent>
                        {models.map((model) => (
                          <SelectItem key={model.id} value={model.id}>
                            {model.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {selectedModelId && (
                      <Button
                        onClick={() => setIsDimensionDialogOpen(true)}
                        data-testid="button-add-dimension"
                      >
                        <Plus className="mr-2 h-4 w-4" />
                        Add Dimension
                      </Button>
                    )}
                  </div>

                  {selectedModelId ? (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Label</TableHead>
                          <TableHead>Key</TableHead>
                          <TableHead>Description</TableHead>
                          <TableHead>Order</TableHead>
                          <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {dimensions.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={5} className="text-center">No dimensions found</TableCell>
                          </TableRow>
                        ) : (
                          dimensions.map((dimension) => (
                            <TableRow key={dimension.id}>
                              <TableCell>{dimension.label}</TableCell>
                              <TableCell>{dimension.key}</TableCell>
                              <TableCell>{dimension.description}</TableCell>
                              <TableCell>{dimension.order}</TableCell>
                              <TableCell className="text-right">
                                <div className="flex justify-end gap-2">
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => {
                                      setEditingDimension(dimension);
                                      setDimensionForm({
                                        label: dimension.label,
                                        key: dimension.key,
                                        description: dimension.description || '',
                                        order: dimension.order
                                      });
                                      setIsDimensionDialogOpen(true);
                                    }}
                                    data-testid={`edit-dimension-${dimension.id}`}
                                  >
                                    <Edit className="h-4 w-4" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => {
                                      if (confirm('Are you sure you want to delete this dimension?')) {
                                        deleteDimension.mutate(dimension.id);
                                      }
                                    }}
                                    data-testid={`delete-dimension-${dimension.id}`}
                                  >
                                    <Trash className="h-4 w-4" />
                                  </Button>
                                </div>
                              </TableCell>
                            </TableRow>
                          ))
                        )}
                      </TableBody>
                    </Table>
                  ) : (
                    <div className="text-center text-muted-foreground py-8">
                      Select a model to manage its dimensions
                    </div>
                  )}
                </div>
              </Card>
            </TabsContent>

            <TabsContent value="questions" className="space-y-4">
              <Card className="p-6">
                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <h2 className="text-xl font-bold">Question Management</h2>
                  </div>
                  
                  <div className="flex items-center gap-4">
                    <Label htmlFor="model-select">Select Model:</Label>
                    <Select value={selectedModelId} onValueChange={setSelectedModelId}>
                      <SelectTrigger id="model-select" className="w-64" data-testid="select-model-for-questions">
                        <SelectValue placeholder="Choose a model" />
                      </SelectTrigger>
                      <SelectContent>
                        {models.map((model) => (
                          <SelectItem key={model.id} value={model.id}>
                            {model.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {selectedModelId && (
                      <Button
                        onClick={() => {
                          resetQuestionForm();
                          setIsQuestionDialogOpen(true);
                        }}
                        data-testid="button-add-question"
                      >
                        <Plus className="mr-2 h-4 w-4" />
                        Add Question
                      </Button>
                    )}
                  </div>

                  {selectedModelId ? (
                    <div className="space-y-6">
                      {questionsLoading ? (
                        <div className="text-center py-4">Loading questions...</div>
                      ) : questions.length === 0 ? (
                        <div className="text-center py-4">No questions found</div>
                      ) : (
                        // Group questions by dimension
                        dimensions.sort((a, b) => a.order - b.order).map((dimension) => {
                          const dimensionQuestions = questions
                            .filter(q => q.dimensionId === dimension.id)
                            .sort((a, b) => a.order - b.order);
                          
                          if (dimensionQuestions.length === 0) return null;
                          
                          return (
                            <div key={dimension.id} className="space-y-2">
                              <h3 className="text-lg font-semibold text-purple-600 dark:text-purple-400">
                                {dimension.label}
                              </h3>
                              {dimension.description && (
                                <p className="text-sm text-muted-foreground mb-2">{dimension.description}</p>
                              )}
                              <Table>
                                <TableHeader>
                                  <TableRow>
                                    <TableHead className="w-8">#</TableHead>
                                    <TableHead>Question</TableHead>
                                    <TableHead>Type</TableHead>
                                    <TableHead className="text-right">Actions</TableHead>
                                  </TableRow>
                                </TableHeader>
                                <TableBody>
                                  {dimensionQuestions.map((question, index) => (
                                    <TableRow key={question.id} data-testid={`question-row-${question.id}`}>
                                      <TableCell className="font-medium">{index + 1}</TableCell>
                                      <TableCell className="font-medium">{question.text}</TableCell>
                                      <TableCell>
                                        <Badge variant={
                                          question.type === 'numeric' ? 'secondary' : 
                                          question.type === 'true_false' ? 'outline' :
                                          question.type === 'text' ? 'secondary' : 
                                          'default'
                                        }>
                                          {question.type === 'numeric' ? 'Numeric' : 
                                           question.type === 'true_false' ? 'True/False' :
                                           question.type === 'text' ? 'Text Input' :
                                           'Multiple Choice'}
                                        </Badge>
                                      </TableCell>
                                      <TableCell className="text-right">
                                        <div className="flex justify-end gap-2">
                                          {question.type === 'multiple_choice' && (
                                            <Button
                                              variant="ghost"
                                              size="icon"
                                              onClick={() => {
                                                setEditingQuestion(question);
                                                setIsAnswerDialogOpen(true);
                                              }}
                                              data-testid={`manage-answers-${question.id}`}
                                              title="Manage answer options"
                                            >
                                              <ListOrdered className="h-4 w-4" />
                                            </Button>
                                          )}
                                          <Button
                                            variant="ghost"
                                            size="icon"
                                            onClick={() => {
                                              setEditingQuestion(question);
                                              setQuestionForm({
                                                modelId: question.modelId,
                                                dimensionId: question.dimensionId ?? '',
                                                text: question.text,
                                                type: question.type as 'multiple_choice' | 'numeric' | 'true_false' | 'text',
                                                order: question.order,
                                                minValue: question.minValue ?? 1,
                                                maxValue: question.maxValue ?? 10,
                                                unit: question.unit ?? '',
                                                placeholder: question.placeholder ?? '',
                                                improvementStatement: question.improvementStatement ?? '',
                                                resourceTitle: question.resourceTitle ?? '',
                                                resourceLink: question.resourceLink ?? '',
                                                resourceDescription: question.resourceDescription ?? ''
                                              });
                                              setIsQuestionDialogOpen(true);
                                            }}
                                            data-testid={`edit-question-${question.id}`}
                                          >
                                            <Edit className="h-4 w-4" />
                                          </Button>
                                          <Button
                                            variant="ghost"
                                            size="icon"
                                            onClick={() => deleteQuestion.mutate(question.id)}
                                            data-testid={`delete-question-${question.id}`}
                                          >
                                            <Trash className="h-4 w-4" />
                                          </Button>
                                        </div>
                                      </TableCell>
                                    </TableRow>
                                  ))}
                                </TableBody>
                              </Table>
                            </div>
                          );
                        })
                      )}
                      
                      {/* Questions without dimensions */}
                      {!questionsLoading && questions.length > 0 && (
                        (() => {
                          const orphanQuestions = questions
                            .filter(q => !q.dimensionId || !dimensions.find(d => d.id === q.dimensionId))
                            .sort((a, b) => a.order - b.order);
                          
                          if (orphanQuestions.length === 0) return null;
                          
                          return (
                            <div className="space-y-2">
                              <h3 className="text-lg font-semibold text-gray-600 dark:text-gray-400">
                                Uncategorized Questions
                              </h3>
                              <Table>
                                <TableHeader>
                                  <TableRow>
                                    <TableHead className="w-8">#</TableHead>
                                    <TableHead>Question</TableHead>
                                    <TableHead>Type</TableHead>
                                    <TableHead className="text-right">Actions</TableHead>
                                  </TableRow>
                                </TableHeader>
                                <TableBody>
                                  {orphanQuestions.map((question, index) => (
                                    <TableRow key={question.id} data-testid={`question-row-${question.id}`}>
                                      <TableCell className="font-medium">{index + 1}</TableCell>
                                      <TableCell className="font-medium">{question.text}</TableCell>
                                      <TableCell>
                                        <Badge variant={
                                          question.type === 'numeric' ? 'secondary' : 
                                          question.type === 'true_false' ? 'outline' :
                                          question.type === 'text' ? 'secondary' : 
                                          'default'
                                        }>
                                          {question.type === 'numeric' ? 'Numeric' : 
                                           question.type === 'true_false' ? 'True/False' :
                                           question.type === 'text' ? 'Text Input' :
                                           'Multiple Choice'}
                                        </Badge>
                                      </TableCell>
                                      <TableCell className="text-right">
                                        <div className="flex justify-end gap-2">
                                          {question.type === 'multiple_choice' && (
                                            <Button
                                              variant="ghost"
                                              size="icon"
                                              onClick={() => {
                                                setEditingQuestion(question);
                                                setIsAnswerDialogOpen(true);
                                              }}
                                              data-testid={`manage-answers-${question.id}`}
                                              title="Manage answer options"
                                            >
                                              <ListOrdered className="h-4 w-4" />
                                            </Button>
                                          )}
                                          <Button
                                            variant="ghost"
                                            size="icon"
                                            onClick={() => {
                                              setEditingQuestion(question);
                                              setQuestionForm({
                                                modelId: question.modelId,
                                                dimensionId: question.dimensionId ?? '',
                                                text: question.text,
                                                type: question.type as 'multiple_choice' | 'numeric' | 'true_false' | 'text',
                                                order: question.order,
                                                minValue: question.minValue ?? 1,
                                                maxValue: question.maxValue ?? 10,
                                                unit: question.unit ?? '',
                                                placeholder: question.placeholder ?? '',
                                                improvementStatement: question.improvementStatement ?? '',
                                                resourceTitle: question.resourceTitle ?? '',
                                                resourceLink: question.resourceLink ?? '',
                                                resourceDescription: question.resourceDescription ?? ''
                                              });
                                              setIsQuestionDialogOpen(true);
                                            }}
                                            data-testid={`edit-question-${question.id}`}
                                          >
                                            <Edit className="h-4 w-4" />
                                          </Button>
                                          <Button
                                            variant="ghost"
                                            size="icon"
                                            onClick={() => deleteQuestion.mutate(question.id)}
                                            data-testid={`delete-question-${question.id}`}
                                          >
                                            <Trash className="h-4 w-4" />
                                          </Button>
                                        </div>
                                      </TableCell>
                                    </TableRow>
                                  ))}
                                </TableBody>
                              </Table>
                            </div>
                          );
                        })()
                      )}
                    </div>
                  ) : (
                    <div className="text-center py-8 text-muted-foreground">
                      Select a model to manage its questions
                    </div>
                  )}
                </div>
              </Card>
            </TabsContent>

            <TabsContent value="results" className="space-y-4">
              <Card className="p-6">
                <div className="flex justify-between items-center mb-6">
                  <h2 className="text-xl font-bold">Assessment Results</h2>
                  <Button variant="outline" onClick={exportResultsToCSV} data-testid="button-export-results">
                    <FileSpreadsheet className="mr-2 h-4 w-4" />
                    Export CSV
                  </Button>
                </div>
                
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>User</TableHead>
                      <TableHead>Company</TableHead>
                      <TableHead>Model</TableHead>
                      <TableHead>Score</TableHead>
                      <TableHead>Level</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {resultsLoading ? (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center">Loading results...</TableCell>
                      </TableRow>
                    ) : results.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center">No results found</TableCell>
                      </TableRow>
                    ) : (
                      results.map((result) => (
                        <TableRow key={result.assessmentId} data-testid={`result-row-${result.assessmentId}`}>
                          <TableCell>{new Date(result.date || Date.now()).toLocaleDateString()}</TableCell>
                          <TableCell>{result.userName || 'Anonymous'}</TableCell>
                          <TableCell>{result.company || '-'}</TableCell>
                          <TableCell>{result.modelName}</TableCell>
                          <TableCell>{result.overallScore}</TableCell>
                          <TableCell>
                            <Badge>{result.label}</Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            <Button 
                              variant="ghost" 
                              size="sm"
                              onClick={() => window.open(`/results/${result.assessmentId}`, '_blank')}
                              data-testid={`button-view-result-${result.assessmentId}`}
                            >
                              View
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </Card>
            </TabsContent>

            <TabsContent value="benchmarks" className="space-y-4">
              <Card className="p-6">
                <div className="flex justify-between items-center mb-6">
                  <h2 className="text-xl font-bold">Benchmark Management</h2>
                  <Button data-testid="button-rebuild-benchmarks" disabled>
                    <BarChart3 className="mr-2 h-4 w-4" />
                    Rebuild Benchmarks
                  </Button>
                </div>
                <p className="text-muted-foreground">
                  Configure and manage industry benchmarks. Benchmarks are automatically updated nightly.
                </p>
                <p className="text-sm text-muted-foreground mt-4">
                  Benchmark calculation coming soon.
                </p>
              </Card>
            </TabsContent>

            <TabsContent value="audit" className="space-y-4">
              <Card className="p-6">
                <h2 className="text-xl font-bold mb-6">Audit Log</h2>
                <p className="text-muted-foreground">
                  Track all administrative actions and changes to models, results, and system configuration.
                </p>
                <p className="text-sm text-muted-foreground mt-4">
                  Audit logging coming soon.
                </p>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </main>

      {/* Model Dialog */}
      <Dialog open={isModelDialogOpen} onOpenChange={setIsModelDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingModel ? 'Edit Model' : 'Add New Model'}</DialogTitle>
            <DialogDescription>
              {editingModel ? 'Update the model details below.' : 'Create a new maturity assessment model.'}
              <br/>
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="name">Name</Label>
                <Input
                  id="name"
                  value={modelForm.name}
                  onChange={(e) => setModelForm({ ...modelForm, name: e.target.value })}
                  placeholder="e.g., AI Maturity Assessment"
                  data-testid="input-model-name"
                />
              </div>
              <div>
                <Label htmlFor="slug">Slug</Label>
                <Input
                  id="slug"
                  value={modelForm.slug}
                  onChange={(e) => setModelForm({ ...modelForm, slug: e.target.value.toLowerCase().replace(/\s+/g, '-') })}
                  placeholder="e.g., ai-maturity"
                  data-testid="input-model-slug"
                />
              </div>
            </div>

            <div>
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={modelForm.description}
                onChange={(e) => setModelForm({ ...modelForm, description: e.target.value })}
                placeholder="Describe what this assessment measures..."
                rows={3}
                data-testid="input-model-description"
              />
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div>
                <Label htmlFor="version">Version</Label>
                <Input
                  id="version"
                  value={modelForm.version}
                  onChange={(e) => setModelForm({ ...modelForm, version: e.target.value })}
                  placeholder="1.0.0"
                  data-testid="input-model-version"
                />
              </div>
              <div>
                <Label htmlFor="estimatedTime">Estimated Time</Label>
                <Input
                  id="estimatedTime"
                  value={modelForm.estimatedTime}
                  onChange={(e) => setModelForm({ ...modelForm, estimatedTime: e.target.value })}
                  placeholder="15-20 minutes"
                  data-testid="input-model-time"
                />
              </div>
              <div>
                <Label htmlFor="status">Status</Label>
                <select
                  id="status"
                  value={modelForm.status}
                  onChange={(e) => setModelForm({ ...modelForm, status: e.target.value as 'draft' | 'published' })}
                  className="w-full h-9 px-3 rounded-md border border-input bg-background"
                  data-testid="select-model-status"
                >
                  <option value="draft">Draft</option>
                  <option value="published">Published</option>
                </select>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsModelDialogOpen(false)}>
              Cancel
            </Button>
            <Button 
              onClick={handleSaveModel} 
              disabled={createModel.isPending || updateModel.isPending} 
              data-testid="button-save-model"
            >
              {createModel.isPending || updateModel.isPending ? 'Saving...' : editingModel ? 'Update Model' : 'Create Model'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Settings Dialog */}
      <Dialog open={isSettingsDialogOpen} onOpenChange={setIsSettingsDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Admin Settings</DialogTitle>
            <DialogDescription>
              Configure global application settings
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label htmlFor="heroModel">Hero Model (Landing Page)</Label>
              <p className="text-sm text-muted-foreground mb-2">
                Select which model to feature on the landing page
              </p>
              <select
                id="heroModel"
                value={heroModelId}
                onChange={(e) => setHeroModelId(e.target.value)}
                className="w-full h-9 px-3 rounded-md border border-input bg-background"
                data-testid="select-hero-model"
              >
                <option value="">Auto-detect (AI Model)</option>
                {models.filter(m => m.status !== 'draft').map((model) => (
                  <option key={model.id} value={model.id}>
                    {model.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsSettingsDialogOpen(false)}>
              Cancel
            </Button>
            <Button 
              onClick={() => saveHeroModelSetting.mutate(heroModelId)}
              disabled={saveHeroModelSetting.isPending}
              data-testid="button-save-settings"
            >
              {saveHeroModelSetting.isPending ? 'Saving...' : 'Save Settings'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Question Dialog */}
      <Dialog open={isDimensionDialogOpen} onOpenChange={setIsDimensionDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingDimension ? 'Edit Dimension' : 'Create Dimension'}</DialogTitle>
            <DialogDescription>
              Manage dimensions for the selected model
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label htmlFor="dimension-label">Label</Label>
              <Input
                id="dimension-label"
                value={dimensionForm.label}
                onChange={(e) => setDimensionForm({ ...dimensionForm, label: e.target.value })}
                placeholder="e.g., Technology"
                data-testid="input-dimension-label"
              />
            </div>

            <div>
              <Label htmlFor="dimension-key">Key</Label>
              <Input
                id="dimension-key"
                value={dimensionForm.key}
                onChange={(e) => setDimensionForm({ ...dimensionForm, key: e.target.value })}
                placeholder="e.g., technology"
                data-testid="input-dimension-key"
              />
            </div>

            <div>
              <Label htmlFor="dimension-description">Description</Label>
              <Textarea
                id="dimension-description"
                value={dimensionForm.description}
                onChange={(e) => setDimensionForm({ ...dimensionForm, description: e.target.value })}
                placeholder="Enter dimension description..."
                rows={3}
                data-testid="input-dimension-description"
              />
            </div>

            <div>
              <Label htmlFor="dimension-order">Order</Label>
              <Input
                id="dimension-order"
                type="number"
                value={dimensionForm.order}
                onChange={(e) => setDimensionForm({ ...dimensionForm, order: parseInt(e.target.value) || 1 })}
                min={1}
                data-testid="input-dimension-order"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setIsDimensionDialogOpen(false);
              setEditingDimension(null);
              setDimensionForm({ label: '', key: '', description: '', order: 1 });
            }}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (selectedModelId) {
                  if (editingDimension) {
                    updateDimension.mutate({ ...dimensionForm, id: editingDimension.id });
                  } else {
                    // Find the highest order value and add 1
                    const maxOrder = dimensions.reduce((max, d) => Math.max(max, d.order || 0), 0);
                    createDimension.mutate({ ...dimensionForm, modelId: selectedModelId, order: maxOrder + 1 });
                  }
                }
              }}
              disabled={createDimension.isPending || updateDimension.isPending}
              data-testid="button-save-dimension"
            >
              {createDimension.isPending || updateDimension.isPending ? 'Saving...' : 
               editingDimension ? 'Update Dimension' : 'Save Dimension'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isQuestionDialogOpen} onOpenChange={setIsQuestionDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editingQuestion ? 'Edit Question' : 'Create Question'}</DialogTitle>
            <DialogDescription>
              Add or edit a question for the selected model
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label htmlFor="question-text">Question Text</Label>
              <Textarea
                id="question-text"
                value={questionForm.text}
                onChange={(e) => setQuestionForm({ ...questionForm, text: e.target.value })}
                placeholder="Enter your question..."
                rows={2}
                data-testid="input-question-text"
              />
            </div>

            <div>
              <Label htmlFor="question-type">Question Type</Label>
              <Select
                value={questionForm.type}
                onValueChange={(value: 'multiple_choice' | 'numeric' | 'true_false' | 'text') => {
                  setQuestionForm({ ...questionForm, type: value });
                }}
              >
                <SelectTrigger id="question-type" data-testid="select-question-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="multiple_choice">Multiple Choice</SelectItem>
                  <SelectItem value="numeric">Numeric</SelectItem>
                  <SelectItem value="true_false">True/False</SelectItem>
                  <SelectItem value="text">Text Input</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {questionForm.type === 'numeric' && (
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <Label htmlFor="min-value">Min Value</Label>
                  <Input
                    id="min-value"
                    type="number"
                    value={questionForm.minValue}
                    onChange={(e) => setQuestionForm({ ...questionForm, minValue: Number(e.target.value) })}
                    data-testid="input-min-value"
                  />
                </div>
                <div>
                  <Label htmlFor="max-value">Max Value</Label>
                  <Input
                    id="max-value"
                    type="number"
                    value={questionForm.maxValue}
                    onChange={(e) => setQuestionForm({ ...questionForm, maxValue: Number(e.target.value) })}
                    data-testid="input-max-value"
                  />
                </div>
                <div>
                  <Label htmlFor="unit">Unit</Label>
                  <Input
                    id="unit"
                    value={questionForm.unit}
                    onChange={(e) => setQuestionForm({ ...questionForm, unit: e.target.value })}
                    placeholder="e.g., points, %"
                    data-testid="input-unit"
                  />
                </div>
              </div>
            )}

            {questionForm.type === 'text' && (
              <div>
                <Label htmlFor="placeholder">Placeholder Text (Optional)</Label>
                <Input
                  id="placeholder"
                  value={questionForm.placeholder}
                  onChange={(e) => setQuestionForm({ ...questionForm, placeholder: e.target.value })}
                  placeholder="e.g., Enter your response..."
                  data-testid="input-placeholder"
                />
              </div>
            )}

            <div>
              <Label htmlFor="dimension">Dimension (Optional)</Label>
              <Select
                value={questionForm.dimensionId || 'none'}
                onValueChange={(value) => setQuestionForm({ ...questionForm, dimensionId: value === 'none' ? '' : value })}
              >
                <SelectTrigger id="dimension" data-testid="select-dimension">
                  <SelectValue placeholder="No dimension" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No dimension</SelectItem>
                  {dimensions.map((dimension) => (
                    <SelectItem key={dimension.id} value={dimension.id}>
                      {dimension.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="improvement">How to Improve (Optional)</Label>
              <Textarea
                id="improvement"
                value={questionForm.improvementStatement}
                onChange={(e) => setQuestionForm({ ...questionForm, improvementStatement: e.target.value })}
                placeholder="Guidance on how to improve in this area..."
                rows={2}
                data-testid="input-improvement-statement"
              />
            </div>

            <div>
              <Label htmlFor="resource">Resource Link (Optional)</Label>
              <Input
                id="resource"
                type="url"
                value={questionForm.resourceLink}
                onChange={(e) => setQuestionForm({ ...questionForm, resourceLink: e.target.value })}
                placeholder="https://www.example.com/resource"
                data-testid="input-resource-link"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setIsQuestionDialogOpen(false);
              setEditingQuestion(null);
            }}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (selectedModelId) {
                  const dataToSend: any = {
                    ...questionForm,
                    modelId: selectedModelId,
                    // Convert 'none' back to null/undefined for the API
                    dimensionId: questionForm.dimensionId === 'none' || !questionForm.dimensionId ? undefined : questionForm.dimensionId,
                  };
                  
                  // Remove undefined numeric fields for non-numeric questions
                  if (questionForm.type !== 'numeric') {
                    delete dataToSend.minValue;
                    delete dataToSend.maxValue;
                    delete dataToSend.unit;
                  }
                  
                  if (editingQuestion) {
                    updateQuestion.mutate({ ...dataToSend, id: editingQuestion.id });
                  } else {
                    createQuestion.mutate(dataToSend);
                  }
                }
              }}
              disabled={createQuestion.isPending || updateQuestion.isPending}
              data-testid="button-save-question"
            >
              {createQuestion.isPending || updateQuestion.isPending ? 'Saving...' : 
               editingQuestion ? 'Update Question' : 'Save Question'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Answer Management Dialog */}
      <Dialog open={isAnswerDialogOpen} onOpenChange={setIsAnswerDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Manage Answer Options</DialogTitle>
            <DialogDescription>
              {editingQuestion?.text}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="flex justify-end">
              <Button
                onClick={() => {
                  const newOrder = answers.length + 1;
                  createAnswer.mutate({
                    questionId: editingQuestion!.id,
                    text: `Option ${newOrder}`,
                    score: newOrder * 100,
                    order: newOrder
                  });
                }}
                disabled={!editingQuestion}
                data-testid="button-add-answer"
              >
                <Plus className="mr-2 h-4 w-4" />
                Add Answer
              </Button>
            </div>

            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Answer Text</TableHead>
                  <TableHead className="w-24">Score</TableHead>
                  <TableHead className="w-24">Order</TableHead>
                  <TableHead className="w-24">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {answers.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center">
                      No answer options yet. Add your first answer option above.
                    </TableCell>
                  </TableRow>
                ) : (
                  answers.sort((a, b) => a.order - b.order).map((answer) => (
                    <TableRow key={answer.id}>
                      <TableCell>
                        <Input
                          value={answer.text}
                          onChange={(e) => {
                            updateAnswer.mutate({
                              id: answer.id,
                              text: e.target.value
                            });
                          }}
                          onBlur={() => {
                            // Ensure save on blur
                            updateAnswer.mutate({
                              id: answer.id,
                              text: answer.text
                            });
                          }}
                          data-testid={`input-answer-text-${answer.id}`}
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          value={answer.score}
                          onChange={(e) => {
                            updateAnswer.mutate({
                              id: answer.id,
                              score: parseInt(e.target.value) || 0
                            });
                          }}
                          data-testid={`input-answer-score-${answer.id}`}
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          value={answer.order}
                          onChange={(e) => {
                            updateAnswer.mutate({
                              id: answer.id,
                              order: parseInt(e.target.value) || 1
                            });
                          }}
                          data-testid={`input-answer-order-${answer.id}`}
                        />
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => {
                            if (confirm('Are you sure you want to delete this answer?')) {
                              deleteAnswer.mutate(answer.id);
                            }
                          }}
                          data-testid={`delete-answer-${answer.id}`}
                        >
                          <Trash className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>

            <div className="text-sm text-muted-foreground">
              <p>• Answer text will be shown to users during the assessment</p>
              <p>• Score determines the maturity level (100-500 scale)</p>
              <p>• Order determines display sequence</p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsAnswerDialogOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Footer />
    </div>
  );
}