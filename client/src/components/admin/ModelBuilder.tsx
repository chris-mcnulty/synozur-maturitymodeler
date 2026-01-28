import { useState, useRef, useEffect } from "react";
import { useToast } from "@/hooks/use-toast";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Plus, Edit, Trash, GripVertical, ChevronRight, Upload, X, ChevronDown, Copy, Check, Link, QrCode } from "lucide-react";
import { ObjectUploader } from "@/components/ObjectUploader";
import { QRCodeSVG } from "qrcode.react";
import type { Model, Dimension, Question, Answer } from "@shared/schema";

interface Tenant {
  id: string;
  name: string;
}

interface ModelBuilderProps {
  model: Model;
  dimensions: Dimension[];
  questions: Question[];
  answers: Answer[];
  availableTenants: Tenant[];
  assignedTenantIds: string[];
  onUpdateModel: (updates: Partial<Model>) => void;
  onUpdateTenantAssignments: (tenantIds: string[]) => void;
  onAddDimension: () => void;
  onEditDimension: (dimension: Dimension) => void;
  onDeleteDimension: (dimensionId: string) => void;
  onAddQuestion: (dimensionId?: string) => void;
  onEditQuestion: (question: Question) => void;
  onDeleteQuestion: (questionId: string) => void;
  onManageAnswers: (question: Question) => void;
  onGetUploadParameters: () => Promise<{ method: 'PUT'; url: string }>;
  onUploadComplete: (result: any) => void;
  onRemoveImage: () => void;
  isRemovingImage?: boolean;
}

