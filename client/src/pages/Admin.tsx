import { useState, useCallback, useRef } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuCheckboxItem } from "@/components/ui/dropdown-menu";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Download, Plus, Edit, Trash, FileSpreadsheet, Eye, BarChart3, Settings, FileDown, FileUp, ListOrdered, Users, Star, Upload, X, Sparkles, CheckCircle2, XCircle, Database, FileText, Brain, BookOpen, ClipboardList, Home, Building2, ChevronDown, Shield } from "lucide-react";
import type { Model, Result, Assessment, Dimension, Question, Answer, User } from "@shared/schema";
import { USER_ROLES, type UserRole } from "@shared/constants";
import { useAuth } from "@/hooks/use-auth";
import { ObjectUploader } from "@/components/ObjectUploader";
import { AiAssistant } from "@/components/admin/AiAssistant";
import { AiUsageDashboard } from "@/components/admin/AiUsageDashboard";
import { AiContentReviewQueue } from "@/components/admin/AiContentReviewQueue";
import { ContentManagement } from "@/components/admin/ContentManagement";
import { ImportManager } from "@/components/admin/ImportManager";
import { ImportBatches } from "@/components/admin/ImportBatches";
import { ProxyAssessmentDialog } from "@/components/admin/ProxyAssessmentDialog";
import { TenantManagement } from "@/components/admin/TenantManagement";
import { OAuthApplications } from "@/components/admin/OAuthApplications";
import { ImportExportPanel } from "@/components/admin/ImportExportPanel";
import { ModelBuilder } from "@/components/admin/ModelBuilder";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

// Helper function to normalize legacy role values to new role system
function normalizeRole(role: string | null | undefined): UserRole {
  if (!role) return USER_ROLES.USER;
  
  // Map legacy roles to new roles
  if (role === 'admin') return USER_ROLES.GLOBAL_ADMIN;
  if (role === 'modeler') return USER_ROLES.TENANT_MODELER;
  
  // Return as-is if already a valid new role
  if (role === USER_ROLES.GLOBAL_ADMIN || 
      role === USER_ROLES.TENANT_ADMIN || 
      role === USER_ROLES.TENANT_MODELER || 
      role === USER_ROLES.USER) {
    return role as UserRole;
  }
  
  // Default to user for unknown roles
  return USER_ROLES.USER;
}

// Helper function to check if user has admin permissions
function isAdminUser(user: User | null | undefined): boolean {
  if (!user) return false;
  const normalizedRole = normalizeRole(user.role);
  return normalizedRole === USER_ROLES.GLOBAL_ADMIN || 
         normalizedRole === USER_ROLES.TENANT_ADMIN;
}

// Helper function to check if user can manage models
function canManageModels(user: User | null | undefined): boolean {
  if (!user) return false;
  const normalizedRole = normalizeRole(user.role);
  return normalizedRole === USER_ROLES.GLOBAL_ADMIN || 
         normalizedRole === USER_ROLES.TENANT_ADMIN || 
         normalizedRole === USER_ROLES.TENANT_MODELER;
}

interface AdminResult extends Result {
  assessmentId: string;
  userName?: string;
  company?: string;
  modelName?: string;
  date?: string;
  status?: string;
  isProxy?: boolean;
  proxyName?: string;
  proxyCompany?: string;
}

// Benchmark Configuration Component
function BenchmarkConfig() {
  const { toast } = useToast();
  const [isEditing, setIsEditing] = useState(false);
  const [configForm, setConfigForm] = useState({
    minSampleSizeOverall: 5,
    minSampleSizeIndustry: 10,
    minSampleSizeCompanySize: 10,
    minSampleSizeCountry: 10,
    minSampleSizeIndustryCompanySize: 15,
    includeAnonymous: false,
  });

  const { data: config, isLoading } = useQuery<typeof configForm>({
    queryKey: ['/api/benchmarks/config'],
  });

  const updateConfig = useMutation({
    mutationFn: (data: typeof configForm) =>
      apiRequest('/api/benchmarks/config', 'PUT', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/benchmarks/config'] });
      toast({ title: 'Configuration updated successfully' });
      setIsEditing(false);
    },
    onError: () => {
      toast({ title: 'Failed to update configuration', variant: 'destructive' });
    },
  });

  if (isLoading) return <div>Loading configuration...</div>;

  if (!isEditing && config) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="p-4 border rounded-md">
            <p className="text-sm font-medium">Overall Benchmark</p>
            <p className="text-2xl font-bold">{config.minSampleSizeOverall}</p>
            <p className="text-xs text-muted-foreground">minimum samples</p>
          </div>
          <div className="p-4 border rounded-md">
            <p className="text-sm font-medium">Industry Benchmark</p>
            <p className="text-2xl font-bold">{config.minSampleSizeIndustry}</p>
            <p className="text-xs text-muted-foreground">minimum samples</p>
          </div>
          <div className="p-4 border rounded-md">
            <p className="text-sm font-medium">Company Size Benchmark</p>
            <p className="text-2xl font-bold">{config.minSampleSizeCompanySize}</p>
            <p className="text-xs text-muted-foreground">minimum samples</p>
          </div>
          <div className="p-4 border rounded-md">
            <p className="text-sm font-medium">Country Benchmark</p>
            <p className="text-2xl font-bold">{config.minSampleSizeCountry}</p>
            <p className="text-xs text-muted-foreground">minimum samples</p>
          </div>
          <div className="p-4 border rounded-md col-span-2">
            <p className="text-sm font-medium">Industry + Company Size Benchmark</p>
            <p className="text-2xl font-bold">{config.minSampleSizeIndustryCompanySize}</p>
            <p className="text-xs text-muted-foreground">minimum samples</p>
          </div>
        </div>
        <div className="p-4 border rounded-md">
          <p className="text-sm font-medium">Include Anonymous/Imported Assessments</p>
          <p className="text-2xl font-bold">{config.includeAnonymous ? 'Yes' : 'No'}</p>
          <p className="text-xs text-muted-foreground">
            {config.includeAnonymous 
              ? 'Benchmarks include all assessment data' 
              : 'Benchmarks exclude imported anonymous data'}
          </p>
        </div>
        <Button onClick={() => {
          setConfigForm(config);
          setIsEditing(true);
        }} data-testid="button-edit-benchmark-config">
          <Edit className="mr-2 h-4 w-4" />
          Edit Configuration
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="minSampleSizeOverall">Overall Benchmark (min samples)</Label>
          <Input
            id="minSampleSizeOverall"
            type="number"
            min="1"
            value={configForm.minSampleSizeOverall}
            onChange={(e) => setConfigForm({ ...configForm, minSampleSizeOverall: parseInt(e.target.value) })}
            data-testid="input-min-sample-overall"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="minSampleSizeIndustry">Industry Benchmark (min samples)</Label>
          <Input
            id="minSampleSizeIndustry"
            type="number"
            min="1"
            value={configForm.minSampleSizeIndustry}
            onChange={(e) => setConfigForm({ ...configForm, minSampleSizeIndustry: parseInt(e.target.value) })}
            data-testid="input-min-sample-industry"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="minSampleSizeCompanySize">Company Size Benchmark (min samples)</Label>
          <Input
            id="minSampleSizeCompanySize"
            type="number"
            min="1"
            value={configForm.minSampleSizeCompanySize}
            onChange={(e) => setConfigForm({ ...configForm, minSampleSizeCompanySize: parseInt(e.target.value) })}
            data-testid="input-min-sample-company-size"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="minSampleSizeCountry">Country Benchmark (min samples)</Label>
          <Input
            id="minSampleSizeCountry"
            type="number"
            min="1"
            value={configForm.minSampleSizeCountry}
            onChange={(e) => setConfigForm({ ...configForm, minSampleSizeCountry: parseInt(e.target.value) })}
            data-testid="input-min-sample-country"
          />
        </div>
        <div className="space-y-2 col-span-2">
          <Label htmlFor="minSampleSizeIndustryCompanySize">Industry + Company Size Benchmark (min samples)</Label>
          <Input
            id="minSampleSizeIndustryCompanySize"
            type="number"
            min="1"
            value={configForm.minSampleSizeIndustryCompanySize}
            onChange={(e) => setConfigForm({ ...configForm, minSampleSizeIndustryCompanySize: parseInt(e.target.value) })}
            data-testid="input-min-sample-industry-company-size"
          />
        </div>
      </div>
      <div className="flex items-center space-x-2 p-4 border rounded-md">
        <Switch
          id="includeAnonymous"
          checked={configForm.includeAnonymous}
          onCheckedChange={(checked) => setConfigForm({ ...configForm, includeAnonymous: checked })}
          data-testid="switch-include-anonymous"
        />
        <div className="flex-1">
          <Label htmlFor="includeAnonymous" className="cursor-pointer">
            Include Anonymous/Imported Assessments in Benchmarks
          </Label>
          <p className="text-xs text-muted-foreground mt-1">
            When enabled, benchmarks will include all assessment data including imported/anonymous entries. 
            When disabled, only assessments from registered users with complete profiles are included.
          </p>
        </div>
      </div>
      <div className="flex gap-2">
        <Button onClick={() => setIsEditing(false)} variant="outline" data-testid="button-cancel-benchmark-config">
          Cancel
        </Button>
        <Button onClick={() => updateConfig.mutate(configForm)} data-testid="button-save-benchmark-config">
          Save Configuration
        </Button>
      </div>
    </div>
  );
}

