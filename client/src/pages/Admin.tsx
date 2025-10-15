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
import { Download, Plus, Edit, Trash, FileSpreadsheet, Eye, BarChart3, Settings, FileDown, FileUp, ListOrdered, Users, Star, Upload, X, Sparkles } from "lucide-react";
import type { Model, Result, Assessment, Dimension, Question, Answer, User } from "@shared/schema";
import { ObjectUploader } from "@/components/ObjectUploader";
import { AiAssistant } from "@/components/admin/AiAssistant";
import { AiUsageDashboard } from "@/components/admin/AiUsageDashboard";

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
    imageUrl: '',
  });
  const [dimensionForm, setDimensionForm] = useState({
    label: '',
    key: '',
    description: '',
    order: 1,
  });
  const [questionForm, setQuestionForm] = useState({
    modelId: '',
    text: '',
    type: 'multiple_choice' as 'multiple_choice' | 'multi_select' | 'numeric' | 'true_false' | 'text',
    dimensionId: '',
    order: 1,
    minValue: 0,
    maxValue: 100,
    unit: '',
    placeholder: '',
    improvementStatement: '',
    resourceLink: '',
    resourceTitle: '',
    resourceDescription: '',
  });
  const [editingAnswer, setEditingAnswer] = useState<Answer | null>(null);
  const [isEditAnswerDialogOpen, setIsEditAnswerDialogOpen] = useState(false);
  const [answerEditForm, setAnswerEditForm] = useState({
    text: '',
    score: 100,
    improvementStatement: '',
    resourceTitle: '',
    resourceDescription: '',
    resourceLink: '',
  });
  const [answerLocalState, setAnswerLocalState] = useState<Record<string, {text: string, score: number, order: number}>>({});
  const [editingUser, setEditingUser] = useState<Omit<User, 'password'> | null>(null);
  const [isUserDialogOpen, setIsUserDialogOpen] = useState(false);
  const [userForm, setUserForm] = useState({
    role: 'user' as 'user' | 'admin',
  });
  const [csvImportMode, setCSVImportMode] = useState<'add' | 'replace'>('add');
  const [isCSVImportDialogOpen, setIsCSVImportDialogOpen] = useState(false);
  const [pendingCSVFile, setPendingCSVFile] = useState<{file: File; modelId: string} | null>(null);
  
  // Maturity scale and general resources state
  const [isMaturityScaleDialogOpen, setIsMaturityScaleDialogOpen] = useState(false);
  const [isGeneralResourcesDialogOpen, setIsGeneralResourcesDialogOpen] = useState(false);
  const [editingModelForConfig, setEditingModelForConfig] = useState<Model | null>(null);
  const [maturityScaleLevels, setMaturityScaleLevels] = useState<Array<{
    id: string;
    name: string;
    description: string;
    minScore: number;
    maxScore: number;
  }>>([]);
  const [generalResourcesList, setGeneralResourcesList] = useState<Array<{
    id: string;
    title: string;
    description?: string;
    link?: string;
  }>>([]);

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
      // Fetch all assessments (admin endpoint)
      const assessments = await fetch('/api/admin/assessments').then(r => r.json());
      
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

  // Fetch all users (admin only)
  const { data: users = [], isLoading: usersLoading } = useQuery<Omit<User, 'password'>[]>({
    queryKey: ['/api/users'],
  });

  // Update user mutation
  const updateUser = useMutation({
    mutationFn: async (data: { id: string; role: string }) => {
      return apiRequest(`/api/users/${data.id}`, 'PUT', { role: data.role });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/users'] });
      setIsUserDialogOpen(false);
      toast({
        title: "User updated",
        description: "User role has been updated successfully.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update user",
        variant: "destructive",
      });
    },
  });

  // Delete user mutation
  const deleteUser = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest(`/api/users/${id}`, 'DELETE');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/users'] });
      toast({
        title: "User deleted",
        description: "User has been deleted successfully.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to delete user",
        variant: "destructive",
      });
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

  // Upload model image mutation
  const uploadModelImage = useMutation({
    mutationFn: async ({ modelId, imageUrl }: { modelId: string; imageUrl: string }) => {
      return apiRequest(`/api/models/${modelId}/image`, 'PUT', { imageUrl });
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/models'] });
      // Update the form with the normalized path from the response
      if (data && data.imageUrl) {
        setModelForm(prev => ({ ...prev, imageUrl: data.imageUrl }));
      }
      toast({
        title: "Image uploaded",
        description: "The model image has been uploaded successfully.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to upload image",
        variant: "destructive",
      });
    },
  });

  // Remove model image mutation
  const removeModelImage = useMutation({
    mutationFn: async (modelId: string) => {
      return apiRequest(`/api/models/${modelId}`, 'PUT', { imageUrl: '' });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/models'] });
      setModelForm(prev => ({ ...prev, imageUrl: '' }));
      toast({
        title: "Image removed",
        description: "The model image has been removed.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to remove image",
        variant: "destructive",
      });
    },
  });

  // Toggle featured status mutation
  const toggleFeatured = useMutation({
    mutationFn: async ({ modelId, featured }: { modelId: string; featured: boolean }) => {
      return apiRequest(`/api/models/${modelId}`, 'PUT', { featured });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/models'] });
      toast({
        title: "Featured status updated",
        description: "The model's featured status has been updated.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update featured status",
        variant: "destructive",
      });
    },
  });

  // Update maturity scale mutation
  const updateMaturityScale = useMutation({
    mutationFn: async ({ modelId, maturityScale }: { modelId: string; maturityScale: typeof maturityScaleLevels }) => {
      return apiRequest(`/api/models/${modelId}/maturity-scale`, 'PUT', { maturityScale });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/models'] });
      setIsMaturityScaleDialogOpen(false);
      toast({
        title: "Maturity scale updated",
        description: "The maturity scale has been updated successfully.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update maturity scale",
        variant: "destructive",
      });
    },
  });

  // Update general resources mutation
  const updateGeneralResources = useMutation({
    mutationFn: async ({ modelId, generalResources }: { modelId: string; generalResources: typeof generalResourcesList }) => {
      return apiRequest(`/api/models/${modelId}/general-resources`, 'PUT', { generalResources });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/models'] });
      setIsGeneralResourcesDialogOpen(false);
      toast({
        title: "General resources updated",
        description: "The general resources have been updated successfully.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update general resources",
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
    mutationFn: async (data: { 
      id: string; 
      text?: string; 
      score?: number; 
      order?: number;
      improvementStatement?: string;
      resourceTitle?: string;
      resourceDescription?: string;
      resourceLink?: string;
    }) => {
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
      imageUrl: '',
    });

    setEditingModel(null);
  };

  const resetQuestionForm = () => {
    setQuestionForm({
      modelId: '',
      text: '',
      type: 'multiple_choice',
      dimensionId: '',
      order: 1,
      minValue: 0,
      maxValue: 100,
      unit: '',
      placeholder: '',
      improvementStatement: '',
      resourceLink: '',
      resourceTitle: '',
      resourceDescription: '',
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
      imageUrl: model.imageUrl || '',
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
        setPendingCSVFile({ file, modelId });
        setIsCSVImportDialogOpen(true);
      }
    };
    input.click();
  };

  const handleConfirmImport = async () => {
    if (!pendingCSVFile) return;
    
    try {
      const csvContent = await pendingCSVFile.file.text();
      const response = await fetch(`/api/models/${pendingCSVFile.modelId}/import-questions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ csvContent, mode: csvImportMode }),
      });
      
      if (!response.ok) throw new Error('Import failed');
      
      queryClient.invalidateQueries({ queryKey: ['/api/questions', pendingCSVFile.modelId] });
      queryClient.invalidateQueries({ queryKey: ['/api/dimensions', pendingCSVFile.modelId] });
      
      toast({
        title: "Import successful",
        description: csvImportMode === 'replace' 
          ? "All questions replaced with CSV data." 
          : "New questions added from CSV.",
      });
      
      setIsCSVImportDialogOpen(false);
      setPendingCSVFile(null);
    } catch (error) {
      toast({
        title: "Import failed",
        description: "Failed to import questions. Please check the CSV format.",
        variant: "destructive",
      });
    }
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
      description: "Results exported to CSV file.",
    });
  };

  const exportUsersToCSV = () => {
    if (!users.length) {
      toast({
        title: "No data",
        description: "No users to export.",
        variant: "destructive",
      });
      return;
    }

    // Create CSV content
    const headers = ['Username', 'Email', 'Name', 'Company', 'Job Title', 'Industry', 'Company Size', 'Country', 'Role', 'Created At'];
    const rows = users.map(u => [
      u.username || '',
      u.email || '',
      u.name || '',
      u.company || '',
      u.jobTitle || '',
      u.industry || '',
      u.companySize || '',
      u.country || '',
      u.role || '',
      u.createdAt ? new Date(u.createdAt).toLocaleDateString() : '',
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
    a.download = `user-accounts-${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);

    toast({
      title: "Export successful",
      description: `Exported ${users.length} user accounts to CSV.`,
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
            <TabsList className="grid w-full grid-cols-8">
              <TabsTrigger value="models" data-testid="tab-models">Models</TabsTrigger>
              <TabsTrigger value="dimensions" data-testid="tab-dimensions">Dimensions</TabsTrigger>
              <TabsTrigger value="questions" data-testid="tab-questions">Questions</TabsTrigger>
              <TabsTrigger value="users" data-testid="tab-users">Users</TabsTrigger>
              <TabsTrigger value="results" data-testid="tab-results">Results</TabsTrigger>
              <TabsTrigger value="benchmarks" data-testid="tab-benchmarks">Benchmarks</TabsTrigger>
              <TabsTrigger value="ai-usage" data-testid="tab-ai-usage">AI Usage</TabsTrigger>
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
                      <TableHead>Featured</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {modelsLoading ? (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center">Loading models...</TableCell>
                      </TableRow>
                    ) : models.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center">No models found</TableCell>
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
                          <TableCell>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => toggleFeatured.mutate({ modelId: model.id, featured: !model.featured })}
                              data-testid={`button-toggle-featured-${model.id}`}
                              title={model.featured ? "Remove from featured" : "Mark as featured"}
                            >
                              <Star className={`h-4 w-4 ${model.featured ? 'fill-yellow-500 text-yellow-500' : 'text-muted-foreground'}`} />
                            </Button>
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
                                title="Edit Model"
                              >
                                <Edit className="h-4 w-4" />
                              </Button>
                              <Button 
                                variant="ghost" 
                                size="icon"
                                onClick={() => {
                                  setEditingModelForConfig(model);
                                  const defaultScale = [
                                    { id: '1', name: 'Nascent', description: 'Beginning AI journey', minScore: 100, maxScore: 199 },
                                    { id: '2', name: 'Experimental', description: 'Experimenting with AI', minScore: 200, maxScore: 299 },
                                    { id: '3', name: 'Operational', description: 'Operational AI processes', minScore: 300, maxScore: 399 },
                                    { id: '4', name: 'Strategic', description: 'Strategic AI foundations', minScore: 400, maxScore: 449 },
                                    { id: '5', name: 'Transformational', description: 'Leading AI transformation', minScore: 450, maxScore: 500 },
                                  ];
                                  setMaturityScaleLevels(model.maturityScale || defaultScale);
                                  setIsMaturityScaleDialogOpen(true);
                                }}
                                data-testid={`button-maturity-scale-${model.id}`}
                                title="Edit Maturity Scale"
                              >
                                <BarChart3 className="h-4 w-4" />
                              </Button>
                              <Button 
                                variant="ghost" 
                                size="icon"
                                onClick={() => {
                                  setEditingModelForConfig(model);
                                  setGeneralResourcesList(model.generalResources || []);
                                  setIsGeneralResourcesDialogOpen(true);
                                }}
                                data-testid={`button-general-resources-${model.id}`}
                                title="Edit General Resources"
                              >
                                <FileSpreadsheet className="h-4 w-4" />
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
                                title="Delete Model"
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
                                  <AiAssistant
                                    type="resources"
                                    context={{
                                      modelId: selectedModelId,
                                      modelName: models.find(m => m.id === selectedModelId)?.name,
                                      dimensionId: dimension.id,
                                      dimensionLabel: dimension.label,
                                    }}
                                    onGenerated={(content) => {
                                      toast({
                                        title: "Resources Generated",
                                        description: `Generated ${content.resources?.length || 0} resources for ${dimension.label}`,
                                      });
                                    }}
                                    trigger={
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        title="Generate resources with AI"
                                        data-testid={`button-generate-resources-${dimension.id}`}
                                      >
                                        <FileSpreadsheet className="h-4 w-4" />
                                      </Button>
                                    }
                                  />
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
                                          question.type === 'multi_select' ? 'default' :
                                          'default'
                                        }>
                                          {question.type === 'numeric' ? 'Numeric' : 
                                           question.type === 'true_false' ? 'True/False' :
                                           question.type === 'text' ? 'Text Input' :
                                           question.type === 'multi_select' ? 'Multi-Select' :
                                           'Multiple Choice'}
                                        </Badge>
                                      </TableCell>
                                      <TableCell className="text-right">
                                        <div className="flex justify-end gap-2">
                                          {(question.type === 'multiple_choice' || question.type === 'multi_select') && (
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
                                          question.type === 'multi_select' ? 'default' :
                                          'default'
                                        }>
                                          {question.type === 'numeric' ? 'Numeric' : 
                                           question.type === 'true_false' ? 'True/False' :
                                           question.type === 'text' ? 'Text Input' :
                                           question.type === 'multi_select' ? 'Multi-Select' :
                                           'Multiple Choice'}
                                        </Badge>
                                      </TableCell>
                                      <TableCell className="text-right">
                                        <div className="flex justify-end gap-2">
                                          {(question.type === 'multiple_choice' || question.type === 'multi_select') && (
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

            <TabsContent value="users" className="space-y-4">
              <Card className="p-6">
                <div className="flex justify-between items-center mb-6">
                  <div>
                    <h3 className="text-xl font-semibold">User Management</h3>
                    <p className="text-sm text-muted-foreground">Manage user accounts and permissions</p>
                  </div>
                  <Button variant="outline" onClick={exportUsersToCSV} data-testid="button-export-users">
                    <FileSpreadsheet className="mr-2 h-4 w-4" />
                    Export CSV
                  </Button>
                </div>

                {usersLoading ? (
                  <div className="py-8 text-center text-muted-foreground">Loading users...</div>
                ) : users.length === 0 ? (
                  <div className="py-8 text-center text-muted-foreground">No users found</div>
                ) : (
                  <div className="rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Username</TableHead>
                          <TableHead>Email</TableHead>
                          <TableHead>Name</TableHead>
                          <TableHead>Company</TableHead>
                          <TableHead>Role</TableHead>
                          <TableHead>Created</TableHead>
                          <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {users.map((user) => (
                          <TableRow key={user.id}>
                            <TableCell className="font-medium">{user.username}</TableCell>
                            <TableCell>{user.email || '-'}</TableCell>
                            <TableCell>{user.name || '-'}</TableCell>
                            <TableCell>{user.company || '-'}</TableCell>
                            <TableCell>
                              <Badge variant={user.role === 'admin' ? 'default' : 'secondary'}>
                                {user.role || 'user'}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              {user.createdAt ? new Date(user.createdAt).toLocaleDateString() : '-'}
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="flex justify-end gap-2">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => {
                                    setEditingUser(user);
                                    setUserForm({ role: (user.role as 'user' | 'admin') || 'user' });
                                    setIsUserDialogOpen(true);
                                  }}
                                  data-testid={`edit-user-${user.id}`}
                                >
                                  <Edit className="h-4 w-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => {
                                    if (confirm(`Are you sure you want to delete user "${user.username}"?`)) {
                                      deleteUser.mutate(user.id);
                                    }
                                  }}
                                  data-testid={`delete-user-${user.id}`}
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
                )}
              </Card>
            </TabsContent>

            <TabsContent value="results" className="space-y-4">
              {/* Assessment Statistics */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <Card className="p-4">
                  <div className="text-2xl font-bold text-primary">{totalAssessments}</div>
                  <div className="text-sm text-muted-foreground">Total Assessments</div>
                </Card>
                <Card className="p-4">
                  <div className="text-2xl font-bold text-secondary">{averageScore}</div>
                  <div className="text-sm text-muted-foreground">Average Score</div>
                </Card>
                <Card className="p-4">
                  <div className="text-2xl font-bold text-accent">{users.length}</div>
                  <div className="text-sm text-muted-foreground">Registered Users</div>
                </Card>
                <Card className="p-4">
                  <div className="text-2xl font-bold text-primary">{publishedModels}</div>
                  <div className="text-sm text-muted-foreground">Published Models</div>
                </Card>
              </div>

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

            <TabsContent value="ai-usage" className="space-y-4">
              <AiUsageDashboard />
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

            {/* Image Upload Section */}
            <div>
              <Label>Model Image</Label>
              <p className="text-sm text-muted-foreground mb-3">
                Upload an image for this model (recommended: 1200px+ width, 16:9 or 21:9 aspect ratio, under 500KB)
              </p>
              
              {modelForm.imageUrl ? (
                <div className="space-y-3">
                  <div className="relative rounded-lg overflow-hidden border border-border">
                    <img 
                      src={modelForm.imageUrl} 
                      alt="Model preview" 
                      className="w-full h-48 object-cover"
                    />
                  </div>
                  <div className="flex gap-2">
                    {editingModel && (
                      <ObjectUploader
                        maxNumberOfFiles={1}
                        maxFileSize={524288} // 500KB
                        allowedFileTypes={['image/jpeg', 'image/png', 'image/webp']}
                        onGetUploadParameters={async () => {
                          const response = await fetch('/api/objects/upload', {
                            method: 'POST',
                            credentials: 'include',
                          });
                          const data = await response.json();
                          return {
                            method: 'PUT' as const,
                            url: data.uploadURL,
                          };
                        }}
                        onComplete={(result) => {
                          if (result.successful && result.successful[0] && editingModel) {
                            const uploadURL = result.successful[0].uploadURL;
                            if (uploadURL) {
                              uploadModelImage.mutate({
                                modelId: editingModel.id,
                                imageUrl: uploadURL,
                              });
                            }
                          }
                        }}
                        buttonVariant="outline"
                      >
                        <Upload className="h-4 w-4 mr-2" />
                        Replace Image
                      </ObjectUploader>
                    )}
                    <Button
                      variant="outline"
                      onClick={() => {
                        if (editingModel) {
                          removeModelImage.mutate(editingModel.id);
                        } else {
                          setModelForm({ ...modelForm, imageUrl: '' });
                        }
                      }}
                      disabled={removeModelImage.isPending}
                      data-testid="button-remove-image"
                    >
                      <X className="h-4 w-4 mr-2" />
                      {removeModelImage.isPending ? 'Removing...' : 'Remove Image'}
                    </Button>
                  </div>
                </div>
              ) : (
                <div>
                  {editingModel ? (
                    <ObjectUploader
                      maxNumberOfFiles={1}
                      maxFileSize={524288} // 500KB
                      allowedFileTypes={['image/jpeg', 'image/png', 'image/webp']}
                      onGetUploadParameters={async () => {
                        const response = await fetch('/api/objects/upload', {
                          method: 'POST',
                          credentials: 'include',
                        });
                        const data = await response.json();
                        return {
                          method: 'PUT' as const,
                          url: data.uploadURL,
                        };
                      }}
                      onComplete={(result) => {
                        if (result.successful && result.successful[0] && editingModel) {
                          const uploadURL = result.successful[0].uploadURL;
                          if (uploadURL) {
                            uploadModelImage.mutate({
                              modelId: editingModel.id,
                              imageUrl: uploadURL,
                            });
                          }
                        }
                      }}
                    >
                      <Upload className="h-4 w-4 mr-2" />
                      Upload Image
                    </ObjectUploader>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      Save the model first, then you can upload an image.
                    </p>
                  )}
                </div>
              )}
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
                  <SelectItem value="multi_select">Multi-Select</SelectItem>
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
                  <TableHead className="w-32">Actions</TableHead>
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
                  answers.sort((a, b) => a.order - b.order).map((answer) => {
                    const localState = answerLocalState[answer.id] || { text: answer.text, score: answer.score, order: answer.order };
                    return (
                    <TableRow key={answer.id}>
                      <TableCell>
                        <Input
                          value={localState.text}
                          onChange={(e) => {
                            setAnswerLocalState({
                              ...answerLocalState,
                              [answer.id]: { ...localState, text: e.target.value }
                            });
                          }}
                          onBlur={() => {
                            if (localState.text !== answer.text) {
                              updateAnswer.mutate({
                                id: answer.id,
                                text: localState.text
                              });
                            }
                          }}
                          data-testid={`input-answer-text-${answer.id}`}
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          value={localState.score}
                          onChange={(e) => {
                            setAnswerLocalState({
                              ...answerLocalState,
                              [answer.id]: { ...localState, score: parseInt(e.target.value) || 0 }
                            });
                          }}
                          onBlur={() => {
                            if (localState.score !== answer.score) {
                              updateAnswer.mutate({
                                id: answer.id,
                                score: localState.score
                              });
                            }
                          }}
                          data-testid={`input-answer-score-${answer.id}`}
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          value={localState.order}
                          onChange={(e) => {
                            setAnswerLocalState({
                              ...answerLocalState,
                              [answer.id]: { ...localState, order: parseInt(e.target.value) || 1 }
                            });
                          }}
                          onBlur={() => {
                            if (localState.order !== answer.order) {
                              updateAnswer.mutate({
                                id: answer.id,
                                order: localState.order
                              });
                            }
                          }}
                          data-testid={`input-answer-order-${answer.id}`}
                        />
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <AiAssistant
                            type="answer-rewrite"
                            context={{
                              questionText: editingQuestion?.text,
                              answerText: localState.text,
                              answerScore: localState.score,
                              modelContext: undefined,
                            }}
                            onGenerated={(data) => {
                              if (data.rewrittenAnswer) {
                                // Update the local state first
                                setAnswerLocalState({
                                  ...answerLocalState,
                                  [answer.id]: { ...localState, text: data.rewrittenAnswer }
                                });
                                // Then update the database
                                updateAnswer.mutate({
                                  id: answer.id,
                                  text: data.rewrittenAnswer
                                });
                                toast({
                                  title: "Answer Rewritten",
                                  description: "The answer has been updated with more contextual language.",
                                });
                              }
                            }}
                            trigger={
                              <Button
                                variant="ghost"
                                size="icon"
                                title="Rewrite answer to be more contextual"
                                data-testid={`rewrite-answer-${answer.id}`}
                              >
                                <Sparkles className="h-4 w-4" />
                              </Button>
                            }
                          />
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => {
                              setEditingAnswer(answer);
                              setAnswerEditForm({
                                text: answer.text,
                                score: answer.score,
                                improvementStatement: answer.improvementStatement || '',
                                resourceTitle: answer.resourceTitle || '',
                                resourceDescription: answer.resourceDescription || '',
                                resourceLink: answer.resourceLink || '',
                              });
                              setIsEditAnswerDialogOpen(true);
                            }}
                            data-testid={`edit-answer-resources-${answer.id}`}
                            title="Edit resources and improvement guidance"
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
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
                        </div>
                      </TableCell>
                    </TableRow>
                    );
                  })
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

      {/* Answer Resource Edit Dialog */}
      <Dialog open={isEditAnswerDialogOpen} onOpenChange={setIsEditAnswerDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Answer Resources & Guidance</DialogTitle>
            <DialogDescription>
              Configure improvement guidance and resources for: {answerEditForm.text}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <div className="flex items-center justify-between mb-2">
                <Label htmlFor="answer-improvement">Improvement Statement</Label>
                <AiAssistant
                  type="improvement"
                  context={{
                    questionText: editingQuestion?.text,
                    answerText: answerEditForm.text,
                    answerScore: answerEditForm.score,
                  }}
                  onGenerated={(content) => {
                    setAnswerEditForm({
                      ...answerEditForm,
                      improvementStatement: content.improvementStatement,
                    });
                    toast({
                      title: "AI Content Applied",
                      description: "The improvement statement has been updated.",
                    });
                  }}
                />
              </div>
              <Textarea
                id="answer-improvement"
                value={answerEditForm.improvementStatement}
                onChange={(e) => setAnswerEditForm({ ...answerEditForm, improvementStatement: e.target.value })}
                placeholder="Guidance on how to improve from this response level..."
                rows={3}
                data-testid="input-answer-improvement"
              />
              <p className="text-sm text-muted-foreground mt-1">
                Shown in results for users who selected this answer
              </p>
            </div>

            <div className="space-y-4 p-4 border rounded-md">
              <h4 className="font-medium">Resource Link</h4>
              
              <div>
                <Label htmlFor="resource-title">Resource Title</Label>
                <Input
                  id="resource-title"
                  value={answerEditForm.resourceTitle}
                  onChange={(e) => setAnswerEditForm({ ...answerEditForm, resourceTitle: e.target.value })}
                  placeholder="e.g., Guide to AI Implementation"
                  data-testid="input-resource-title"
                />
              </div>

              <div>
                <Label htmlFor="resource-description">Resource Description</Label>
                <Textarea
                  id="resource-description"
                  value={answerEditForm.resourceDescription}
                  onChange={(e) => setAnswerEditForm({ ...answerEditForm, resourceDescription: e.target.value })}
                  placeholder="Brief description of this resource..."
                  rows={2}
                  data-testid="input-resource-description"
                />
              </div>

              <div>
                <Label htmlFor="resource-link">Resource URL</Label>
                <Input
                  id="resource-link"
                  type="url"
                  value={answerEditForm.resourceLink}
                  onChange={(e) => setAnswerEditForm({ ...answerEditForm, resourceLink: e.target.value })}
                  placeholder="https://www.example.com/resource"
                  data-testid="input-resource-url"
                />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditAnswerDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (editingAnswer) {
                  updateAnswer.mutate({
                    id: editingAnswer.id,
                    improvementStatement: answerEditForm.improvementStatement || undefined,
                    resourceTitle: answerEditForm.resourceTitle || undefined,
                    resourceDescription: answerEditForm.resourceDescription || undefined,
                    resourceLink: answerEditForm.resourceLink || undefined,
                  });
                  setIsEditAnswerDialogOpen(false);
                }
              }}
              data-testid="button-save-answer-resources"
            >
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* CSV Import Mode Dialog */}
      <Dialog open={isCSVImportDialogOpen} onOpenChange={setIsCSVImportDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>CSV Import Options</DialogTitle>
            <DialogDescription>
              Choose how to import questions from the CSV file
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-3">
              <Label>Import Mode</Label>
              <div className="space-y-2">
                <div
                  className={`p-4 border rounded-md cursor-pointer hover-elevate ${csvImportMode === 'add' ? 'border-primary bg-primary/5' : ''}`}
                  onClick={() => setCSVImportMode('add')}
                  data-testid="option-import-add"
                >
                  <div className="flex items-start gap-3">
                    <input
                      type="radio"
                      checked={csvImportMode === 'add'}
                      onChange={() => setCSVImportMode('add')}
                      className="mt-1"
                    />
                    <div>
                      <div className="font-medium">Add New Questions</div>
                      <div className="text-sm text-muted-foreground">
                        Import new questions and append them to existing questions. Existing questions will not be modified.
                      </div>
                    </div>
                  </div>
                </div>

                <div
                  className={`p-4 border rounded-md cursor-pointer hover-elevate ${csvImportMode === 'replace' ? 'border-primary bg-primary/5' : ''}`}
                  onClick={() => setCSVImportMode('replace')}
                  data-testid="option-import-replace"
                >
                  <div className="flex items-start gap-3">
                    <input
                      type="radio"
                      checked={csvImportMode === 'replace'}
                      onChange={() => setCSVImportMode('replace')}
                      className="mt-1"
                    />
                    <div>
                      <div className="font-medium">Replace All Questions</div>
                      <div className="text-sm text-muted-foreground">
                        Delete all existing questions and replace them with the CSV data. This action cannot be undone.
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setIsCSVImportDialogOpen(false);
              setPendingCSVFile(null);
            }}>
              Cancel
            </Button>
            <Button
              onClick={handleConfirmImport}
              data-testid="button-confirm-import"
            >
              Import Questions
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* User Edit Dialog */}
      <Dialog open={isUserDialogOpen} onOpenChange={setIsUserDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit User Role</DialogTitle>
            <DialogDescription>
              Change the role for user: {editingUser?.username}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>User Role</Label>
              <Select
                value={userForm.role}
                onValueChange={(value) => setUserForm({ ...userForm, role: value as 'user' | 'admin' })}
              >
                <SelectTrigger data-testid="select-user-role">
                  <SelectValue placeholder="Select role" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="user">User</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-sm text-muted-foreground">
                Admins have full access to the admin panel and can manage all content.
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsUserDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (editingUser) {
                  updateUser.mutate({ id: editingUser.id, role: userForm.role });
                }
              }}
              data-testid="button-save-user"
            >
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Maturity Scale Editor Dialog */}
      <Dialog open={isMaturityScaleDialogOpen} onOpenChange={setIsMaturityScaleDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Maturity Scale</DialogTitle>
            <DialogDescription>
              Customize the maturity scale levels for {editingModelForConfig?.name}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {maturityScaleLevels.map((level, index) => (
              <Card key={level.id} className="p-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Level Name</Label>
                    <Input
                      value={level.name}
                      onChange={(e) => {
                        const newLevels = [...maturityScaleLevels];
                        newLevels[index].name = e.target.value;
                        setMaturityScaleLevels(newLevels);
                      }}
                      placeholder="e.g., Nascent"
                      data-testid={`input-level-name-${index}`}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Score Range</Label>
                    <div className="flex gap-2 items-center">
                      <Input
                        type="number"
                        value={level.minScore}
                        onChange={(e) => {
                          const newLevels = [...maturityScaleLevels];
                          newLevels[index].minScore = parseInt(e.target.value);
                          setMaturityScaleLevels(newLevels);
                        }}
                        placeholder="Min"
                        data-testid={`input-level-min-${index}`}
                      />
                      <span>-</span>
                      <Input
                        type="number"
                        value={level.maxScore}
                        onChange={(e) => {
                          const newLevels = [...maturityScaleLevels];
                          newLevels[index].maxScore = parseInt(e.target.value);
                          setMaturityScaleLevels(newLevels);
                        }}
                        placeholder="Max"
                        data-testid={`input-level-max-${index}`}
                      />
                    </div>
                  </div>
                  <div className="col-span-2 space-y-2">
                    <Label>Description</Label>
                    <Textarea
                      value={level.description}
                      onChange={(e) => {
                        const newLevels = [...maturityScaleLevels];
                        newLevels[index].description = e.target.value;
                        setMaturityScaleLevels(newLevels);
                      }}
                      placeholder="Describe this maturity level"
                      data-testid={`input-level-description-${index}`}
                    />
                  </div>
                </div>
              </Card>
            ))}
            
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  setMaturityScaleLevels([
                    ...maturityScaleLevels,
                    {
                      id: String(maturityScaleLevels.length + 1),
                      name: '',
                      description: '',
                      minScore: maturityScaleLevels[maturityScaleLevels.length - 1]?.maxScore + 1 || 100,
                      maxScore: 500,
                    },
                  ]);
                }}
                data-testid="button-add-level"
              >
                <Plus className="mr-2 h-4 w-4" />
                Add Level
              </Button>
              {maturityScaleLevels.length > 1 && (
                <Button
                  variant="outline"
                  onClick={() => {
                    setMaturityScaleLevels(maturityScaleLevels.slice(0, -1));
                  }}
                  data-testid="button-remove-level"
                >
                  <Trash className="mr-2 h-4 w-4" />
                  Remove Last Level
                </Button>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsMaturityScaleDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (editingModelForConfig) {
                  updateMaturityScale.mutate({
                    modelId: editingModelForConfig.id,
                    maturityScale: maturityScaleLevels,
                  });
                }
              }}
              data-testid="button-save-maturity-scale"
            >
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* General Resources Editor Dialog */}
      <Dialog open={isGeneralResourcesDialogOpen} onOpenChange={setIsGeneralResourcesDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit General Resources</DialogTitle>
            <DialogDescription>
              Manage resources displayed at the end of results for {editingModelForConfig?.name}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {generalResourcesList.map((resource, index) => (
              <Card key={resource.id} className="p-4">
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label>Resource Title</Label>
                    <Input
                      value={resource.title}
                      onChange={(e) => {
                        const newResources = [...generalResourcesList];
                        newResources[index].title = e.target.value;
                        setGeneralResourcesList(newResources);
                      }}
                      placeholder="Resource title"
                      data-testid={`input-resource-title-${index}`}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Description</Label>
                    <Textarea
                      value={resource.description || ''}
                      onChange={(e) => {
                        const newResources = [...generalResourcesList];
                        newResources[index].description = e.target.value;
                        setGeneralResourcesList(newResources);
                      }}
                      placeholder="Brief description of the resource"
                      data-testid={`input-resource-description-${index}`}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Link</Label>
                    <Input
                      value={resource.link || ''}
                      onChange={(e) => {
                        const newResources = [...generalResourcesList];
                        newResources[index].link = e.target.value;
                        setGeneralResourcesList(newResources);
                      }}
                      placeholder="https://example.com/resource"
                      data-testid={`input-resource-link-${index}`}
                    />
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setGeneralResourcesList(generalResourcesList.filter((_, i) => i !== index));
                    }}
                    data-testid={`button-remove-resource-${index}`}
                  >
                    <Trash className="mr-2 h-4 w-4" />
                    Remove Resource
                  </Button>
                </div>
              </Card>
            ))}
            
            {generalResourcesList.length === 0 && (
              <div className="text-center py-8 text-muted-foreground">
                No general resources added yet. Click "Add Resource" to get started.
              </div>
            )}
            
            <Button
              variant="outline"
              onClick={() => {
                setGeneralResourcesList([
                  ...generalResourcesList,
                  {
                    id: `resource-${Date.now()}`,
                    title: '',
                    description: '',
                    link: '',
                  },
                ]);
              }}
              data-testid="button-add-resource"
            >
              <Plus className="mr-2 h-4 w-4" />
              Add Resource
            </Button>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsGeneralResourcesDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (editingModelForConfig) {
                  updateGeneralResources.mutate({
                    modelId: editingModelForConfig.id,
                    generalResources: generalResourcesList,
                  });
                }
              }}
              data-testid="button-save-general-resources"
            >
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Footer />
    </div>
  );
}