// Share Links component with URL and QR code
function ShareLinksCard({ slug }: { slug: string }) {
  const [urlCopied, setUrlCopied] = useState(false);
  const [qrCopied, setQrCopied] = useState(false);
  const qrRef = useRef<HTMLDivElement>(null);
  
  // Construct the full URL
  const baseUrl = typeof window !== 'undefined' ? window.location.origin : '';
  const fullUrl = `${baseUrl}/${slug}`;
  
  const copyUrl = async () => {
    try {
      await navigator.clipboard.writeText(fullUrl);
      setUrlCopied(true);
      setTimeout(() => setUrlCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy URL:', err);
    }
  };
  
  const copyQrCode = async () => {
    if (!qrRef.current) return;
    
    try {
      const svgElement = qrRef.current.querySelector('svg');
      if (!svgElement) return;
      
      // Create a canvas from the SVG
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      
      const svgData = new XMLSerializer().serializeToString(svgElement);
      const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
      const svgUrl = URL.createObjectURL(svgBlob);
      
      const img = new Image();
      img.onload = async () => {
        canvas.width = img.width;
        canvas.height = img.height;
        ctx.fillStyle = 'white';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0);
        URL.revokeObjectURL(svgUrl);
        
        canvas.toBlob(async (blob) => {
          if (blob) {
            try {
              await navigator.clipboard.write([
                new ClipboardItem({ 'image/png': blob })
              ]);
              setQrCopied(true);
              setTimeout(() => setQrCopied(false), 2000);
            } catch (err) {
              // Fallback: download the image
              const link = document.createElement('a');
              link.download = `${slug}-qrcode.png`;
              link.href = canvas.toDataURL('image/png');
              link.click();
              setQrCopied(true);
              setTimeout(() => setQrCopied(false), 2000);
            }
          }
        }, 'image/png');
      };
      img.src = svgUrl;
    } catch (err) {
      console.error('Failed to copy QR code:', err);
    }
  };
  
  return (
    <Card className="p-6">
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Link className="h-5 w-5 text-muted-foreground" />
          <h3 className="text-lg font-semibold">Share Links</h3>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* URL Section */}
          <div className="space-y-3">
            <Label className="text-sm font-medium">Assessment URL</Label>
            <div className="flex gap-2">
              <Input 
                value={fullUrl} 
                readOnly 
                className="font-mono text-sm"
                data-testid="input-share-url"
              />
              <Button 
                variant="outline" 
                size="icon" 
                onClick={copyUrl}
                data-testid="button-copy-url"
                title="Copy URL to clipboard"
              >
                {urlCopied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Share this link to allow users to take this assessment
            </p>
          </div>
          
          {/* QR Code Section */}
          <div className="space-y-3">
            <Label className="text-sm font-medium">QR Code</Label>
            <div className="flex items-start gap-4">
              <div 
                ref={qrRef}
                className="bg-white p-3 rounded-lg border border-border"
                data-testid="qr-code-container"
              >
                <QRCodeSVG 
                  value={fullUrl} 
                  size={120}
                  level="M"
                  includeMargin={false}
                />
              </div>
              <div className="space-y-2">
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={copyQrCode}
                  data-testid="button-copy-qr"
                  className="w-full"
                >
                  {qrCopied ? <Check className="h-4 w-4 mr-2 text-green-500" /> : <QrCode className="h-4 w-4 mr-2" />}
                  {qrCopied ? 'Copied!' : 'Copy QR Code'}
                </Button>
                <p className="text-xs text-muted-foreground">
                  Copy or download QR code for print materials
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
}

export function ModelBuilder({
  model,
  dimensions,
  questions,
  answers,
  availableTenants,
  assignedTenantIds,
  onUpdateModel,
  onUpdateTenantAssignments,
  onAddDimension,
  onEditDimension,
  onDeleteDimension,
  onAddQuestion,
  onEditQuestion,
  onDeleteQuestion,
  onManageAnswers,
  onGetUploadParameters,
  onUploadComplete,
  onRemoveImage,
  isRemovingImage,
}: ModelBuilderProps) {
  const [activeTab, setActiveTab] = useState("overview");
  
  // Local state for form fields (for responsive UI)
  const [localName, setLocalName] = useState(model.name);
  const [localSlug, setLocalSlug] = useState(model.slug);
  const [localDescription, setLocalDescription] = useState(model.description || "");
  const [localResources, setLocalResources] = useState(model.generalResources || []);
  const [localMaturityScale, setLocalMaturityScale] = useState(model.maturityScale || []);
  const [localTenantIds, setLocalTenantIds] = useState<string[]>(assignedTenantIds);
  
  // Debounce refs for text inputs
  const nameDebounceRef = useRef<NodeJS.Timeout>();
  const descriptionDebounceRef = useRef<NodeJS.Timeout>();
  const slugDebounceRef = useRef<NodeJS.Timeout>();
  const resourcesDebounceRef = useRef<NodeJS.Timeout>();
  const maturityScaleDebounceRef = useRef<NodeJS.Timeout>();

  // Sync local state when model prop changes
  useEffect(() => {
    setLocalName(model.name);
    setLocalSlug(model.slug);
    setLocalDescription(model.description || "");
    setLocalResources(model.generalResources || []);
    setLocalMaturityScale(model.maturityScale || []);
    setLocalTenantIds(assignedTenantIds);
    
    // Cleanup: clear pending debounce timers when model changes
    return () => {
      if (nameDebounceRef.current) clearTimeout(nameDebounceRef.current);
      if (descriptionDebounceRef.current) clearTimeout(descriptionDebounceRef.current);
      if (slugDebounceRef.current) clearTimeout(slugDebounceRef.current);
      if (resourcesDebounceRef.current) clearTimeout(resourcesDebounceRef.current);
      if (maturityScaleDebounceRef.current) clearTimeout(maturityScaleDebounceRef.current);
    };
  }, [model.id, model.name, model.slug, model.description, model.generalResources, model.maturityScale, assignedTenantIds]); // Re-run when model or its fields change

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

  const handleResourcesChange = (newResources: Array<{ id: string; title: string; description?: string; link?: string }>) => {
    setLocalResources(newResources);
    if (resourcesDebounceRef.current) clearTimeout(resourcesDebounceRef.current);
    resourcesDebounceRef.current = setTimeout(() => onUpdateModel({ generalResources: newResources }), 500);
  };

  const handleMaturityScaleChange = (newScale: Array<{ id: string; name: string; description: string; minScore: number; maxScore: number }>) => {
    setLocalMaturityScale(newScale);
    if (maturityScaleDebounceRef.current) clearTimeout(maturityScaleDebounceRef.current);
    maturityScaleDebounceRef.current = setTimeout(() => onUpdateModel({ maturityScale: newScale }), 500);
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

  // Delete handlers
  const handleDeleteResource = (resourceId: string) => {
    const updated = localResources.filter((r) => r.id !== resourceId);
    handleResourcesChange(updated);
  };

  const handleDeleteMaturityLevel = (levelId: string) => {
    const updated = localMaturityScale.filter((l) => l.id !== levelId);
    handleMaturityScaleChange(updated);
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

              {/* Status, Visibility, and Model Class */}
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <Label>Status</Label>
                  <Select
                    value={model.status || 'draft'}
                    onValueChange={(value: 'draft' | 'published' | 'archived') => {
                      onUpdateModel({ status: value });
                    }}
                  >
                    <SelectTrigger data-testid="select-model-status">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="draft">Draft</SelectItem>
                      <SelectItem value="published">Published</SelectItem>
                      <SelectItem value="archived">Archived</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground mt-1">
                    {model.status === 'published' 
                      ? 'Visible to users' 
                      : model.status === 'archived'
                        ? 'Hidden from homepage and default admin view'
                        : 'Only visible to admins'}
                  </p>
                </div>
                <div>
                  <Label>Visibility</Label>
                  <Select
                    value={model.visibility || 'public'}
                    onValueChange={(value: 'public' | 'private') => {
                      onUpdateModel({ visibility: value });
                      // If switching to public, clear tenant assignments
                      if (value === 'public') {
                        setLocalTenantIds([]);
                        onUpdateTenantAssignments([]);
                      }
                    }}
                  >
                    <SelectTrigger data-testid="select-visibility">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="public">Public</SelectItem>
                      <SelectItem value="private">Tenant Private</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Model Class</Label>
                  <Select
                    value={model.modelClass || 'organizational'}
                    onValueChange={(value: 'organizational' | 'individual') => {
                      onUpdateModel({ modelClass: value });
                    }}
                  >
                    <SelectTrigger data-testid="select-model-class">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="organizational">Organizational</SelectItem>
                      <SelectItem value="individual">Individual</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Allow Anonymous Results Toggle */}
              <div className="flex items-center justify-between p-4 rounded-lg border border-border">
                <div className="space-y-0.5">
                  <Label htmlFor="allow-anonymous-results" className="cursor-pointer">
                    Allow Anonymous Results
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    When enabled, users can view their summary report without logging in or creating a profile
                  </p>
                </div>
                <Switch
                  id="allow-anonymous-results"
                  checked={model.allowAnonymousResults ?? false}
                  onCheckedChange={(checked) => onUpdateModel({ allowAnonymousResults: checked })}
                  data-testid="switch-allow-anonymous-results"
                />
              </div>

              {/* Tenant Assignment (only for private models) */}
              {model.visibility === 'private' && (
                <div>
                  <Label>Assigned Tenants</Label>
                  <p className="text-sm text-muted-foreground mb-2">
                    Select which tenants can access this private model
                  </p>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button 
                        variant="outline" 
                        className="w-full justify-between"
                        data-testid="select-assigned-tenants"
                      >
                        {localTenantIds.length === 0
                          ? 'Select tenants'
                          : `${localTenantIds.length} tenant${localTenantIds.length > 1 ? 's' : ''} selected`}
                        <ChevronDown className="ml-2 h-4 w-4 opacity-50" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent className="w-[400px]">
                      {availableTenants.length === 0 ? (
                        <div className="p-2 text-sm text-muted-foreground">No tenants available</div>
                      ) : (
                        availableTenants
                          .sort((a, b) => a.name.localeCompare(b.name))
                          .map((tenant) => (
                            <DropdownMenuCheckboxItem
                              key={tenant.id}
                              checked={localTenantIds.includes(tenant.id)}
                              onCheckedChange={(checked) => {
                                const newTenantIds = checked
                                  ? [...localTenantIds, tenant.id]
                                  : localTenantIds.filter((id) => id !== tenant.id);
                                setLocalTenantIds(newTenantIds);
                                onUpdateTenantAssignments(newTenantIds);
                              }}
                            >
                              {tenant.name}
                            </DropdownMenuCheckboxItem>
                          ))
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              )}

              {/* Image Upload Section */}
              <div>
                <Label>Model Image</Label>
                <p className="text-sm text-muted-foreground mb-3">
                  Upload an image for this model (recommended: 1200px+ width, 16:9 or 21:9 aspect ratio, under 10MB)
                </p>
                
                {model.imageUrl ? (
                  <div className="space-y-3">
                    <div className="relative rounded-lg overflow-hidden border border-border">
                      <img 
                        src={model.imageUrl} 
                        alt="Model preview" 
                        className="w-full h-48 object-cover"
                      />
                    </div>
                    <div className="flex gap-2">
                      <ObjectUploader
                        maxNumberOfFiles={1}
                        maxFileSize={10485760}
                        allowedFileTypes={['image/jpeg', 'image/png', 'image/webp']}
                        onGetUploadParameters={onGetUploadParameters}
                        onComplete={onUploadComplete}
                        buttonVariant="outline"
                      >
                        <Upload className="h-4 w-4 mr-2" />
                        Replace Image
                      </ObjectUploader>
                      <Button
                        variant="outline"
                        onClick={onRemoveImage}
                        disabled={isRemovingImage}
                        data-testid="button-remove-image"
                      >
                        <X className="h-4 w-4 mr-2" />
                        {isRemovingImage ? 'Removing...' : 'Remove Image'}
                      </Button>
                    </div>
                  </div>
                ) : (
                  <ObjectUploader
                    maxNumberOfFiles={1}
                    maxFileSize={10485760}
                    allowedFileTypes={['image/jpeg', 'image/png', 'image/webp']}
                    onGetUploadParameters={onGetUploadParameters}
                    onComplete={onUploadComplete}
                  >
                    <Upload className="h-4 w-4 mr-2" />
                    Upload Image
                  </ObjectUploader>
                )}
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

          {/* Share Links Card */}
          <ShareLinksCard slug={model.slug} />
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
          <div className="flex justify-between items-center">
            <div>
              <h3 className="text-lg font-semibold">General Resources</h3>
              <p className="text-sm text-muted-foreground">
                Add resources that apply to the entire assessment
              </p>
            </div>
            <Button
              onClick={() => {
                const newResource = {
                  id: crypto.randomUUID(),
                  title: "New Resource",
                  description: "",
                  link: "",
                };
                const updated = [...localResources, newResource];
                handleResourcesChange(updated);
              }}
              data-testid="button-add-resource"
            >
              <Plus className="mr-2 h-4 w-4" />
              Add Resource
            </Button>
          </div>

          {localResources.length === 0 ? (
            <Card className="p-12">
              <div className="text-center space-y-3">
                <h3 className="text-lg font-semibold">No resources yet</h3>
                <p className="text-sm text-muted-foreground">
                  Add resources to help users understand and implement the assessment insights
                </p>
              </div>
            </Card>
          ) : (
            <div className="space-y-3">
              {localResources.map((resource, index) => (
                <Card key={resource.id} className="p-4">
                  <div className="flex gap-3">
                    <div className="flex-1 space-y-3">
                      <div>
                        <Label htmlFor={`resource-title-${resource.id}`}>Title</Label>
                        <Input
                          id={`resource-title-${resource.id}`}
                          value={resource.title}
                          onChange={(e) => {
                            const updated = localResources.map((r) =>
                              r.id === resource.id ? { ...r, title: e.target.value } : r
                            );
                            handleResourcesChange(updated);
                          }}
                          placeholder="Resource title..."
                          data-testid={`input-resource-title-${index}`}
                        />
                      </div>
                      <div>
                        <Label htmlFor={`resource-description-${resource.id}`}>
                          Description (optional)
                        </Label>
                        <Textarea
                          id={`resource-description-${resource.id}`}
                          value={resource.description || ""}
                          onChange={(e) => {
                            const updated = localResources.map((r) =>
                              r.id === resource.id ? { ...r, description: e.target.value } : r
                            );
                            handleResourcesChange(updated);
                          }}
                          placeholder="Describe this resource..."
                          rows={2}
                          data-testid={`input-resource-description-${index}`}
                        />
                      </div>
                      <div>
                        <Label htmlFor={`resource-link-${resource.id}`}>Link (optional)</Label>
                        <Input
                          id={`resource-link-${resource.id}`}
                          value={resource.link || ""}
                          onChange={(e) => {
                            const updated = localResources.map((r) =>
                              r.id === resource.id ? { ...r, link: e.target.value } : r
                            );
                            handleResourcesChange(updated);
                          }}
                          placeholder="https://..."
                          data-testid={`input-resource-link-${index}`}
                        />
                      </div>
                    </div>
                    <div className="flex flex-col justify-start pt-6">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDeleteResource(resource.id)}
                        data-testid={`button-delete-resource-${index}`}
                        aria-label="Delete resource"
                      >
                        <Trash className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="maturity-scale" className="space-y-4">
          <div className="flex justify-between items-center">
            <div>
              <h3 className="text-lg font-semibold">Maturity Scale Levels</h3>
              <p className="text-sm text-muted-foreground">
                Define the scoring levels for this assessment
              </p>
            </div>
            <Button
              onClick={() => {
                const maxScore = localMaturityScale.length > 0 
                  ? Math.max(...localMaturityScale.map(l => l.maxScore))
                  : 0;
                const newLevel = {
                  id: crypto.randomUUID(),
                  name: "New Level",
                  description: "",
                  minScore: maxScore + 1,
                  maxScore: maxScore + 100,
                };
                const updated = [...localMaturityScale, newLevel];
                handleMaturityScaleChange(updated);
              }}
              data-testid="button-add-maturity-level"
            >
              <Plus className="mr-2 h-4 w-4" />
              Add Level
            </Button>
          </div>
          
          {/* Scoring Method Toggle */}
          <Card className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-base font-medium">Scoring Method</Label>
                <p className="text-sm text-muted-foreground">
                  Average (default): Best for 0-100 answer scores. Sum: For traditional 0-4 answer scores.
                </p>
              </div>
              <div className="flex items-center gap-3">
                <span className={`text-sm ${!(localMaturityScale as any)?.scoringMethod || (localMaturityScale as any)?.scoringMethod === 'average' ? 'font-medium' : 'text-muted-foreground'}`}>
                  Average
                </span>
                <Switch
                  checked={(localMaturityScale as any)?.scoringMethod === 'sum'}
                  onCheckedChange={(checked) => {
                    const updatedScale = Object.assign([...localMaturityScale], {
                      scoringMethod: checked ? 'sum' : 'average'
                    });
                    handleMaturityScaleChange(updatedScale);
                  }}
                  data-testid="switch-scoring-method"
                />
                <span className={`text-sm ${(localMaturityScale as any)?.scoringMethod === 'sum' ? 'font-medium' : 'text-muted-foreground'}`}>
                  Sum
                </span>
              </div>
            </div>
          </Card>

          {localMaturityScale.length === 0 ? (
            <Card className="p-12">
              <div className="text-center space-y-3">
                <h3 className="text-lg font-semibold">No maturity levels yet</h3>
                <p className="text-sm text-muted-foreground">
                  Add maturity levels to define scoring ranges (e.g., Initial, Developing, Advanced, Optimized)
                </p>
              </div>
            </Card>
          ) : (
            <div className="space-y-3">
              {localMaturityScale.map((level, index) => (
                <Card key={level.id} className="p-4">
                  <div className="flex gap-3">
                    <div className="flex-1 space-y-3">
                      <div>
                        <Label htmlFor={`level-name-${level.id}`}>Level Name</Label>
                        <Input
                          id={`level-name-${level.id}`}
                          value={level.name}
                          onChange={(e) => {
                            const updated = localMaturityScale.map((l) =>
                              l.id === level.id ? { ...l, name: e.target.value } : l
                            );
                            handleMaturityScaleChange(updated);
                          }}
                          placeholder="e.g., Initial, Developing, Advanced..."
                          data-testid={`input-level-name-${index}`}
                        />
                      </div>
                      <div>
                        <Label htmlFor={`level-description-${level.id}`}>Description</Label>
                        <Textarea
                          id={`level-description-${level.id}`}
                          value={level.description}
                          onChange={(e) => {
                            const updated = localMaturityScale.map((l) =>
                              l.id === level.id ? { ...l, description: e.target.value } : l
                            );
                            handleMaturityScaleChange(updated);
                          }}
                          placeholder="Describe this maturity level..."
                          rows={2}
                          data-testid={`input-level-description-${index}`}
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <Label htmlFor={`level-min-${level.id}`}>Min Score</Label>
                          <Input
                            id={`level-min-${level.id}`}
                            type="number"
                            value={level.minScore}
                            onChange={(e) => {
                              const updated = localMaturityScale.map((l) =>
                                l.id === level.id
                                  ? { ...l, minScore: parseInt(e.target.value) || 0 }
                                  : l
                              );
                              handleMaturityScaleChange(updated);
                            }}
                            data-testid={`input-level-min-${index}`}
                          />
                        </div>
                        <div>
                          <Label htmlFor={`level-max-${level.id}`}>Max Score</Label>
                          <Input
                            id={`level-max-${level.id}`}
                            type="number"
                            value={level.maxScore}
                            onChange={(e) => {
                              const updated = localMaturityScale.map((l) =>
                                l.id === level.id
                                  ? { ...l, maxScore: parseInt(e.target.value) || 0 }
                                  : l
                              );
                              handleMaturityScaleChange(updated);
                            }}
                            data-testid={`input-level-max-${index}`}
                          />
                        </div>
                      </div>
                    </div>
                    <div className="flex flex-col justify-start pt-6">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDeleteMaturityLevel(level.id)}
                        data-testid={`button-delete-level-${index}`}
                        aria-label="Delete maturity level"
                      >
                        <Trash className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
