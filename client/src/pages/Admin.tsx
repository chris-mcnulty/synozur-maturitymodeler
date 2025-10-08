import { useState } from "react";
import { Header } from "@/components/Header";
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
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Download, Plus, Edit, Trash, FileSpreadsheet, Eye, BarChart3, Settings } from "lucide-react";
import type { Model, Result, Assessment, Dimension } from "@shared/schema";

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
  const [heroModelId, setHeroModelId] = useState<string>('');
  const [modelForm, setModelForm] = useState({
    name: '',
    slug: '',
    description: '',
    version: '1.0.0',
    estimatedTime: '15-20 minutes',
    status: 'draft' as 'draft' | 'published',
  });
  const [dimensionForm, setDimensionForm] = useState<{ label: string; key: string; description: string }[]>([
    { label: '', key: '', description: '' },
  ]);

  // Fetch models
  const { data: models = [], isLoading: modelsLoading } = useQuery<Model[]>({
    queryKey: ['/api/models'],
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
                date: assessment.startedAt?.toISOString() || new Date().toISOString(),
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
    mutationFn: async (data: typeof modelForm & { dimensions: typeof dimensionForm }) => {
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
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to create model. Backend support for this feature is coming soon.",
        variant: "destructive",
      });
    },
  });

  // Update model mutation (backend support needs to be added)
  const updateModel = useMutation({
    mutationFn: async (data: typeof modelForm & { id: string; dimensions: typeof dimensionForm }) => {
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
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to update model. Backend support for this feature is coming soon.",
        variant: "destructive",
      });
    },
  });

  // Save hero model setting mutation
  const saveHeroModelSetting = useMutation({
    mutationFn: async (modelId: string) => {
      const response = await apiRequest('POST', '/api/settings/heroModel', { value: modelId });
      return response.json();
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

  // Delete model mutation (backend support needs to be added)
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
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to delete model. Backend support for this feature is coming soon.",
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
    setDimensionForm([{ label: '', key: '', description: '' }]);
    setEditingModel(null);
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
    setDimensionForm([{ label: '', key: '', description: '' }]);
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

    // Filter out empty dimensions
    const validDimensions = dimensionForm.filter(d => d.label && d.key);

    if (editingModel) {
      updateModel.mutate({
        ...modelForm,
        id: editingModel.id,
        dimensions: validDimensions,
      });
    } else {
      createModel.mutate({
        ...modelForm,
        dimensions: validDimensions,
      });
    }
  };

  const addDimension = () => {
    setDimensionForm([...dimensionForm, { label: '', key: '', description: '' }]);
  };

  const removeDimension = (index: number) => {
    setDimensionForm(dimensionForm.filter((_, i) => i !== index));
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
  const publishedModels = models.filter(m => m.status === 'published').length;
  const completionRate = 89; // Would need to calculate from actual data

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
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
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="models" data-testid="tab-models">Models</TabsTrigger>
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
              <span className="text-xs text-muted-foreground">Note: Backend support for model CRUD is coming soon.</span>
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

            <div>
              <div className="flex justify-between items-center mb-2">
                <Label>Dimensions</Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={addDimension}
                  data-testid="button-add-dimension"
                >
                  Add Dimension
                </Button>
              </div>
              <div className="space-y-2">
                {dimensionForm.map((dimension, index) => (
                  <div key={index} className="flex gap-2">
                    <Input
                      value={dimension.label}
                      onChange={(e) => {
                        const newDimensions = [...dimensionForm];
                        newDimensions[index].label = e.target.value;
                        setDimensionForm(newDimensions);
                      }}
                      placeholder="Label (e.g., Strategy)"
                      data-testid={`input-dimension-label-${index}`}
                    />
                    <Input
                      value={dimension.key}
                      onChange={(e) => {
                        const newDimensions = [...dimensionForm];
                        newDimensions[index].key = e.target.value.toLowerCase().replace(/\s+/g, '_');
                        setDimensionForm(newDimensions);
                      }}
                      placeholder="Key (e.g., strategy)"
                      data-testid={`input-dimension-key-${index}`}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => removeDimension(index)}
                      disabled={dimensionForm.length === 1}
                      data-testid={`button-remove-dimension-${index}`}
                    >
                      <Trash className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
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
                {models.filter(m => m.status === 'published').map((model) => (
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

      <Footer />
    </div>
  );
}