// Benchmarks by Model Component
function BenchmarksByModel() {
  const { toast } = useToast();
  const [selectedModelId, setSelectedModelId] = useState<string>('');

  const { data: models } = useQuery<Model[]>({
    queryKey: ['/api/models'],
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    refetchOnReconnect: false,
  });

  const { data: benchmarks, isLoading: benchmarksLoading } = useQuery<any[]>({
    queryKey: ['/api/benchmarks', selectedModelId, 'all'],
    enabled: !!selectedModelId,
    queryFn: async () => {
      if (!selectedModelId) return [];
      const response = await fetch(`/api/benchmarks/${selectedModelId}/all`, {
        credentials: 'include',
      });
      if (!response.ok) throw new Error('Failed to fetch benchmarks');
      return response.json();
    },
  });

  const calculateBenchmarks = useMutation({
    mutationFn: (modelId: string) =>
      apiRequest(`/api/benchmarks/calculate/${modelId}`, 'POST'),
    onSuccess: async (_data, modelId) => {
      await queryClient.invalidateQueries({ queryKey: ['/api/benchmarks', modelId, 'all'] });
      await queryClient.refetchQueries({ queryKey: ['/api/benchmarks', modelId, 'all'] });
      toast({ title: 'Benchmarks calculated successfully' });
    },
    onError: () => {
      toast({ title: 'Failed to calculate benchmarks', variant: 'destructive' });
    },
  });

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="benchmark-model-select">Select Model</Label>
        <div className="flex gap-2">
          <Select value={selectedModelId} onValueChange={setSelectedModelId}>
            <SelectTrigger id="benchmark-model-select" data-testid="select-benchmark-model">
              <SelectValue placeholder="Choose a model" />
            </SelectTrigger>
            <SelectContent>
              {models?.map((model) => (
                <SelectItem key={model.id} value={model.id}>
                  {model.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {selectedModelId && (
            <Button
              onClick={() => calculateBenchmarks.mutate(selectedModelId)}
              disabled={calculateBenchmarks.isPending}
              data-testid="button-calculate-benchmarks"
            >
              <BarChart3 className="mr-2 h-4 w-4" />
              {calculateBenchmarks.isPending ? 'Calculating...' : 'Calculate Benchmarks'}
            </Button>
          )}
        </div>
      </div>

      {selectedModelId && benchmarksLoading && (
        <Card className="p-6">
          <p className="text-muted-foreground">Loading benchmarks...</p>
        </Card>
      )}

      {selectedModelId && !benchmarksLoading && (!benchmarks || benchmarks.length === 0) && (
        <Card className="p-6">
          <div className="text-center space-y-4">
            <BarChart3 className="h-12 w-12 mx-auto text-muted-foreground" />
            <div>
              <h3 className="font-semibold mb-2">No Benchmarks Available</h3>
              <p className="text-muted-foreground text-sm">
                No benchmarks have been calculated for this model yet. Click "Calculate Benchmarks" above to generate them from existing assessment data.
              </p>
            </div>
          </div>
        </Card>
      )}

      {selectedModelId && !benchmarksLoading && benchmarks && benchmarks.length > 0 && (
        <div className="space-y-4">
          <Card className="p-6">
            <div className="mb-4">
              <h3 className="font-semibold mb-1">Benchmark Data</h3>
              <p className="text-sm text-muted-foreground">
                {benchmarks.length} benchmark segment{benchmarks.length !== 1 ? 's' : ''} calculated
              </p>
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Segment Type</TableHead>
                  <TableHead>Industry</TableHead>
                  <TableHead>Company Size</TableHead>
                  <TableHead>Country</TableHead>
                  <TableHead className="text-right">Mean Score</TableHead>
                  <TableHead className="text-right">Sample Size</TableHead>
                  <TableHead>Updated At</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {benchmarks.map((benchmark: any) => (
                  <TableRow key={benchmark.id} data-testid={`benchmark-row-${benchmark.id}`}>
                    <TableCell>
                      <Badge variant={benchmark.segmentType === 'overall' ? 'default' : 'secondary'}>
                        {benchmark.segmentType.replace(/_/g, ' ')}
                      </Badge>
                    </TableCell>
                    <TableCell>{benchmark.industry || '-'}</TableCell>
                    <TableCell>{benchmark.companySize || '-'}</TableCell>
                    <TableCell>{benchmark.country || '-'}</TableCell>
                    <TableCell className="font-bold text-right">{Math.round(benchmark.meanScore)}</TableCell>
                    <TableCell className="text-right">{benchmark.sampleSize}</TableCell>
                    <TableCell>{new Date(benchmark.updatedAt).toLocaleDateString()}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </div>
      )}
    </div>
  );
}

export default function Admin() {
  const { toast } = useToast();
  const { user: currentUser } = useAuth();
  const [activeSection, setActiveSection] = useState<string>('models');
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
    visibility: 'public' as 'public' | 'private',
    ownerTenantId: null as string | null, // Kept for backward compatibility
    tenantIds: [] as string[], // Multi-tenant support
    modelClass: 'organizational' as 'organizational' | 'individual',
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
    role: 'user' as 'user' | 'tenant_modeler' | 'tenant_admin' | 'global_admin',
    username: '',
    newPassword: '',
    tenantId: '' as string | null,
  });
  const [selectedTenantFilter, setSelectedTenantFilter] = useState<string>('all');
  const [csvImportMode, setCSVImportMode] = useState<'add' | 'replace'>('add');
  const [isCSVImportDialogOpen, setIsCSVImportDialogOpen] = useState(false);
  const [pendingCSVFile, setPendingCSVFile] = useState<{file: File; modelId: string} | null>(null);
  const [isModelImportDialogOpen, setIsModelImportDialogOpen] = useState(false);
  const [pendingModelFile, setPendingModelFile] = useState<{file: File; modelData: any} | null>(null);
  const [modelImportName, setModelImportName] = useState('');
  const [modelImportSlug, setModelImportSlug] = useState('');
  
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
  
  // Analytical export state
  const [showAnalyticalExport, setShowAnalyticalExport] = useState(false);
  const [selectedExportModel, setSelectedExportModel] = useState<string>('');

  // Knowledge base state
  const [knowledgeScope, setKnowledgeScope] = useState<'company-wide' | 'model-specific'>('company-wide');
  const [knowledgeModelId, setKnowledgeModelId] = useState<string>('');
  const [knowledgeDescription, setKnowledgeDescription] = useState<string>('');
  const [knowledgeFilter, setKnowledgeFilter] = useState<'all' | 'company-wide' | 'model-specific'>('all');
  
  // AI Cache management state
  const [showCacheDialog, setShowCacheDialog] = useState(false);
  const [cacheClearModelId, setCacheClearModelId] = useState<string>('');
  
  // Delete data confirmation dialog state
  const [isDeleteDataDialogOpen, setIsDeleteDataDialogOpen] = useState(false);
  const [deleteDataModelId, setDeleteDataModelId] = useState<string | null>(null);
  const [deleteDataModelName, setDeleteDataModelName] = useState<string>('');
  const [deleteDataConfirmation, setDeleteDataConfirmation] = useState<string>('');
  
  // Import/Export panel state
  const [isImportExportOpen, setIsImportExportOpen] = useState(false);
  const [importExportModel, setImportExportModel] = useState<Model | null>(null);

  // Fetch models with counts
  const { data: models = [], isLoading: modelsLoading } = useQuery<Array<Model & { dimensionCount?: number; questionCount?: number }>>({
    queryKey: ['/api/admin/models'],
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    refetchOnReconnect: false,
  });

  // Fetch tenants for model visibility dropdown (role-aware)
  const { data: availableTenants = [] } = useQuery<Array<{id: string, name: string}>>({
    queryKey: ['/api/model-tenants'],
    enabled: canManageModels(currentUser),
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    refetchOnReconnect: false,
  });

  // Fetch tenant assignments for the currently editing model
  const { data: modelTenantAssignments = [] } = useQuery<Array<{modelId: string, tenantId: string}>>({
    queryKey: ['/api/models', editingModel?.id, 'tenants'],
    queryFn: async () => {
      if (!editingModel?.id) return [];
      const response = await fetch(`/api/models/${editingModel.id}/tenants`);
      return response.ok ? response.json() : [];
    },
    enabled: !!editingModel?.id,
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

  // Results filters state
  const [resultsStartDate, setResultsStartDate] = useState(() => {
    const date = new Date();
    date.setDate(date.getDate() - 30); // Default to last 30 days
    return date.toISOString().split('T')[0];
  });
  const [resultsEndDate, setResultsEndDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [resultsStatus, setResultsStatus] = useState<string>('completed'); // Default to completed only

  // Fetch all assessments with results
  const { data: results = [], isLoading: resultsLoading } = useQuery<AdminResult[]>({
    queryKey: ['/api/admin/results', resultsStartDate, resultsEndDate, resultsStatus],
    queryFn: async () => {
      // Build query params
      const params = new URLSearchParams();
      if (resultsStartDate) params.append('startDate', resultsStartDate);
      if (resultsEndDate) params.append('endDate', resultsEndDate);
      if (resultsStatus) params.append('status', resultsStatus);
      
      // Fetch all assessments with user data (admin endpoint) with filters
      const assessments = await fetch(`/api/admin/assessments?${params.toString()}`).then(r => r.json());
      
      // Fetch results and models for each assessment
      const resultsWithDetails = await Promise.all(
        assessments.map(async (assessment: any) => {
          try {
            const [result, model] = await Promise.all([
              fetch(`/api/results/${assessment.id}`).then(r => r.ok ? r.json() : null),
              fetch(`/api/models/by-id/${assessment.modelId}`).then(r => r.json()),
            ]);
            
            if (result) {
              return {
                ...result,
                assessmentId: assessment.id,
                status: assessment.status,
                modelName: model?.name || 'Unknown Model',
                userName: assessment.user?.name || null,
                company: assessment.user?.company || null,
                date: assessment.startedAt ? new Date(assessment.startedAt).toISOString() : new Date().toISOString(),
                isProxy: assessment.isProxy || false,
                proxyName: assessment.proxyName || null,
                proxyCompany: assessment.proxyCompany || null,
              };
            }
          } catch {
            return null;
          }
        })
      );
      
      // Sort by date descending (most recent first)
      const filtered = resultsWithDetails.filter(Boolean);
      return filtered.sort((a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime());
    },
  });

  // Fetch all users (admin only)
  const { data: users = [], isLoading: usersLoading } = useQuery<Omit<User, 'password'>[]>({
    queryKey: ['/api/users'],
    enabled: isAdminUser(currentUser),
  });

  // Fetch all tenants (admin only)
  const { data: tenants = [] } = useQuery<any[]>({
    queryKey: ['/api/tenants'],
    enabled: isAdminUser(currentUser),
  });

  // Filter users by tenant
  const filteredUsers = selectedTenantFilter === 'all' 
    ? users 
    : selectedTenantFilter === 'none'
    ? users.filter(u => !u.tenantId)
    : users.filter(u => u.tenantId === selectedTenantFilter);

  // Fetch pending AI reviews count
  const { data: pendingReviews = [] } = useQuery<any[]>({
    queryKey: ['/api/admin/ai/pending-reviews'],
    enabled: canManageModels(currentUser),
  });

  // Fetch AI cache statistics
  const { data: cacheStats, refetch: refetchCacheStats } = useQuery<{
    total: number;
    valid: number;
    expired: number;
    byType: Record<string, number>;
  }>({
    queryKey: ['/api/admin/ai/cache-stats'],
    enabled: isAdminUser(currentUser),
  });

  // Update user mutation
  const updateUser = useMutation({
    mutationFn: async (data: { id: string; role: string; username?: string; newPassword?: string }) => {
      return apiRequest(`/api/users/${data.id}`, 'PUT', { 
        role: data.role,
        username: data.username,
        newPassword: data.newPassword,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/users'] });
      setIsUserDialogOpen(false);
      toast({
        title: "User updated",
        description: "User has been updated successfully.",
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

  // Clear AI cache mutation
  const clearAICache = useMutation({
    mutationFn: async (modelId?: string) => {
      const url = modelId ? `/api/admin/ai/cache?modelId=${modelId}` : '/api/admin/ai/cache';
      return apiRequest(url, 'DELETE');
    },
    onSuccess: (data: any) => {
      refetchCacheStats();
      toast({
        title: "Cache cleared",
        description: data.message || "AI cache has been cleared. New assessments will generate fresh content.",
      });
      setShowCacheDialog(false);
      setCacheClearModelId('');
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to clear AI cache",
        variant: "destructive",
      });
    },
  });

  // Verify user email mutation (admin only)
  const verifyUserEmail = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest(`/api/admin/users/${id}/verify-email`, 'PUT');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/users'] });
      toast({
        title: "Email verified",
        description: "User's email has been manually verified.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to verify email",
        variant: "destructive",
      });
    },
  });

  // Assign user to tenant mutation
  const assignUserToTenant = useMutation({
    mutationFn: async (data: { userId: string; tenantId: string | null }) => {
      return apiRequest(`/api/users/${data.userId}/tenant`, 'PATCH', { tenantId: data.tenantId });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/users'] });
      toast({
        title: "Tenant updated",
        description: "User tenant assignment has been updated successfully.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update tenant assignment",
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
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/models'] });
      
      // If we're in ModelBuilder mode (editingModel is set), don't close the dialog
      // Just update the editingModel state to reflect the changes
      if (editingModel) {
        setEditingModel(prev => prev ? { ...prev, ...data } : prev);
      } else {
        // Only close and reset if we're in the model dialog (not ModelBuilder)
        setIsModelDialogOpen(false);
        resetModelForm();
        toast({
          title: "Model updated",
          description: "The model has been updated successfully.",
        });
      }
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
        // Also update editingModel if we're in ModelBuilder mode
        if (editingModel) {
          setEditingModel(prev => prev ? { ...prev, imageUrl: data.imageUrl } : prev);
        }
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
      // Also update editingModel if we're in ModelBuilder mode
      if (editingModel) {
        setEditingModel(prev => prev ? { ...prev, imageUrl: '' } : prev);
      }
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

  // Memoized upload handlers to prevent re-renders on every keystroke
  const handleGetUploadParameters = useCallback(async () => {
    const response = await fetch('/api/objects/upload', {
      method: 'POST',
      credentials: 'include',
    });
    const data = await response.json();
    return {
      method: 'PUT' as const,
      url: data.uploadURL,
    };
  }, []);

  const handleUploadComplete = useCallback((result: any) => {
    console.log('Upload complete:', result);
    if (result.successful && result.successful[0]) {
      const uploadURL = result.successful[0].uploadURL;
      console.log('Upload URL:', uploadURL);
      console.log('Editing model:', editingModel);
      if (uploadURL && editingModel) {
        console.log('Calling uploadModelImage mutation');
        uploadModelImage.mutate({
          modelId: editingModel.id,
          imageUrl: uploadURL,
        });
      } else if (uploadURL && !editingModel) {
        console.error('editingModel is null, cannot save image URL');
      }
    } else {
      console.log('Upload result missing successful files');
    }
  }, [editingModel, uploadModelImage.mutate]);

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

  // Delete all assessment data for a model mutation
  const deleteAssessmentData = useMutation({
    mutationFn: async (modelId: string) => {
      return apiRequest(`/api/models/${modelId}/assessment-data`, 'DELETE');
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['/api/results'] });
      queryClient.invalidateQueries({ queryKey: ['/api/benchmarks'] });
      toast({
        title: "Assessment data deleted",
        description: data.message || "All assessment data has been removed successfully.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to delete assessment data",
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
    onError: (error: Error) => {
      console.error('Question creation error:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to create question.",
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
    onError: (error: Error) => {
      console.error('Question update error:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to update question.",
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

  // Fetch knowledge documents
  const { data: knowledgeDocuments = [], isLoading: knowledgeDocsLoading, error: knowledgeDocsError, refetch: refetchKnowledgeDocs } = useQuery<Array<{
    id: string;
    name: string;
    fileUrl: string;
    fileSize: number;
    fileType: string;
    scope: string;
    modelId: string | null;
    description: string | null;
    uploadedAt: string;
  }>>({
    queryKey: ['/api/knowledge/documents', knowledgeFilter],
    queryFn: async () => {
      try {
        let url = '/api/knowledge/documents';
        if (knowledgeFilter !== 'all') {
          url += `?scope=${knowledgeFilter}`;
        }
        const response = await fetch(url, {
          credentials: 'include',
        });
        if (!response.ok) {
          throw new Error(`Failed to fetch knowledge documents: ${response.statusText}`);
        }
        return response.json();
      } catch (error) {
        console.error('Knowledge documents fetch error:', error);
        throw error;
      }
    },
  });

  // Upload knowledge document mutation
  const uploadKnowledgeDoc = useMutation({
    mutationFn: async ({ file, scope, modelId, description }: {
      file: File;
      scope: 'company-wide' | 'model-specific';
      modelId?: string;
      description?: string;
    }) => {
      // Step 1: Get presigned upload URL
      const uploadUrlResponse = await fetch('/api/knowledge/upload-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
      });
      
      if (!uploadUrlResponse.ok) {
        const error = await uploadUrlResponse.json();
        throw new Error(error.message || 'Failed to get upload URL');
      }
      
      const { uploadURL } = await uploadUrlResponse.json();
      
      // Step 2: Upload file to presigned URL
      const uploadResponse = await fetch(uploadURL, {
        method: 'PUT',
        body: file,
        headers: {
          'Content-Type': file.type || 'application/octet-stream',
        },
      });
      
      if (!uploadResponse.ok) {
        throw new Error('Failed to upload file');
      }
      
      // Step 3: Create document metadata
      // Extract file extension from filename (e.g., "document.docx" -> "docx")
      const fileExtension = file.name.split('.').pop()?.toLowerCase() || '';
      
      return apiRequest('/api/knowledge/documents', 'POST', {
        name: file.name,
        fileUrl: uploadURL.split('?')[0], // Remove query params
        fileSize: file.size,
        fileType: fileExtension, // Send file extension, not MIME type
        scope,
        modelId: scope === 'model-specific' ? modelId : null,
        description: description || null,
      });
    },
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['/api/knowledge/documents'] });
      refetchKnowledgeDocs();
      toast({
        title: "Document uploaded",
        description: `${variables.file.name} has been uploaded successfully.`,
      });
      // Reset form
      setKnowledgeScope('company-wide');
      setKnowledgeModelId('');
      setKnowledgeDescription('');
    },
    onError: (error: Error) => {
      toast({
        title: "Upload failed",
        description: error.message || "Failed to upload document",
        variant: "destructive",
      });
    },
  });

  // Delete knowledge document mutation
  const deleteKnowledgeDoc = useMutation({
    mutationFn: async (documentId: string) => {
      return apiRequest(`/api/knowledge/documents/${documentId}`, 'DELETE');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/knowledge/documents'] });
      refetchKnowledgeDocs();
      toast({
        title: "Document deleted",
        description: "The document has been removed successfully.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to delete document",
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
      visibility: 'public',
      ownerTenantId: null,
      tenantIds: [],
      modelClass: 'organizational',
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

  const handleEditModel = async (model: Model) => {
    setEditingModel(model);
    setSelectedModelId(model.id);
    setActiveSection('model-builder');
  };

  const handleSaveModel = async () => {
    // Validate form
    if (!modelForm.name || !modelForm.slug) {
      toast({
        title: "Validation Error",
        description: "Name and slug are required.",
        variant: "destructive",
      });
      return;
    }

    // Validate visibility and tenant assignment
    if (modelForm.visibility === 'private' && modelForm.tenantIds.length === 0) {
      toast({
        title: "Validation Error",
        description: "Private models must be assigned to at least one tenant.",
        variant: "destructive",
      });
      return;
    }

    // Prepare submission data
    const submissionData = {
      ...modelForm,
      // Set ownerTenantId to first selected tenant for backward compatibility
      ownerTenantId: modelForm.visibility === 'public' ? null : (modelForm.tenantIds[0] || null),
    };

    try {
      // Create or update the model
      const savedModel = editingModel
        ? await apiRequest(`/api/models/${editingModel.id}`, 'PUT', submissionData)
        : await apiRequest('/api/models', 'POST', submissionData);
      
      // Sync tenant assignments via junction table (for private models only)
      if (modelForm.visibility === 'private' && modelForm.tenantIds.length > 0) {
        const modelId = savedModel.id;
        
        // Fetch current tenant assignments
        const currentResponse = await fetch(`/api/models/${modelId}/tenants`);
        const currentTenants = currentResponse.ok ? await currentResponse.json() : [];
        const currentTenantIds = currentTenants.map((t: any) => t.tenantId);
        
        // Determine which tenants to add and remove
        const tenantsToAdd = modelForm.tenantIds.filter(id => !currentTenantIds.includes(id));
        const tenantsToRemove = currentTenantIds.filter((id: string) => !modelForm.tenantIds.includes(id));
        
        // Add new tenant assignments
        for (const tenantId of tenantsToAdd) {
          await apiRequest(`/api/models/${modelId}/tenants`, 'POST', { tenantId });
        }
        
        // Remove old tenant assignments
        for (const tenantId of tenantsToRemove) {
          await apiRequest(`/api/models/${modelId}/tenants/${tenantId}`, 'DELETE');
        }
      }
      
      // Refresh models list and close dialog
      queryClient.invalidateQueries({ queryKey: ['/api/models'] });
      setIsModelDialogOpen(false);
      resetModelForm();
      
      toast({
        title: editingModel ? "Model updated" : "Model created",
        description: editingModel 
          ? `${savedModel.name} has been updated successfully.`
          : `${savedModel.name} has been created successfully.`,
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to save model",
        variant: "destructive",
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

  // Export complete model definition as .model JSON file
  const exportModelDefinition = async (modelId: string) => {
    try {
      const response = await fetch(`/api/models/${modelId}/export-model`);
      if (!response.ok) throw new Error('Export failed');
      
      const data = await response.json();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = window.URL.createObjectURL(blob);
      const model = models.find(m => m.id === modelId);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${model?.slug || 'model'}.model`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
      
      toast({
        title: "Export successful",
        description: `Model definition exported successfully.`,
      });
    } catch (error) {
      toast({
        title: "Export failed",
        description: "Failed to export model definition. Please try again.",
        variant: "destructive",
      });
    }
  };

  // Export interview guide as markdown
  const exportInterviewGuide = async (modelId: string) => {
    try {
      const response = await fetch(`/api/models/${modelId}/export-interview`);
      if (!response.ok) throw new Error('Export failed');
      
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const model = models.find(m => m.id === modelId);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${model?.slug || 'model'}-interview-guide.md`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
      
      toast({
        title: "Export successful",
        description: `Interview guide exported successfully.`,
      });
    } catch (error) {
      toast({
        title: "Export failed",
        description: "Failed to export interview guide. Please try again.",
        variant: "destructive",
      });
    }
  };

  // Import complete model definition from .model JSON file
  const handleModelImportClick = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.model';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) {
        try {
          const content = await file.text();
          const modelData = JSON.parse(content);
          setPendingModelFile({ file, modelData });
          setIsModelImportDialogOpen(true);
        } catch (error) {
          toast({
            title: "Invalid file",
            description: "Failed to parse .model file. Please check the file format.",
            variant: "destructive",
          });
        }
      }
    };
    input.click();
  };

  const handleConfirmModelImport = async () => {
    if (!pendingModelFile) return;
    
    try {
      const response = await fetch('/api/models/import-model', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          modelData: pendingModelFile.modelData,
          newName: modelImportName || undefined,
          newSlug: modelImportSlug || undefined,
        }),
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Import failed');
      }
      
      const result = await response.json();
      queryClient.invalidateQueries({ queryKey: ['/api/models'] });
      
      toast({
        title: "Import successful",
        description: `Model imported with ${result.stats.dimensionsCreated} dimensions, ${result.stats.questionsCreated} questions, and ${result.stats.answersCreated} answers.`,
      });
      
      setIsModelImportDialogOpen(false);
      setPendingModelFile(null);
      setModelImportName('');
      setModelImportSlug('');
    } catch (error) {
      toast({
        title: "Import failed",
        description: error instanceof Error ? error.message : "Failed to import model. Please check the file format.",
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

  const handleAnalyticalExport = async () => {
    if (!selectedExportModel) {
      toast({
        title: "No model selected",
        description: "Please select a model to export.",
        variant: "destructive",
      });
      return;
    }

    try {
      const model = models.find(m => m.id === selectedExportModel);
      if (!model) return;

      // Call the analytical export endpoint
      const response = await fetch(`/api/admin/export/model/${model.slug}/analysis`);
      
      if (!response.ok) {
        throw new Error('Export failed');
      }

      // Download the JSON file
      const data = await response.json();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${model.slug}-analysis-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);

      toast({
        title: "Export successful",
        description: `Exported ${model.name} data for analysis.`,
      });

      setShowAnalyticalExport(false);
      setSelectedExportModel('');
    } catch (error) {
      toast({
        title: "Export failed",
        description: "Failed to export analytical data.",
        variant: "destructive",
      });
    }
  };

  // Calculate statistics
  const totalAssessments = results.length;
  const averageScore = totalAssessments > 0 
    ? Math.round(results.reduce((acc, r) => acc + r.overallScore, 0) / totalAssessments)
    : 0;
  const publishedModels = models.filter(m => m.status !== 'draft').length;
  const completionRate = 89; // Would need to calculate from actual data

  const sidebarWidth = {
    "--sidebar-width": "16rem",
    "--sidebar-width-icon": "4rem",
  };

  return (
    <TooltipProvider delayDuration={0}>
      <SidebarProvider style={sidebarWidth as React.CSSProperties} defaultOpen={true}>
        <div className="flex h-screen w-full overflow-hidden">
          <Sidebar collapsible="icon">
            <SidebarContent>
              {/* Add spacer to align with Admin Console heading */}
              <div className="h-16" />
              
              {/* Models Navigation */}
              <SidebarGroup>
                <SidebarGroupLabel>Models</SidebarGroupLabel>
                <SidebarGroupContent>
                  <SidebarMenu>
                    <SidebarMenuItem>
                      <SidebarMenuButton 
                        onClick={() => setActiveSection('models')}
                        isActive={activeSection === 'models'}
                        data-testid="tab-models"
                        tooltip="All Models"
                      >
                        <Home className="h-4 w-4" />
                        <span className="group-data-[collapsible=icon]:hidden">All Models</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                    <SidebarMenuItem>
                      <SidebarMenuButton 
                        onClick={() => setActiveSection('dimensions')}
                        isActive={activeSection === 'dimensions'}
                        data-testid="tab-dimensions"
                        tooltip="Dimensions"
                      >
                        <BarChart3 className="h-4 w-4" />
                        <span className="group-data-[collapsible=icon]:hidden">Dimensions</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                    <SidebarMenuItem>
                      <SidebarMenuButton 
                        onClick={() => setActiveSection('questions')}
                        isActive={activeSection === 'questions'}
                        data-testid="tab-questions"
                        tooltip="Questions"
                      >
                        <FileText className="h-4 w-4" />
                        <span className="group-data-[collapsible=icon]:hidden">Questions</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  </SidebarMenu>
                </SidebarGroupContent>
              </SidebarGroup>

            <SidebarGroup>
              <SidebarGroupLabel>Data</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  <SidebarMenuItem>
                    <SidebarMenuButton 
                      onClick={() => setActiveSection('results')}
                      isActive={activeSection === 'results'}
                      data-testid="tab-results"
                      tooltip="Results"
                    >
                      <Eye className="h-4 w-4" />
                      <span className="group-data-[collapsible=icon]:hidden">Results</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                  <SidebarMenuItem>
                    <SidebarMenuButton 
                      onClick={() => setActiveSection('benchmarks')}
                      isActive={activeSection === 'benchmarks'}
                      data-testid="tab-benchmarks"
                      tooltip="Benchmarks"
                    >
                      <BarChart3 className="h-4 w-4" />
                      <span className="group-data-[collapsible=icon]:hidden">Benchmarks</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                  <SidebarMenuItem>
                    <SidebarMenuButton 
                      onClick={() => setActiveSection('import')}
                      isActive={activeSection === 'import'}
                      data-testid="tab-import"
                      tooltip="Import Data"
                    >
                      <Upload className="h-4 w-4" />
                      <span className="group-data-[collapsible=icon]:hidden">Import</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                  <SidebarMenuItem>
                    <SidebarMenuButton 
                      onClick={() => setActiveSection('audit')}
                      isActive={activeSection === 'audit'}
                      data-testid="tab-audit"
                      tooltip="Audit Log"
                    >
                      <ClipboardList className="h-4 w-4" />
                      <span className="group-data-[collapsible=icon]:hidden">Audit Log</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>

            <SidebarGroup>
              <SidebarGroupLabel>Content</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  <SidebarMenuItem>
                    <SidebarMenuButton 
                      onClick={() => setActiveSection('content')}
                      isActive={activeSection === 'content'}
                      data-testid="tab-content"
                      tooltip="Content"
                    >
                      <BookOpen className="h-4 w-4" />
                      <span className="group-data-[collapsible=icon]:hidden">Content</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                  <SidebarMenuItem>
                    <SidebarMenuButton 
                      onClick={() => setActiveSection('knowledge')}
                      isActive={activeSection === 'knowledge'}
                      data-testid="tab-knowledge"
                      tooltip="Knowledge Base"
                    >
                      <FileText className="h-4 w-4" />
                      <span className="group-data-[collapsible=icon]:hidden">Knowledge Base</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                  <SidebarMenuItem>
                    <SidebarMenuButton 
                      onClick={() => setActiveSection('ai-review')}
                      isActive={activeSection === 'ai-review'}
                      data-testid="tab-ai-review"
                      tooltip="AI Review"
                    >
                      <Sparkles className="h-4 w-4" />
                      <span className="group-data-[collapsible=icon]:hidden">AI Review</span>
                      {pendingReviews.length > 0 && (
                        <Badge variant="secondary" className="ml-auto" data-testid="badge-pending-reviews">
                          {pendingReviews.length}
                        </Badge>
                      )}
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>

            <SidebarGroup>
              <SidebarGroupLabel>AI Tools</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  <SidebarMenuItem>
                    <SidebarMenuButton 
                      onClick={() => setActiveSection('ai-usage')}
                      isActive={activeSection === 'ai-usage'}
                      data-testid="tab-ai-usage"
                      tooltip="AI Usage"
                    >
                      <Brain className="h-4 w-4" />
                      <span className="group-data-[collapsible=icon]:hidden">AI Usage</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>

            {isAdminUser(currentUser) && (
              <SidebarGroup>
                <SidebarGroupLabel>Users</SidebarGroupLabel>
                <SidebarGroupContent>
                  <SidebarMenu>
                    <SidebarMenuItem>
                      <SidebarMenuButton 
                        onClick={() => setActiveSection('users')}
                        isActive={activeSection === 'users'}
                        data-testid="tab-users"
                        tooltip="Users"
                      >
                        <Users className="h-4 w-4" />
                        <span className="group-data-[collapsible=icon]:hidden">Users</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  </SidebarMenu>
                </SidebarGroupContent>
              </SidebarGroup>
            )}

            {isAdminUser(currentUser) && currentUser && normalizeRole(currentUser.role) === USER_ROLES.GLOBAL_ADMIN && (
              <SidebarGroup>
                <SidebarGroupLabel>System</SidebarGroupLabel>
                <SidebarGroupContent>
                  <SidebarMenu>
                    <SidebarMenuItem>
                      <SidebarMenuButton 
                        onClick={() => setActiveSection('tenants')}
                        isActive={activeSection === 'tenants'}
                        data-testid="tab-tenants"
                        tooltip="Tenants"
                      >
                        <Building2 className="h-4 w-4" />
                        <span className="group-data-[collapsible=icon]:hidden">Tenants</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                    <SidebarMenuItem>
                      <SidebarMenuButton 
                        onClick={() => setActiveSection('oauth-applications')}
                        isActive={activeSection === 'oauth-applications'}
                        data-testid="tab-oauth-applications"
                        tooltip="OAuth Applications"
                      >
                        <Shield className="h-4 w-4" />
                        <span className="group-data-[collapsible=icon]:hidden">OAuth Apps</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  </SidebarMenu>
                </SidebarGroupContent>
              </SidebarGroup>
            )}
          </SidebarContent>
        </Sidebar>

        <div className="flex flex-col flex-1 overflow-hidden">
          <header className="flex items-center justify-between p-4 border-b flex-shrink-0">
            <div className="flex items-center gap-4">
              <SidebarTrigger data-testid="button-sidebar-toggle" />
              <h1 className="text-2xl font-bold">Admin Console</h1>
            </div>
            <div className="flex items-center gap-2">
              <ProxyAssessmentDialog models={models} />
              <Button 
                variant="outline" 
                data-testid="button-import-export"
                onClick={() => {
                  setImportExportModel(selectedModelId ? models.find(m => m.id === selectedModelId) || null : null);
                  setIsImportExportOpen(true);
                }}
              >
                <FileSpreadsheet className="mr-2 h-4 w-4" />
                Import/Export
              </Button>
              <Button 
                variant="outline" 
                data-testid="button-settings"
                onClick={() => setIsSettingsDialogOpen(true)}
              >
                <Settings className="mr-2 h-4 w-4" />
                Settings
              </Button>
            </div>
          </header>

          <main className="flex-1 overflow-y-auto overflow-x-hidden p-6">
            <div className="w-full max-w-7xl mx-auto space-y-6">
              {activeSection === 'models' && (
              <div className="space-y-6">
                <div className="flex justify-between items-center">
                  <div>
                    <h2 className="text-2xl font-bold">Models</h2>
                    <p className="text-sm text-muted-foreground mt-1">
                      Manage assessment models, dimensions, and questions
                    </p>
                  </div>
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

                {modelsLoading ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {[1, 2, 3].map((i) => (
                      <Card key={i} className="p-6">
                        <div className="animate-pulse space-y-4">
                          <div className="h-4 bg-muted rounded w-3/4"></div>
                          <div className="h-3 bg-muted rounded w-1/2"></div>
                          <div className="flex gap-2">
                            <div className="h-8 bg-muted rounded w-16"></div>
                            <div className="h-8 bg-muted rounded w-16"></div>
                          </div>
                        </div>
                      </Card>
                    ))}
                  </div>
                ) : models.length === 0 ? (
                  <Card className="p-12">
                    <div className="text-center space-y-3">
                      <Database className="h-12 w-12 mx-auto text-muted-foreground" />
                      <h3 className="text-lg font-semibold">No models found</h3>
                      <p className="text-sm text-muted-foreground">
                        Create your first assessment model to get started
                      </p>
                    </div>
                  </Card>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {models.map((model) => {
                      const dimensionCount = model.dimensionCount || 0;
                      const questionCount = model.questionCount || 0;
                      const assessmentCount = results.filter((r: AdminResult) => r.modelName === model.name).length;

                      return (
                        <Card key={model.id} className="p-6 hover-elevate" data-testid={`model-card-${model.id}`}>
                          <div className="space-y-4">
                            <div className="space-y-2">
                              <div className="flex items-start justify-between gap-2">
                                <div className="flex-1 min-w-0">
                                  <h3 className="font-semibold text-lg truncate" title={model.name}>
                                    {model.name}
                                  </h3>
                                  <p className="text-sm text-muted-foreground truncate" title={model.slug}>
                                    /{model.slug}
                                  </p>
                                </div>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => toggleFeatured.mutate({ modelId: model.id, featured: !model.featured })}
                                  data-testid={`button-toggle-featured-${model.id}`}
                                  title={model.featured ? "Remove from featured" : "Mark as featured"}
                                  className="flex-shrink-0"
                                >
                                  <Star className={`h-4 w-4 ${model.featured ? 'fill-yellow-500 text-yellow-500' : 'text-muted-foreground'}`} />
                                </Button>
                              </div>

                              <div className="flex gap-2 flex-wrap">
                                <Badge variant={model.status === 'published' ? 'default' : 'secondary'}>
                                  {model.status || 'draft'}
                                </Badge>
                                {model.featured && (
                                  <Badge variant="outline" className="bg-yellow-500/10 text-yellow-700 dark:text-yellow-400 border-yellow-500/20">
                                    <Star className="h-3 w-3 mr-1 fill-current" />
                                    Featured
                                  </Badge>
                                )}
                                {model.visibility === 'private' && (
                                  <Badge variant="outline">
                                    Private
                                  </Badge>
                                )}
                              </div>
                            </div>

                            <div className="grid grid-cols-3 gap-3 py-3 border-y">
                              <div className="text-center">
                                <div className="text-2xl font-bold">{dimensionCount}</div>
                                <div className="text-xs text-muted-foreground">Dimensions</div>
                              </div>
                              <div className="text-center">
                                <div className="text-2xl font-bold">{questionCount}</div>
                                <div className="text-xs text-muted-foreground">Questions</div>
                              </div>
                              <div className="text-center">
                                <div className="text-2xl font-bold">{assessmentCount}</div>
                                <div className="text-xs text-muted-foreground">Assessments</div>
                              </div>
                            </div>

                            <div className="flex gap-2">
                              <Button
                                variant="default"
                                size="sm"
                                onClick={() => handleEditModel(model)}
                                data-testid={`button-edit-${model.id}`}
                                className="flex-1"
                              >
                                <Edit className="mr-2 h-3 w-3" />
                                Edit
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                  setImportExportModel(model);
                                  setIsImportExportOpen(true);
                                }}
                                data-testid={`button-import-export-${model.id}`}
                                className="flex-1"
                              >
                                <FileSpreadsheet className="mr-2 h-3 w-3" />
                                Import/Export
                              </Button>
                            </div>

                            <div className="flex gap-1">
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => window.open(`/${model.slug}`, '_blank')}
                                data-testid={`button-view-${model.id}`}
                                title="View model"
                              >
                                <Eye className="h-4 w-4" />
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
                                title="Edit maturity scale"
                              >
                                <BarChart3 className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => exportInterviewGuide(model.id)}
                                data-testid={`button-export-interview-${model.id}`}
                                title="Export Interview Guide (Markdown)"
                              >
                                <FileText className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => {
                                  setDeleteDataModelId(model.id);
                                  setDeleteDataModelName(model.name);
                                  setDeleteDataConfirmation('');
                                  setIsDeleteDataDialogOpen(true);
                                }}
                                data-testid={`button-delete-data-${model.id}`}
                                title="Delete all assessment data (for testing)"
                              >
                                <Database className="h-4 w-4 text-destructive" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => {
                                  if (confirm(`Are you sure you want to delete the model "${model.name}"? This will remove all questions, dimensions, and assessment data permanently.`)) {
                                    deleteModel.mutate(model.id);
                                  }
                                }}
                                data-testid={`button-delete-${model.id}`}
                                title="Delete model"
                              >
                                <Trash className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>
                        </Card>
                      );
                    })}
                  </div>
                )}
              </div>
              )}

              {/* Model Builder */}
              {activeSection === 'model-builder' && editingModel && (
                <div className="space-y-4">
                  <div className="flex items-center gap-4">
                    <Button
                      variant="ghost"
                      onClick={() => {
                        setActiveSection('models');
                        setEditingModel(null);
                      }}
                      data-testid="button-back-to-models"
                    >
                      ← Back to Models
                    </Button>
                  </div>

                  <ModelBuilder
                    model={editingModel}
                    dimensions={dimensions.filter(d => d.modelId === editingModel.id)}
                    questions={questions.filter(q => q.modelId === editingModel.id)}
                    answers={answers}
                    availableTenants={availableTenants}
                    assignedTenantIds={modelTenantAssignments.map(mt => mt.tenantId)}
                    onUpdateTenantAssignments={async (tenantIds) => {
                      // Sync tenant assignments via API
                      const modelId = editingModel.id;
                      const currentTenantIds = modelTenantAssignments.map(mt => mt.tenantId);
                      
                      // Determine which tenants to add and remove
                      const tenantsToAdd = tenantIds.filter(id => !currentTenantIds.includes(id));
                      const tenantsToRemove = currentTenantIds.filter(id => !tenantIds.includes(id));
                      
                      try {
                        // Add new tenant assignments
                        for (const tenantId of tenantsToAdd) {
                          await apiRequest(`/api/models/${modelId}/tenants`, 'POST', { tenantId });
                        }
                        
                        // Remove old tenant assignments
                        for (const tenantId of tenantsToRemove) {
                          await apiRequest(`/api/models/${modelId}/tenants/${tenantId}`, 'DELETE');
                        }
                        
                        // Update ownerTenantId to first selected tenant
                        const newOwnerTenantId = tenantIds.length > 0 ? tenantIds[0] : null;
                        updateModel.mutate({
                          id: modelId,
                          name: editingModel.name,
                          slug: editingModel.slug,
                          description: editingModel.description,
                          version: editingModel.version || '1.0.0',
                          estimatedTime: editingModel.estimatedTime || '15-20 minutes',
                          status: (editingModel.status || 'draft') as 'draft' | 'published',
                          imageUrl: editingModel.imageUrl || '',
                          visibility: (editingModel.visibility || 'public') as 'public' | 'private',
                          ownerTenantId: newOwnerTenantId,
                          tenantIds: [],
                          modelClass: (editingModel.modelClass || 'organizational') as 'organizational' | 'individual',
                          generalResources: editingModel.generalResources || [],
                          maturityScale: editingModel.maturityScale || [],
                        } as any);
                        
                        // Refetch tenant assignments
                        queryClient.invalidateQueries({ queryKey: ['/api/models', modelId, 'tenants'] });
                        
                        toast({
                          title: "Tenant assignments updated",
                          description: "Model access has been updated successfully",
                        });
                      } catch (error) {
                        console.error('Error updating tenant assignments:', error);
                        toast({
                          title: "Error",
                          description: "Failed to update tenant assignments",
                          variant: "destructive",
                        });
                      }
                    }}
                    onUpdateModel={(updates) => {
                      // Update local state immediately for responsive UI
                      setEditingModel(prev => prev ? { ...prev, ...updates } : prev);
                      // Note: Debouncing is handled at the ModelBuilder component level
                      const updatedModel = { ...editingModel, ...updates };
                      // Type assertion needed because ModelBuilder sends additional fields like generalResources and maturityScale
                      updateModel.mutate({
                        id: editingModel.id,
                        name: updatedModel.name,
                        slug: updatedModel.slug,
                        description: updatedModel.description,
                        version: updatedModel.version || '1.0.0',
                        estimatedTime: updatedModel.estimatedTime || '15-20 minutes',
                        status: (updatedModel.status || 'draft') as 'draft' | 'published',
                        imageUrl: updatedModel.imageUrl || '',
                        visibility: (updatedModel.visibility || 'public') as 'public' | 'private',
                        ownerTenantId: updatedModel.ownerTenantId || null,
                        tenantIds: [],
                        modelClass: (updatedModel.modelClass || 'organizational') as 'organizational' | 'individual',
                        generalResources: updatedModel.generalResources || [],
                        maturityScale: updatedModel.maturityScale || [],
                      } as any);
                    }}
                    onAddDimension={() => {
                      setSelectedModelId(editingModel.id);
                      setIsDimensionDialogOpen(true);
                    }}
                    onEditDimension={(dimension) => {
                      setEditingDimension(dimension);
                      setDimensionForm({
                        label: dimension.label,
                        key: dimension.key,
                        description: dimension.description || '',
                        order: dimension.order,
                      });
                      setIsDimensionDialogOpen(true);
                    }}
                    onDeleteDimension={(dimensionId) => {
                      deleteDimension.mutate(dimensionId);
                    }}
                    onAddQuestion={(dimensionId) => {
                      resetQuestionForm();
                      setQuestionForm(prev => ({
                        ...prev,
                        modelId: editingModel.id,
                        dimensionId: dimensionId || '',
                      }));
                      setIsQuestionDialogOpen(true);
                    }}
                    onEditQuestion={(question) => {
                      setEditingQuestion(question);
                      setQuestionForm({
                        modelId: question.modelId,
                        text: question.text,
                        type: question.type as 'text' | 'multiple_choice' | 'multi_select' | 'numeric' | 'true_false',
                        dimensionId: question.dimensionId || '',
                        order: question.order,
                        minValue: question.minValue || 0,
                        maxValue: question.maxValue || 100,
                        unit: question.unit || '',
                        placeholder: question.placeholder || '',
                        improvementStatement: question.improvementStatement || '',
                        resourceLink: question.resourceLink || '',
                        resourceTitle: question.resourceTitle || '',
                        resourceDescription: question.resourceDescription || '',
                      });
                      setIsQuestionDialogOpen(true);
                    }}
                    onDeleteQuestion={(questionId) => {
                      deleteQuestion.mutate(questionId);
                    }}
                    onManageAnswers={(question) => {
                      setEditingQuestion(question);
                      setIsAnswerDialogOpen(true);
                    }}
                    onGetUploadParameters={handleGetUploadParameters}
                    onUploadComplete={handleUploadComplete}
                    onRemoveImage={() => {
                      if (editingModel) {
                        removeModelImage.mutate(editingModel.id);
                      }
                    }}
                    isRemovingImage={removeModelImage.isPending}
                  />
                </div>
              )}
              
              {/* Keep old table code temporarily for reference but hide it */}
              {false && activeSection === 'models-old' && (
              <Card className="p-6">
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
                                onClick={() => exportModelDefinition(model.id)}
                                data-testid={`button-export-model-${model.id}`}
                                title="Export Model Definition (.model file)"
                              >
                                <Database className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => exportInterviewGuide(model.id)}
                                data-testid={`button-export-interview-${model.id}`}
                                title="Export Interview Guide (Markdown)"
                              >
                                <FileText className="h-4 w-4" />
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
                                  setDeleteDataModelId(model.id);
                                  setDeleteDataModelName(model.name);
                                  setDeleteDataConfirmation('');
                                  setIsDeleteDataDialogOpen(true);
                                }}
                                data-testid={`button-delete-data-${model.id}`}
                                title="Delete All Assessment Data (for testing)"
                              >
                                <Database className="h-4 w-4 text-destructive" />
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
              )}

              {activeSection === 'dimensions' && (
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
              )}

              {activeSection === 'questions' && (
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
              )}

              {activeSection === 'users' && (
              <Card className="p-6">
                <div className="flex justify-between items-center mb-6">
                  <div>
                    <h3 className="text-xl font-semibold">User Management</h3>
                    <p className="text-sm text-muted-foreground">Manage user accounts and permissions</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <Select value={selectedTenantFilter} onValueChange={setSelectedTenantFilter}>
                      <SelectTrigger className="w-[200px]" data-testid="select-tenant-filter">
                        <SelectValue placeholder="Filter by tenant" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Users</SelectItem>
                        <SelectItem value="none">No Tenant</SelectItem>
                        {tenants.map((tenant: any) => (
                          <SelectItem key={tenant.id} value={tenant.id}>
                            {tenant.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button variant="outline" onClick={exportUsersToCSV} data-testid="button-export-users">
                      <FileSpreadsheet className="mr-2 h-4 w-4" />
                      Export CSV
                    </Button>
                  </div>
                </div>

                {usersLoading ? (
                  <div className="py-8 text-center text-muted-foreground">Loading users...</div>
                ) : filteredUsers.length === 0 ? (
                  <div className="py-8 text-center text-muted-foreground">No users found</div>
                ) : (
                  <div className="rounded-md border overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Username</TableHead>
                          <TableHead>Verified</TableHead>
                          <TableHead>Name</TableHead>
                          <TableHead>Company</TableHead>
                          <TableHead>Tenant</TableHead>
                          <TableHead>Role</TableHead>
                          <TableHead>Created</TableHead>
                          <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredUsers.map((user) => (
                          <TableRow key={user.id}>
                            <TableCell className="font-medium">{user.username}</TableCell>
                            <TableCell>
                              {user.emailVerified ? (
                                <Badge variant="secondary" className="bg-green-500/10 text-green-600 dark:text-green-400">
                                  <CheckCircle2 className="h-3 w-3 mr-1" />
                                  Verified
                                </Badge>
                              ) : (
                                <Badge variant="secondary" className="bg-orange-500/10 text-orange-600 dark:text-orange-400">
                                  <XCircle className="h-3 w-3 mr-1" />
                                  Unverified
                                </Badge>
                              )}
                            </TableCell>
                            <TableCell>{user.name || '-'}</TableCell>
                            <TableCell>{user.company || '-'}</TableCell>
                            <TableCell>
                              <button
                                onClick={() => {
                                  setEditingUser(user);
                                  setUserForm({ 
                                    role: normalizeRole(user.role),
                                    username: user.username,
                                    newPassword: '',
                                    tenantId: user.tenantId || null,
                                  });
                                  setIsUserDialogOpen(true);
                                }}
                                className="hover-elevate active-elevate-2 rounded-md px-2 py-1"
                                title="Click to assign tenant"
                                data-testid={`assign-tenant-${user.id}`}
                              >
                                {user.tenantId ? (
                                  <Badge variant="secondary">
                                    {tenants.find((t: any) => t.id === user.tenantId)?.name || 'Unknown'}
                                  </Badge>
                                ) : (
                                  <span className="text-muted-foreground text-sm">Assign Tenant</span>
                                )}
                              </button>
                            </TableCell>
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
                                {!user.emailVerified && (
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => {
                                      if (confirm(`Manually verify email for "${user.username}"?`)) {
                                        verifyUserEmail.mutate(user.id);
                                      }
                                    }}
                                    title="Verify email"
                                    data-testid={`verify-email-${user.id}`}
                                  >
                                    <CheckCircle2 className="h-4 w-4 text-green-600" />
                                  </Button>
                                )}
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => {
                                    setEditingUser(user);
                                    setUserForm({ 
                                      role: normalizeRole(user.role),
                                      username: user.username,
                                      newPassword: '',
                                      tenantId: user.tenantId || null,
                                    });
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
              )}

              {activeSection === 'results' && (
              <div className="space-y-4">
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
                  <div className="flex gap-2">
                    <Button variant="outline" onClick={exportResultsToCSV} data-testid="button-export-results">
                      <FileSpreadsheet className="mr-2 h-4 w-4" />
                      Export CSV
                    </Button>
                    <Button variant="outline" onClick={() => setShowAnalyticalExport(true)} data-testid="button-export-analytical">
                      <Download className="mr-2 h-4 w-4" />
                      Export for Analysis
                    </Button>
                  </div>
                </div>

                {/* Filters */}
                <div className="mb-6 grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="results-start-date">Start Date</Label>
                    <Input
                      id="results-start-date"
                      type="date"
                      value={resultsStartDate}
                      onChange={(e) => setResultsStartDate(e.target.value)}
                      data-testid="input-results-start-date"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="results-end-date">End Date</Label>
                    <Input
                      id="results-end-date"
                      type="date"
                      value={resultsEndDate}
                      onChange={(e) => setResultsEndDate(e.target.value)}
                      data-testid="input-results-end-date"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="results-status">Status</Label>
                    <Select value={resultsStatus} onValueChange={setResultsStatus}>
                      <SelectTrigger id="results-status" data-testid="select-results-status">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Statuses</SelectItem>
                        <SelectItem value="completed">Completed Only</SelectItem>
                        <SelectItem value="in_progress">In Progress</SelectItem>
                        <SelectItem value="abandoned">Abandoned</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>User</TableHead>
                      <TableHead>Company</TableHead>
                      <TableHead>Model</TableHead>
                      <TableHead>Score</TableHead>
                      <TableHead>Status</TableHead>
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
                      (() => {
                        // Group results by date
                        const groupedByDate = results.reduce((acc, result) => {
                          const dateKey = new Date(result.date || Date.now()).toLocaleDateString();
                          if (!acc[dateKey]) {
                            acc[dateKey] = [];
                          }
                          acc[dateKey].push(result);
                          return acc;
                        }, {} as Record<string, typeof results>);

                        // Render grouped results with subtotals
                        return Object.entries(groupedByDate).map(([date, dateResults]) => {
                          const dateTotal = dateResults.reduce((sum, r) => sum + r.overallScore, 0);
                          const dateAvg = Math.round(dateTotal / dateResults.length);
                          
                          return [
                            // Date header row
                            <TableRow key={`header-${date}`} className="bg-muted/50">
                              <TableCell colSpan={4} className="font-semibold">
                                {date} ({dateResults.length} assessment{dateResults.length !== 1 ? 's' : ''})
                              </TableCell>
                              <TableCell className="font-semibold">
                                Avg: {dateAvg}
                              </TableCell>
                              <TableCell colSpan={2}></TableCell>
                            </TableRow>,
                            // Individual results for this date
                            ...dateResults.map((result) => (
                              <TableRow key={result.assessmentId} data-testid={`result-row-${result.assessmentId}`}>
                                <TableCell className="pl-8">{new Date(result.date || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</TableCell>
                                <TableCell>
                                  <div className="flex items-center gap-2">
                                    <span>{result.isProxy ? result.proxyName : (result.userName || 'Anonymous')}</span>
                                    {result.isProxy && (
                                      <Badge variant="secondary" className="text-xs" data-testid={`badge-proxy-${result.assessmentId}`}>
                                        Proxy
                                      </Badge>
                                    )}
                                  </div>
                                </TableCell>
                                <TableCell>{result.isProxy ? result.proxyCompany : (result.company || '-')}</TableCell>
                                <TableCell>{result.modelName}</TableCell>
                                <TableCell>{result.overallScore}</TableCell>
                                <TableCell>
                                  <Badge variant={result.status === 'completed' ? 'default' : 'secondary'}>
                                    {result.status || result.label}
                                  </Badge>
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
                          ];
                        }).flat();
                      })()
                    )}
                  </TableBody>
                </Table>
              </Card>
              </div>
              )}

              {activeSection === 'benchmarks' && (
              <div className="space-y-6">
                <Card className="p-6">
                  <div className="space-y-4">
                    <div className="flex justify-between items-center">
                      <h2 className="text-xl font-bold">Benchmark Configuration</h2>
                    </div>
                    
                    <p className="text-muted-foreground">
                      Configure minimum sample sizes required for each benchmark segment type. Segments with fewer samples will not be displayed to users.
                    </p>
                    
                    <BenchmarkConfig />
                  </div>
                </Card>

                <Card className="p-6">
                  <div className="space-y-4">
                    <div className="flex justify-between items-center">
                      <h2 className="text-xl font-bold">Model Benchmarks</h2>
                      <p className="text-sm text-muted-foreground">
                        Select a model to view and manage its benchmarks
                      </p>
                    </div>
                    
                    <BenchmarksByModel />
                  </div>
                </Card>
              </div>
              )}

              {activeSection === 'import' && (
              <div className="space-y-6">
                <div>
                  <h2 className="text-2xl font-bold mb-2">Data Import</h2>
                  <p className="text-muted-foreground">
                    Import assessment data from external systems into the AI Maturity Model
                  </p>
                </div>
                
                <ImportManager />
                
                <div className="border-t pt-6">
                  <h2 className="text-2xl font-bold mb-4">Import History</h2>
                  <ImportBatches />
                </div>
              </div>
              )}

              {activeSection === 'content' && (
                <ContentManagement />
              )}

              {activeSection === 'ai-review' && (
                <AiContentReviewQueue />
              )}

              {activeSection === 'ai-usage' && (
                <AiUsageDashboard />
              )}

              {activeSection === 'audit' && (
              <Card className="p-6">
                <h2 className="text-xl font-bold mb-6">Audit Log</h2>
                <p className="text-muted-foreground">
                  Track all administrative actions and changes to models, results, and system configuration.
                </p>
                <p className="text-sm text-muted-foreground mt-4">
                  Audit logging coming soon.
                </p>
              </Card>
              )}

              {activeSection === 'knowledge' && (
                <div className="space-y-6">
                  {/* Header */}
                  <div>
                    <h2 className="text-2xl font-bold mb-2">Knowledge Base</h2>
                    <p className="text-muted-foreground">
                      Manage documents and resources for AI-enhanced assessments
                    </p>
                  </div>

                  {/* Upload Card */}
                  <Card className="p-6">
                    <h3 className="text-lg font-semibold mb-4">Upload Document</h3>
                    
                    <form onSubmit={(e) => {
                      e.preventDefault();
                      const formData = new FormData(e.currentTarget);
                      const fileInput = formData.get('file') as File | null;
                      
                      if (!fileInput || fileInput.size === 0) {
                        toast({
                          title: "No file selected",
                          description: "Please select a file to upload",
                          variant: "destructive",
                        });
                        return;
                      }

                      // File type validation
                      const allowedTypes = ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'text/plain', 'text/markdown'];
                      const allowedExtensions = ['.pdf', '.doc', '.docx', '.txt', '.md'];
                      const fileName = fileInput.name.toLowerCase();
                      const hasValidExtension = allowedExtensions.some(ext => fileName.endsWith(ext));
                      
                      // Block PPT/PPTX
                      if (fileName.endsWith('.ppt') || fileName.endsWith('.pptx')) {
                        toast({
                          title: "PowerPoint not supported",
                          description: "Please convert your PowerPoint to PDF first to reduce file size and ensure compatibility",
                          variant: "destructive",
                        });
                        return;
                      }

                      if (!hasValidExtension && !allowedTypes.includes(fileInput.type)) {
                        toast({
                          title: "Invalid file type",
                          description: "Please upload a PDF, Word document, text file, or markdown file",
                          variant: "destructive",
                        });
                        return;
                      }

                      // File size validation (25MB = 26214400 bytes)
                      if (fileInput.size > 26214400) {
                        toast({
                          title: "File too large",
                          description: "Please upload a file smaller than 25MB",
                          variant: "destructive",
                        });
                        return;
                      }

                      // Scope validation
                      if (knowledgeScope === 'model-specific' && !knowledgeModelId) {
                        toast({
                          title: "Model required",
                          description: "Please select a model for model-specific documents",
                          variant: "destructive",
                        });
                        return;
                      }

                      uploadKnowledgeDoc.mutate({
                        file: fileInput,
                        scope: knowledgeScope,
                        modelId: knowledgeModelId || undefined,
                        description: knowledgeDescription || undefined,
                      });

                      // Reset file input
                      e.currentTarget.reset();
                    }}>
                      <div className="space-y-4">
                        {/* File Input */}
                        <div>
                          <Label htmlFor="file">Select File</Label>
                          <Input
                            id="file"
                            name="file"
                            type="file"
                            accept=".pdf,.doc,.docx,.txt,.md"
                            data-testid="input-knowledge-file"
                            className="cursor-pointer"
                          />
                          <p className="text-sm text-muted-foreground mt-2">
                            Accepted formats: PDF, Word, Text, Markdown (max 25MB)
                          </p>
                          <p className="text-sm text-muted-foreground mt-1">
                            💡 Have a PowerPoint? Convert to PDF first to reduce file size
                          </p>
                        </div>

                        {/* Scope Selector */}
                        <div>
                          <Label>Scope</Label>
                          <div className="flex gap-4 mt-2">
                            <label className="flex items-center gap-2 cursor-pointer">
                              <input
                                type="radio"
                                name="scope"
                                value="company-wide"
                                checked={knowledgeScope === 'company-wide'}
                                onChange={() => {
                                  setKnowledgeScope('company-wide');
                                  setKnowledgeModelId('');
                                }}
                                data-testid="radio-scope-company"
                                className="cursor-pointer"
                              />
                              <span>Company-Wide</span>
                            </label>
                            <label className="flex items-center gap-2 cursor-pointer">
                              <input
                                type="radio"
                                name="scope"
                                value="model-specific"
                                checked={knowledgeScope === 'model-specific'}
                                onChange={() => setKnowledgeScope('model-specific')}
                                data-testid="radio-scope-model"
                                className="cursor-pointer"
                              />
                              <span>Model-Specific</span>
                            </label>
                          </div>
                        </div>

                        {/* Model Selector (shown only when model-specific) */}
                        {knowledgeScope === 'model-specific' && (
                          <div>
                            <Label htmlFor="model">Select Model</Label>
                            <Select value={knowledgeModelId} onValueChange={setKnowledgeModelId}>
                              <SelectTrigger id="model" data-testid="select-knowledge-model">
                                <SelectValue placeholder="Choose a model..." />
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
                        )}

                        {/* Description */}
                        <div>
                          <Label htmlFor="description">Description (Optional)</Label>
                          <Textarea
                            id="description"
                            value={knowledgeDescription}
                            onChange={(e) => setKnowledgeDescription(e.target.value)}
                            placeholder="Brief description of this document..."
                            rows={2}
                            data-testid="input-knowledge-description"
                          />
                        </div>

                        {/* Upload Button */}
                        <Button
                          type="submit"
                          disabled={uploadKnowledgeDoc.isPending}
                          data-testid="button-upload-knowledge-doc"
                        >
                          {uploadKnowledgeDoc.isPending ? (
                            <>Uploading...</>
                          ) : (
                            <>
                              <Upload className="mr-2 h-4 w-4" />
                              Upload Document
                            </>
                          )}
                        </Button>
                      </div>
                    </form>
                  </Card>

                  {/* Document List Card */}
                  <Card className="p-6">
                    <div className="flex justify-between items-center mb-6">
                      <h3 className="text-lg font-semibold">Documents</h3>
                      
                      {/* Filter Tabs */}
                      <div className="flex gap-2">
                        <Button
                          variant={knowledgeFilter === 'all' ? 'default' : 'outline'}
                          size="sm"
                          onClick={() => setKnowledgeFilter('all')}
                          data-testid="filter-all"
                        >
                          All
                        </Button>
                        <Button
                          variant={knowledgeFilter === 'company-wide' ? 'default' : 'outline'}
                          size="sm"
                          onClick={() => setKnowledgeFilter('company-wide')}
                          data-testid="filter-company-wide"
                        >
                          Company-Wide
                        </Button>
                        <Button
                          variant={knowledgeFilter === 'model-specific' ? 'default' : 'outline'}
                          size="sm"
                          onClick={() => setKnowledgeFilter('model-specific')}
                          data-testid="filter-model-specific"
                        >
                          Model-Specific
                        </Button>
                      </div>
                    </div>

                    {knowledgeDocsError ? (
                      <div className="text-center py-12">
                        <div className="text-destructive mb-4">
                          <p className="font-semibold">Error loading knowledge documents</p>
                          <p className="text-sm mt-2">{String(knowledgeDocsError)}</p>
                        </div>
                        <Button onClick={() => refetchKnowledgeDocs()} data-testid="button-retry-knowledge-docs">
                          Retry
                        </Button>
                      </div>
                    ) : knowledgeDocsLoading ? (
                      <div className="text-center py-12 text-muted-foreground">
                        <p>Loading documents...</p>
                      </div>
                    ) : knowledgeDocuments.length === 0 ? (
                      <div className="text-center py-12 text-muted-foreground">
                        <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
                        <p>No documents uploaded yet</p>
                        <p className="text-sm mt-2">Upload your first document above</p>
                      </div>
                    ) : (
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Name</TableHead>
                            <TableHead>Type</TableHead>
                            <TableHead>Size</TableHead>
                            <TableHead>Scope</TableHead>
                            <TableHead>Model</TableHead>
                            <TableHead>Uploaded</TableHead>
                            <TableHead className="text-right">Actions</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {knowledgeDocuments.map((doc) => {
                            // Format file size
                            const formatFileSize = (bytes: number) => {
                              if (bytes < 1024) return `${bytes} B`;
                              if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
                              return `${(bytes / 1048576).toFixed(1)} MB`;
                            };

                            // Get file extension
                            const getFileType = (fileName: string) => {
                              const ext = fileName.split('.').pop()?.toLowerCase() || '';
                              return ext.toUpperCase();
                            };

                            // Find model name
                            const modelName = doc.modelId 
                              ? models.find(m => m.id === doc.modelId)?.name || 'Unknown'
                              : '-';

                            return (
                              <TableRow key={doc.id} data-testid={`doc-row-${doc.id}`}>
                                <TableCell className="font-medium">{doc.name}</TableCell>
                                <TableCell>
                                  <Badge variant="outline">{getFileType(doc.name)}</Badge>
                                </TableCell>
                                <TableCell>{formatFileSize(doc.fileSize)}</TableCell>
                                <TableCell>
                                  <Badge>{doc.scope === 'company-wide' ? 'Company' : 'Model'}</Badge>
                                </TableCell>
                                <TableCell>{modelName}</TableCell>
                                <TableCell>
                                  {new Date(doc.uploadedAt).toLocaleDateString()}
                                </TableCell>
                                <TableCell className="text-right">
                                  <div className="flex justify-end gap-2">
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => window.open(`/objects/${doc.fileUrl}`, '_blank')}
                                      data-testid={`button-download-doc-${doc.id}`}
                                    >
                                      <Download className="h-4 w-4" />
                                    </Button>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => {
                                        if (confirm(`Delete "${doc.name}"?`)) {
                                          deleteKnowledgeDoc.mutate(doc.id);
                                        }
                                      }}
                                      disabled={deleteKnowledgeDoc.isPending}
                                      data-testid={`button-delete-knowledge-doc-${doc.id}`}
                                    >
                                      <Trash className="h-4 w-4" />
                                    </Button>
                                  </div>
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    )}
                  </Card>

                  {/* AI Cache Management Card */}
                  <Card className="p-6">
                    <div className="flex justify-between items-center mb-6">
                      <div>
                        <h3 className="text-lg font-semibold">AI Content Cache</h3>
                        <p className="text-sm text-muted-foreground">
                          Manage cached AI-generated content for assessments
                        </p>
                      </div>
                      <Button
                        variant="destructive"
                        onClick={() => setShowCacheDialog(true)}
                        data-testid="button-clear-cache"
                      >
                        <Trash className="mr-2 h-4 w-4" />
                        Clear All Cache
                      </Button>
                    </div>

                    {cacheStats && (
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <Card className="p-4">
                          <div className="text-2xl font-bold text-primary">{cacheStats.total}</div>
                          <div className="text-sm text-muted-foreground">Total Cached</div>
                        </Card>
                        <Card className="p-4">
                          <div className="text-2xl font-bold text-green-600 dark:text-green-400">{cacheStats.valid}</div>
                          <div className="text-sm text-muted-foreground">Valid</div>
                        </Card>
                        <Card className="p-4">
                          <div className="text-2xl font-bold text-orange-600 dark:text-orange-400">{cacheStats.expired}</div>
                          <div className="text-sm text-muted-foreground">Expired</div>
                        </Card>
                        <Card className="p-4">
                          <div className="text-2xl font-bold text-secondary">{Object.keys(cacheStats.byType).length}</div>
                          <div className="text-sm text-muted-foreground">Content Types</div>
                        </Card>
                      </div>
                    )}

                    <div className="mt-6 p-4 bg-muted rounded-lg">
                      <h4 className="font-semibold mb-2">About AI Cache</h4>
                      <p className="text-sm text-muted-foreground mb-2">
                        AI-generated content is cached for 90 days to improve performance and reduce costs.
                      </p>
                      <p className="text-sm text-muted-foreground">
                        <strong>Automatic regeneration:</strong> When you add new knowledge documents, the cache should automatically invalidate and regenerate with the new information. If you're not seeing updated content, use the "Clear All Cache" button above to force regeneration.
                      </p>
                    </div>
                  </Card>
                </div>
              )}

              {activeSection === 'tenants' && <TenantManagement />}

              {activeSection === 'oauth-applications' && <OAuthApplications />}
            </div>

            {/* Footer Stats */}
            <footer className="mt-8 pt-6 border-t">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Card className="p-4">
                  <div className="text-2xl font-bold text-primary mb-1" data-testid="stat-active-models">{models.length}</div>
                  <div className="text-xs text-muted-foreground">Active Models</div>
                </Card>
                <Card className="p-4">
                  <div className="text-2xl font-bold text-secondary mb-1" data-testid="stat-total-assessments">{totalAssessments}</div>
                  <div className="text-xs text-muted-foreground">Total Assessments</div>
                </Card>
                <Card className="p-4">
                  <div className="text-2xl font-bold text-chart-3 mb-1" data-testid="stat-average-score">{averageScore}</div>
                  <div className="text-xs text-muted-foreground">Average Score</div>
                </Card>
                <Card className="p-4">
                  <div className="text-2xl font-bold text-chart-4 mb-1" data-testid="stat-published-models">{publishedModels}</div>
                  <div className="text-xs text-muted-foreground">Published Models</div>
                </Card>
              </div>
            </footer>
          </main>
        </div>
      </div>

      {/* Delete Assessment Data Confirmation Dialog */}
      <Dialog open={isDeleteDataDialogOpen} onOpenChange={setIsDeleteDataDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete All Assessment Data?</DialogTitle>
            <DialogDescription>
              This action cannot be undone. All assessment data for "{deleteDataModelName}" will be permanently deleted.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <div className="bg-destructive/10 border border-destructive/20 rounded-md p-4">
              <h4 className="font-semibold text-destructive mb-2">WARNING: This will permanently delete:</h4>
              <ul className="text-sm space-y-1 list-disc list-inside">
                <li>All assessments for this model</li>
                <li>All user responses</li>
                <li>All results and scores</li>
                <li>All AI-generated content</li>
                <li>All benchmarks</li>
              </ul>
            </div>

            <div className="bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-md p-4">
              <h4 className="font-semibold text-blue-900 dark:text-blue-100 mb-2">IMPORTANT: Backup your data first!</h4>
              <p className="text-sm text-blue-800 dark:text-blue-200">
                Go to the Results tab and click "Export Results CSV" to download a backup copy before proceeding.
              </p>
            </div>

            <div>
              <Label htmlFor="delete-confirmation">Type "DELETE ALL DATA" to confirm:</Label>
              <Input
                id="delete-confirmation"
                value={deleteDataConfirmation}
                onChange={(e) => setDeleteDataConfirmation(e.target.value)}
                placeholder="DELETE ALL DATA"
                data-testid="input-delete-confirmation"
              />
            </div>
          </div>

          <div className="flex gap-2 justify-end">
            <Button
              variant="outline"
              onClick={() => {
                setIsDeleteDataDialogOpen(false);
                setDeleteDataConfirmation('');
              }}
              data-testid="button-cancel-delete-data"
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (deleteDataConfirmation === 'DELETE ALL DATA' && deleteDataModelId) {
                  deleteAssessmentData.mutate(deleteDataModelId);
                  setIsDeleteDataDialogOpen(false);
                  setDeleteDataConfirmation('');
                } else {
                  toast({
                    title: "Incorrect confirmation",
                    description: "You must type 'DELETE ALL DATA' exactly to confirm.",
                    variant: "destructive",
                  });
                }
              }}
              disabled={deleteDataConfirmation !== 'DELETE ALL DATA'}
              data-testid="button-confirm-delete-data"
            >
              Delete All Data
            </Button>
          </div>
        </DialogContent>
      </Dialog>

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
                Upload an image for this model (recommended: 1200px+ width, 16:9 or 21:9 aspect ratio, under 10MB)
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
                        maxFileSize={10485760} // 10MB
                        allowedFileTypes={['image/jpeg', 'image/png', 'image/webp']}
                        onGetUploadParameters={handleGetUploadParameters}
                        onComplete={handleUploadComplete}
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
                      maxFileSize={10485760} // 10MB
                      allowedFileTypes={['image/jpeg', 'image/png', 'image/webp']}
                      onGetUploadParameters={handleGetUploadParameters}
                      onComplete={handleUploadComplete}
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

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="visibility">Visibility</Label>
                <Select 
                  value={modelForm.visibility} 
                  onValueChange={(value: 'public' | 'private') => {
                    // When switching to public, clear all tenant assignments
                    if (value === 'public') {
                      setModelForm({ ...modelForm, visibility: value, ownerTenantId: null, tenantIds: [] });
                    } else {
                      // When switching to private, auto-select tenant if only one available
                      const newTenantIds = availableTenants.length === 1 ? [availableTenants[0].id] : modelForm.tenantIds;
                      const newOwnerId = newTenantIds[0] || null;
                      setModelForm({ ...modelForm, visibility: value, ownerTenantId: newOwnerId, tenantIds: newTenantIds });
                    }
                  }}
                >
                  <SelectTrigger data-testid="select-model-visibility">
                    <SelectValue placeholder="Select visibility" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="public">Public (visible to everyone)</SelectItem>
                    <SelectItem value="private">Private (tenant-only)</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground mt-1">
                  {modelForm.visibility === 'public' 
                    ? 'Model will be visible to all users' 
                    : 'Model will only be visible to users from the assigned tenant'}
                </p>
              </div>
              <div>
                <Label htmlFor="ownerTenant">Assigned Tenants</Label>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild disabled={modelForm.visibility === 'public'}>
                    <Button 
                      variant="outline" 
                      className="w-full justify-between"
                      data-testid="select-model-tenants"
                    >
                      {modelForm.visibility === 'public' 
                        ? 'N/A (public model)' 
                        : modelForm.tenantIds.length === 0
                        ? 'Select tenants'
                        : `${modelForm.tenantIds.length} tenant${modelForm.tenantIds.length > 1 ? 's' : ''} selected`}
                      <ChevronDown className="ml-2 h-4 w-4 opacity-50" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent className="w-[400px]">
                    {[...availableTenants].sort((a, b) => a.name.localeCompare(b.name)).map((tenant) => (
                      <DropdownMenuCheckboxItem
                        key={tenant.id}
                        checked={modelForm.tenantIds.includes(tenant.id)}
                        onCheckedChange={(checked) => {
                          setModelForm({
                            ...modelForm,
                            tenantIds: checked
                              ? [...modelForm.tenantIds, tenant.id]
                              : modelForm.tenantIds.filter((id) => id !== tenant.id),
                            ownerTenantId: checked 
                              ? (modelForm.tenantIds.length === 0 ? tenant.id : modelForm.ownerTenantId)
                              : (modelForm.tenantIds.filter((id) => id !== tenant.id)[0] || null),
                          });
                        }}
                      >
                        {tenant.name}
                      </DropdownMenuCheckboxItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
                <p className="text-xs text-muted-foreground mt-1">
                  {modelForm.visibility === 'public' 
                    ? 'Not applicable for public models' 
                    : 'Select one or more tenants that can access this private model'}
                </p>
              </div>
            </div>

            <div>
              <Label htmlFor="modelClass">Model Class</Label>
              <Select 
                value={modelForm.modelClass} 
                onValueChange={(value: 'organizational' | 'individual') => {
                  setModelForm({ ...modelForm, modelClass: value });
                }}
              >
                <SelectTrigger data-testid="select-model-class">
                  <SelectValue placeholder="Select model class" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="organizational">Organizational (default)</SelectItem>
                  <SelectItem value="individual">Individual (shows badge)</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground mt-1">
                {modelForm.modelClass === 'organizational' 
                  ? 'Standard organizational maturity assessment' 
                  : 'Personal/skills assessment - displays "Individual" badge on model cards and launch page'}
              </p>
            </div>
          </div>

          <DialogFooter>
            <div className="flex w-full justify-between items-center">
              <div>
                {editingModel && (
                  <Button 
                    variant="outline" 
                    onClick={() => exportInterviewGuide(editingModel.id)}
                    data-testid="button-export-interview-dialog"
                  >
                    <FileText className="mr-2 h-4 w-4" />
                    Export Interview Guide
                  </Button>
                )}
              </div>
              <div className="flex gap-2">
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
              </div>
            </div>
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
            <div className="flex justify-between gap-2">
              <Button
                variant="outline"
                onClick={async () => {
                  if (!editingQuestion || answers.length === 0) return;
                  
                  try {
                    const response = await apiRequest('/api/admin/ai/rewrite-all-answers', 'POST', {
                      questionId: editingQuestion.id,
                      questionText: editingQuestion.text,
                      answers: answers.map(a => ({
                        id: a.id,
                        text: a.text,
                        score: a.score
                      })),
                      modelContext: undefined
                    });
                    
                    toast({
                      title: "Rewrites Sent to Review Queue",
                      description: response.message || `${answers.length} answer rewrites pending approval in AI Review tab.`,
                    });
                  } catch (error) {
                    toast({
                      title: "Generation Failed",
                      description: "Failed to generate answer rewrites. Please try again.",
                      variant: "destructive",
                    });
                  }
                }}
                disabled={!editingQuestion || answers.length === 0}
                data-testid="button-rewrite-all-answers"
              >
                <Sparkles className="mr-2 h-4 w-4" />
                Rewrite All Answers
              </Button>
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

      {/* Model Import Dialog */}
      <Dialog open={isModelImportDialogOpen} onOpenChange={setIsModelImportDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Import Model Definition</DialogTitle>
            <DialogDescription>
              Import a complete model from a .model file. You can optionally rename the model during import.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>File</Label>
              <p className="text-sm text-muted-foreground">
                {pendingModelFile?.file.name || 'No file selected'}
              </p>
            </div>

            <div className="space-y-2">
              <Label>Original Model Details</Label>
              <div className="p-3 bg-muted rounded-md">
                <p className="text-sm"><strong>Name:</strong> {pendingModelFile?.modelData?.model?.name || 'N/A'}</p>
                <p className="text-sm"><strong>Slug:</strong> {pendingModelFile?.modelData?.model?.slug || 'N/A'}</p>
                <p className="text-sm"><strong>Version:</strong> {pendingModelFile?.modelData?.model?.version || 'N/A'}</p>
                <p className="text-sm mt-2"><strong>Includes:</strong></p>
                <ul className="text-sm list-disc list-inside ml-2">
                  <li>{pendingModelFile?.modelData?.model?.dimensions?.length || 0} dimensions</li>
                  <li>{pendingModelFile?.modelData?.model?.questions?.length || 0} questions</li>
                </ul>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="import-model-name">New Model Name (Optional)</Label>
              <Input
                id="import-model-name"
                value={modelImportName}
                onChange={(e) => setModelImportName(e.target.value)}
                placeholder={pendingModelFile?.modelData?.model?.name || 'Leave empty to use original name'}
                data-testid="input-import-model-name"
              />
              <p className="text-sm text-muted-foreground">
                Leave empty to use the original name
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="import-model-slug">New Model Slug (Optional)</Label>
              <Input
                id="import-model-slug"
                value={modelImportSlug}
                onChange={(e) => setModelImportSlug(e.target.value)}
                placeholder={pendingModelFile?.modelData?.model?.slug || 'Leave empty to use original slug'}
                data-testid="input-import-model-slug"
              />
              <p className="text-sm text-muted-foreground">
                Leave empty to use the original slug. Slug must be unique.
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setIsModelImportDialogOpen(false);
              setPendingModelFile(null);
              setModelImportName('');
              setModelImportSlug('');
            }}>
              Cancel
            </Button>
            <Button
              onClick={handleConfirmModelImport}
              data-testid="button-confirm-model-import"
            >
              Import Model
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* User Edit Dialog */}
      <Dialog open={isUserDialogOpen} onOpenChange={setIsUserDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit User</DialogTitle>
            <DialogDescription>
              Update settings for user: {editingUser?.username}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Username</Label>
              <Input
                value={userForm.username}
                onChange={(e) => setUserForm({ ...userForm, username: e.target.value })}
                placeholder="Enter username"
                data-testid="input-username"
              />
            </div>

            <div className="space-y-2">
              <Label>User Role</Label>
              <Select
                value={userForm.role}
                onValueChange={(value) => setUserForm({ ...userForm, role: value as 'user' | 'tenant_modeler' | 'tenant_admin' | 'global_admin' })}
              >
                <SelectTrigger data-testid="select-user-role">
                  <SelectValue placeholder="Select role" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="user">User</SelectItem>
                  <SelectItem value="tenant_modeler">Tenant Modeler</SelectItem>
                  <SelectItem value="tenant_admin">Tenant Admin</SelectItem>
                  <SelectItem value="global_admin">Global Admin</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-sm text-muted-foreground">
                Global Admin: full platform access. Tenant Admin: manage users/models in their tenant. Tenant Modeler: build models for their tenant. User: take assessments.
              </p>
            </div>

            <div className="space-y-2">
              <Label>Tenant Assignment</Label>
              <Select
                value={userForm.tenantId || 'none'}
                onValueChange={(value) => setUserForm({ ...userForm, tenantId: value === 'none' ? null : value })}
              >
                <SelectTrigger data-testid="select-user-tenant">
                  <SelectValue placeholder="Select tenant" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No Tenant</SelectItem>
                  {tenants.map((tenant: any) => (
                    <SelectItem key={tenant.id} value={tenant.id}>
                      {tenant.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-sm text-muted-foreground">
                Assign this user to a specific tenant organization.
              </p>
            </div>

            <div className="space-y-2">
              <Label>New Password (optional)</Label>
              <Input
                type="password"
                value={userForm.newPassword}
                onChange={(e) => setUserForm({ ...userForm, newPassword: e.target.value })}
                placeholder="Leave empty to keep current password"
                data-testid="input-new-password"
              />
              <p className="text-sm text-muted-foreground">
                Minimum 8 characters, must include uppercase letter and punctuation.
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
                  // Validate username
                  if (!userForm.username || userForm.username.trim().length === 0) {
                    toast({
                      title: "Validation Error",
                      description: "Username cannot be empty",
                      variant: "destructive",
                    });
                    return;
                  }
                  
                  // Validate password if provided
                  if (userForm.newPassword && userForm.newPassword.length < 8) {
                    toast({
                      title: "Validation Error",
                      description: "Password must be at least 8 characters",
                      variant: "destructive",
                    });
                    return;
                  }
                  
                  // Update user details
                  updateUser.mutate({ 
                    id: editingUser.id, 
                    role: userForm.role,
                    username: userForm.username.trim(),
                    newPassword: userForm.newPassword || undefined,
                  });
                  
                  // Update tenant assignment if changed
                  if (userForm.tenantId !== editingUser.tenantId) {
                    assignUserToTenant.mutate({
                      userId: editingUser.id,
                      tenantId: userForm.tenantId,
                    });
                  }
                  
                  setIsUserDialogOpen(false);
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

      {/* AI Cache Clear Confirmation Dialog */}
      <Dialog open={showCacheDialog} onOpenChange={(open) => {
        setShowCacheDialog(open);
        if (!open) setCacheClearModelId('');
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Clear AI Content Cache?</DialogTitle>
            <DialogDescription>
              Clear cached AI-generated content for all models or a specific model. New assessments will regenerate fresh content using the latest knowledge documents.
            </DialogDescription>
          </DialogHeader>

          <div className="py-4 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="cache-clear-model">Model (optional)</Label>
              <Select value={cacheClearModelId} onValueChange={setCacheClearModelId}>
                <SelectTrigger id="cache-clear-model" data-testid="select-cache-clear-model">
                  <SelectValue placeholder="All models" />
                </SelectTrigger>
                <SelectContent>
                  {models.map((model) => (
                    <SelectItem key={model.id} value={model.id}>
                      {model.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Leave unselected to clear cache for all models, or select a specific model
              </p>
            </div>

            <div className="p-4 bg-yellow-500/10 border border-yellow-500/20 rounded-lg">
              <p className="text-sm font-semibold text-yellow-700 dark:text-yellow-400 mb-2">
                ⚠️ This action cannot be undone
              </p>
              <p className="text-sm text-muted-foreground">
                {cacheClearModelId 
                  ? `Cache entries for the selected model will be deleted.`
                  : `All ${cacheStats?.total || 0} cached items will be deleted.`
                } This may temporarily slow down assessments as content is regenerated.
              </p>
            </div>

            <div className="space-y-2 text-sm text-muted-foreground">
              <p><strong>When to clear cache:</strong></p>
              <ul className="list-disc pl-5 space-y-1">
                <li>You've added new knowledge documents and want to ensure they're used immediately</li>
                <li>You're experiencing issues with outdated AI content</li>
                <li>You want to test how new documents affect AI recommendations</li>
              </ul>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setShowCacheDialog(false);
              setCacheClearModelId('');
            }}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => clearAICache.mutate(cacheClearModelId || undefined)}
              disabled={clearAICache.isPending}
              data-testid="button-confirm-clear-cache"
            >
              {clearAICache.isPending ? "Clearing..." : cacheClearModelId ? "Clear Model Cache" : "Clear All Cache"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Analytical Export Dialog */}
      <Dialog open={showAnalyticalExport} onOpenChange={setShowAnalyticalExport}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Export for Deep Analysis</DialogTitle>
            <DialogDescription>
              Export comprehensive assessment data including questions, answers, user responses, and scores for analysis in tools like Copilot Analyst.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="export-model">Select Model</Label>
              <Select value={selectedExportModel} onValueChange={setSelectedExportModel}>
                <SelectTrigger id="export-model" data-testid="select-export-model">
                  <SelectValue placeholder="Choose a model to export" />
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

            <div className="rounded-lg bg-muted p-4 space-y-2">
              <h4 className="font-medium text-sm">Export Includes:</h4>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li>• Model metadata and maturity scale</li>
                <li>• All dimensions with descriptions</li>
                <li>• All questions with answer options and scores</li>
                <li>• Complete assessment responses with user context</li>
                <li>• Overall and dimensional scores for each assessment</li>
                <li>• User demographics (job title, industry, company size, country)</li>
              </ul>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setShowAnalyticalExport(false);
              setSelectedExportModel('');
            }}>
              Cancel
            </Button>
            <Button 
              onClick={handleAnalyticalExport}
              disabled={!selectedExportModel}
              data-testid="button-confirm-analytical-export"
            >
              <Download className="mr-2 h-4 w-4" />
              Export JSON
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Import/Export Panel */}
      <ImportExportPanel
        open={isImportExportOpen}
        onOpenChange={setIsImportExportOpen}
        selectedModel={importExportModel || undefined}
        dimensions={importExportModel ? dimensions : []}
        questions={importExportModel ? questions : []}
        answers={importExportModel ? answers : []}
        scoringLevels={importExportModel?.maturityScale?.map(level => ({
          ...level,
          label: level.name,
        })) || []}
        onImportComplete={() => {
          queryClient.invalidateQueries({ queryKey: ['/api/models'] });
          queryClient.invalidateQueries({ queryKey: ['/api/dimensions', importExportModel?.id] });
          queryClient.invalidateQueries({ queryKey: ['/api/questions', importExportModel?.id] });
          toast({
            title: "Import Complete",
            description: "Model data has been imported successfully.",
          });
        }}
      />

    </SidebarProvider>
    </TooltipProvider>
  );
}