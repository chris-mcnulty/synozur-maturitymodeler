import { useState, useCallback } from "react";
import { Upload, Download, FileJson, FileSpreadsheet, X, AlertCircle, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { modelToCSV, type ScoringLevel } from "@/utils/csvConverter";
import { questionsToSimpleCSV } from "@/utils/csvConverterSimple";
import type { Model, Dimension, Question, Answer } from "@shared/schema";

type ExportFormat = "model" | "csv-full" | "csv-simple";
type ImportFormat = "auto" | "model" | "csv-full" | "csv-simple";

// Transform legacy .model format (fields at root level) to new format (nested under 'model')
function transformLegacyModelFormat(rawData: any) {
  // Check if this is the legacy format (has dimensions, questions, answers at root)
  if (rawData.dimensions && rawData.questions) {
    // Create dimension key mapping (use dimension id as key for legacy format)
    const dimensionIdToKey = new Map<string, string>();
    const transformedDimensions = (rawData.dimensions || []).map((dim: any, index: number) => {
      // Use existing key if present, otherwise generate from label/name
      const key = dim.key || (dim.label || dim.name)?.toLowerCase().replace(/[^a-z0-9]+/g, '_') || `dimension_${index + 1}`;
      dimensionIdToKey.set(dim.id, key);
      return {
        key,
        label: dim.label || dim.name,  // Support both "label" and "name" fields
        description: dim.description || null,
        order: dim.order || index + 1,
      };
    });

    // Create question-to-answers mapping
    const answersByQuestion = new Map<string, any[]>();
    (rawData.answers || []).forEach((answer: any) => {
      if (!answersByQuestion.has(answer.questionId)) {
        answersByQuestion.set(answer.questionId, []);
      }
      answersByQuestion.get(answer.questionId)!.push(answer);
    });

    // Transform questions with embedded answers
    const transformedQuestions = (rawData.questions || []).map((q: any) => {
      const answers = (answersByQuestion.get(q.id) || []).map((a: any) => ({
        text: a.text,
        score: a.score,
        order: a.order,
        improvementStatement: a.improvementStatement || null,
        resourceTitle: a.resourceTitle || null,
        resourceLink: a.resourceLink || null,
        resourceDescription: a.resourceDescription || null,
      }));

      return {
        dimensionKey: dimensionIdToKey.get(q.dimensionId) || null,
        text: q.text,
        type: q.type || 'multiple_choice',
        order: q.order,
        minValue: q.minValue || null,
        maxValue: q.maxValue || null,
        unit: q.unit || null,
        placeholder: q.placeholder || null,
        improvementStatement: q.improvementStatement || null,
        resourceTitle: q.resourceTitle || null,
        resourceLink: q.resourceLink || null,
        resourceDescription: q.resourceDescription || null,
        answers,
      };
    });

    return {
      formatVersion: "2.0",
      exportedAt: new Date().toISOString(),
      model: {
        name: rawData.name,
        slug: rawData.slug,
        description: rawData.description || '',
        version: rawData.version || '1.0.0',
        estimatedTime: rawData.estimatedTime || null,
        status: rawData.status || 'published',
        featured: rawData.featured || false,
        imageUrl: rawData.imageUrl || null,
        maturityScale: rawData.maturityScale || null,
        generalResources: rawData.generalResources || null,
      },
      dimensions: transformedDimensions,
      questions: transformedQuestions,
    };
  }

  // Already in new format
  return rawData;
}

interface ImportExportPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedModel?: Model;
  dimensions?: Dimension[];
  questions?: Question[];
  answers?: Answer[];
  scoringLevels?: ScoringLevel[];
  onImportComplete?: () => void;
}

export function ImportExportPanel({
  open,
  onOpenChange,
  selectedModel,
  dimensions = [],
  questions = [],
  answers = [],
  scoringLevels = [],
  onImportComplete,
}: ImportExportPanelProps) {
  const { toast } = useToast();
  const [mode, setMode] = useState<"export" | "import">("export");
  const [exportFormat, setExportFormat] = useState<ExportFormat>("model");
  const [importFormat, setImportFormat] = useState<ImportFormat>("auto");
  const [dragActive, setDragActive] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState(0);
  const [importStatus, setImportStatus] = useState<{
    type: "success" | "error" | null;
    message: string;
  }>({ type: null, message: "" });

  const handleExport = useCallback(() => {
    if (!selectedModel) {
      toast({
        variant: "destructive",
        title: "No Model Selected",
        description: "Please select a model to export.",
      });
      return;
    }

    try {
      let content = "";
      let filename = "";
      let mimeType = "";

      if (exportFormat === "model") {
        // Build dimension key map
        const dimensionIdToKey = new Map<string, string>();
        dimensions.forEach(d => dimensionIdToKey.set(d.id, d.key));
        
        // Build answers map by question ID
        const answersByQuestion = new Map<string, Answer[]>();
        answers.forEach(a => {
          if (!answersByQuestion.has(a.questionId)) {
            answersByQuestion.set(a.questionId, []);
          }
          answersByQuestion.get(a.questionId)!.push(a);
        });
        
        // Build standard export format with nested answers
        const modelData = {
          formatVersion: "1.0",
          exportedAt: new Date().toISOString(),
          model: {
            name: selectedModel.name,
            slug: selectedModel.slug,
            description: selectedModel.description || '',
            version: selectedModel.version || '1.0',
            estimatedTime: selectedModel.estimatedTime,
            status: selectedModel.status,
            featured: selectedModel.featured || false,
            imageUrl: selectedModel.imageUrl,
            maturityScale: selectedModel.maturityScale,
            generalResources: selectedModel.generalResources,
          },
          dimensions: dimensions.map(d => ({
            key: d.key,
            label: d.label,
            description: d.description || '',
            order: d.order,
          })),
          questions: questions.map(q => ({
            dimensionKey: q.dimensionId ? dimensionIdToKey.get(q.dimensionId) || null : null,
            text: q.text,
            type: q.type,
            order: q.order,
            minValue: q.minValue,
            maxValue: q.maxValue,
            unit: q.unit,
            placeholder: q.placeholder,
            improvementStatement: q.improvementStatement,
            resourceTitle: q.resourceTitle,
            resourceLink: q.resourceLink,
            resourceDescription: q.resourceDescription,
            answers: (answersByQuestion.get(q.id) || []).map(a => ({
              text: a.text,
              score: a.score,
              order: a.order,
              improvementStatement: a.improvementStatement,
              resourceTitle: a.resourceTitle,
              resourceLink: a.resourceLink,
              resourceDescription: a.resourceDescription,
            })),
          })),
        };
        content = JSON.stringify(modelData, null, 2);
        filename = `${selectedModel.slug}.model`;
        mimeType = "application/json";
      } else if (exportFormat === "csv-full") {
        content = modelToCSV(selectedModel, dimensions, questions, answers, scoringLevels);
        filename = `${selectedModel.slug}-full.csv`;
        mimeType = "text/csv";
      } else if (exportFormat === "csv-simple") {
        content = questionsToSimpleCSV(questions, answers);
        filename = `${selectedModel.slug}-questions.csv`;
        mimeType = "text/csv";
      }

      const blob = new Blob([content], { type: mimeType });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      link.click();
      URL.revokeObjectURL(url);

      toast({
        title: "Export Successful",
        description: `${filename} has been downloaded.`,
      });
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Export Failed",
        description: error instanceof Error ? error.message : "Unknown error occurred",
      });
    }
  }, [selectedModel, dimensions, questions, answers, scoringLevels, exportFormat, toast]);

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  }, []);

  const handleFileImport = useCallback(async (file: File) => {
    setImporting(true);
    setImportProgress(0);
    setImportStatus({ type: null, message: "" });

    try {
      const text = await file.text();
      setImportProgress(30);

      let detectedFormat: "model" | "csv-full" | "csv-simple" = "model";
      
      if (importFormat === "auto") {
        if (file.name.endsWith(".model") || file.name.endsWith(".json")) {
          detectedFormat = "model";
        } else if (file.name.endsWith(".csv")) {
          const firstLine = text.split("\n")[0].toLowerCase();
          if (firstLine.includes("question#")) {
            detectedFormat = "csv-simple";
          } else if (firstLine.includes("type") && firstLine.includes("id")) {
            detectedFormat = "csv-full";
          }
        }
      } else {
        detectedFormat = importFormat as "model" | "csv-full" | "csv-simple";
      }

      // CSV imports require a selected model, but .model imports create a new model
      if ((detectedFormat === "csv-simple" || detectedFormat === "csv-full") && !selectedModel) {
        toast({
          variant: "destructive",
          title: "No Model Selected",
          description: "Please select a model to import CSV data into.",
        });
        setImporting(false);
        return;
      }

      setImportProgress(60);

      if (detectedFormat === "model") {
        const rawData = JSON.parse(text);
        
        // Transform the data to the expected format
        // Handle various formats:
        // 1. Standard format: has formatVersion and nested questions with answers
        // 2. Legacy root format: dimensions/questions/answers at root level (no model object)
        // 3. Production export format: has model object but answers is separate array
        let modelData;
        if (rawData.formatVersion && rawData.model && !rawData.answers) {
          // Standard format - use as-is
          modelData = rawData;
        } else if (rawData.model && rawData.answers) {
          // Production format with nested model but separate answers - transform it
          modelData = transformLegacyModelFormat({
            ...rawData.model,
            dimensions: rawData.dimensions,
            questions: rawData.questions,
            answers: rawData.answers,
          });
        } else if (!rawData.model && rawData.dimensions) {
          // Legacy format - transform it
          modelData = transformLegacyModelFormat(rawData);
        } else {
          // Assume it's close enough to standard format
          modelData = rawData;
        }
        
        // Call the backend import endpoint
        const response = await fetch('/api/models/import-model', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ modelData }),
        });
        
        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.error || 'Failed to import model');
        }
        
        const result = await response.json();
        
        setImportStatus({
          type: "success",
          message: `Successfully imported "${result.model.name}" with ${result.stats.dimensionsCreated} dimensions, ${result.stats.questionsCreated} questions, and ${result.stats.answersCreated} answers.`,
        });
        
        setImportProgress(100);
        
        toast({
          title: "Model Import Complete",
          description: `Successfully imported "${result.model.name}"`,
        });

        if (onImportComplete) {
          setTimeout(() => {
            onImportComplete();
          }, 1500);
        }
        return;
      } else if (detectedFormat === "csv-full") {
        setImportStatus({
          type: "success",
          message: "Detected CSV (Full) format. Import functionality coming soon.",
        });
      } else if (detectedFormat === "csv-simple") {
        // Actually import the CSV data
        const response = await fetch(`/api/models/${selectedModel?.id}/import-questions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ csvContent: text, mode: 'replace' }),
        });
        
        if (!response.ok) {
          throw new Error('Failed to import CSV');
        }
        
        const result = await response.json();
        
        setImportStatus({
          type: "success",
          message: `Successfully imported ${result.questionsImported || 0} questions and ${result.answersImported || 0} answers.`,
        });
        
        setImportProgress(100);
        
        toast({
          title: "Import Complete",
          description: `Imported ${result.questionsImported || 0} questions with ${result.answersImported || 0} answer options.`,
        });

        if (onImportComplete) {
          setTimeout(() => {
            onImportComplete();
          }, 1500);
        }
        return;
      }

      setImportProgress(100);
      
      toast({
        title: "File Processed",
        description: `File parsed successfully as ${detectedFormat} format.`,
      });

      if (onImportComplete) {
        setTimeout(() => {
          onImportComplete();
        }, 1500);
      }
    } catch (error) {
      setImportStatus({
        type: "error",
        message: error instanceof Error ? error.message : "Failed to process file",
      });
      toast({
        variant: "destructive",
        title: "Import Failed",
        description: error instanceof Error ? error.message : "Unknown error occurred",
      });
    } finally {
      setImporting(false);
    }
  }, [selectedModel, importFormat, toast, onImportComplete]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      handleFileImport(files[0]);
    }
  }, [handleFileImport]);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      handleFileImport(files[0]);
    }
  }, [handleFileImport]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Import/Export Model</SheetTitle>
          <SheetDescription>
            Transfer model data using multiple formats
          </SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-6">
          {/* Mode Selection */}
          <div className="flex gap-2 p-1 bg-muted rounded-lg">
            <Button
              variant={mode === "export" ? "default" : "ghost"}
              className="flex-1"
              onClick={() => setMode("export")}
              data-testid="button-mode-export"
            >
              <Download className="mr-2 h-4 w-4" />
              Export
            </Button>
            <Button
              variant={mode === "import" ? "default" : "ghost"}
              className="flex-1"
              onClick={() => setMode("import")}
              data-testid="button-mode-import"
            >
              <Upload className="mr-2 h-4 w-4" />
              Import
            </Button>
          </div>

          {/* Export Mode */}
          {mode === "export" && (
            <div className="space-y-4">
              <div>
                <Label className="text-base font-semibold mb-3 block">Export Format</Label>
                <RadioGroup value={exportFormat} onValueChange={(v) => setExportFormat(v as ExportFormat)}>
                  <div className="space-y-3">
                    <div className="flex items-start space-x-3 p-3 rounded-lg border hover-elevate">
                      <RadioGroupItem value="model" id="export-model" className="mt-1" />
                      <div className="flex-1">
                        <Label htmlFor="export-model" className="font-medium cursor-pointer flex items-center gap-2">
                          <FileJson className="h-4 w-4" />
                          .model (JSON Backup)
                        </Label>
                        <p className="text-sm text-muted-foreground mt-1">
                          Complete model definition with all data for backup and restore
                        </p>
                      </div>
                    </div>

                    <div className="flex items-start space-x-3 p-3 rounded-lg border hover-elevate">
                      <RadioGroupItem value="csv-full" id="export-csv-full" className="mt-1" />
                      <div className="flex-1">
                        <Label htmlFor="export-csv-full" className="font-medium cursor-pointer flex items-center gap-2">
                          <FileSpreadsheet className="h-4 w-4" />
                          CSV (Full Structure)
                        </Label>
                        <p className="text-sm text-muted-foreground mt-1">
                          Complete model with dimensions, questions, answers, and scoring levels
                        </p>
                      </div>
                    </div>

                    <div className="flex items-start space-x-3 p-3 rounded-lg border hover-elevate">
                      <RadioGroupItem value="csv-simple" id="export-csv-simple" className="mt-1" />
                      <div className="flex-1">
                        <Label htmlFor="export-csv-simple" className="font-medium cursor-pointer flex items-center gap-2">
                          <FileSpreadsheet className="h-4 w-4" />
                          CSV (Questions Only)
                        </Label>
                        <p className="text-sm text-muted-foreground mt-1">
                          Simplified format with questions and answers for easy editing
                        </p>
                      </div>
                    </div>
                  </div>
                </RadioGroup>
              </div>

              {selectedModel && (
                <Alert>
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    Exporting: <strong>{selectedModel.name}</strong> ({selectedModel.slug})
                  </AlertDescription>
                </Alert>
              )}

              <Button
                onClick={handleExport}
                disabled={!selectedModel}
                className="w-full"
                data-testid="button-execute-export"
              >
                <Download className="mr-2 h-4 w-4" />
                Export Model
              </Button>
            </div>
          )}

          {/* Import Mode */}
          {mode === "import" && (
            <div className="space-y-4">
              <div>
                <Label className="text-base font-semibold mb-3 block">Import Format</Label>
                <RadioGroup value={importFormat} onValueChange={(v) => setImportFormat(v as ImportFormat)}>
                  <div className="space-y-3">
                    <div className="flex items-start space-x-3 p-3 rounded-lg border hover-elevate">
                      <RadioGroupItem value="auto" id="import-auto" className="mt-1" />
                      <div className="flex-1">
                        <Label htmlFor="import-auto" className="font-medium cursor-pointer">
                          Auto-Detect
                        </Label>
                        <p className="text-sm text-muted-foreground mt-1">
                          Automatically detect format from file extension and content
                        </p>
                      </div>
                    </div>

                    <div className="flex items-start space-x-3 p-3 rounded-lg border hover-elevate">
                      <RadioGroupItem value="model" id="import-model" className="mt-1" />
                      <div className="flex-1">
                        <Label htmlFor="import-model" className="font-medium cursor-pointer flex items-center gap-2">
                          <FileJson className="h-4 w-4" />
                          .model (JSON)
                        </Label>
                      </div>
                    </div>

                    <div className="flex items-start space-x-3 p-3 rounded-lg border hover-elevate">
                      <RadioGroupItem value="csv-full" id="import-csv-full" className="mt-1" />
                      <div className="flex-1">
                        <Label htmlFor="import-csv-full" className="font-medium cursor-pointer flex items-center gap-2">
                          <FileSpreadsheet className="h-4 w-4" />
                          CSV (Full)
                        </Label>
                      </div>
                    </div>

                    <div className="flex items-start space-x-3 p-3 rounded-lg border hover-elevate">
                      <RadioGroupItem value="csv-simple" id="import-csv-simple" className="mt-1" />
                      <div className="flex-1">
                        <Label htmlFor="import-csv-simple" className="font-medium cursor-pointer flex items-center gap-2">
                          <FileSpreadsheet className="h-4 w-4" />
                          CSV (Simple)
                        </Label>
                      </div>
                    </div>
                  </div>
                </RadioGroup>
              </div>

              {/* Drag and Drop Zone */}
              <div
                className={`relative border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
                  dragActive ? "border-primary bg-primary/5" : "border-muted-foreground/25"
                }`}
                onDragEnter={handleDrag}
                onDragLeave={handleDrag}
                onDragOver={handleDrag}
                onDrop={handleDrop}
                data-testid="dropzone-import"
              >
                <input
                  type="file"
                  id="file-upload"
                  className="hidden"
                  onChange={handleFileSelect}
                  accept=".model,.json,.csv"
                  data-testid="input-file-upload"
                />
                <label htmlFor="file-upload" className="cursor-pointer">
                  <Upload className="mx-auto h-12 w-12 text-muted-foreground" />
                  <p className="mt-2 text-sm font-medium">
                    Drop file here or click to browse
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Supports .model, .json, and .csv files
                  </p>
                </label>
              </div>

              {/* Import Progress */}
              {importing && (
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span>Processing file...</span>
                    <span>{importProgress}%</span>
                  </div>
                  <Progress value={importProgress} />
                </div>
              )}

              {/* Import Status */}
              {importStatus.type && (
                <Alert variant={importStatus.type === "error" ? "destructive" : "default"}>
                  {importStatus.type === "success" ? (
                    <CheckCircle2 className="h-4 w-4" />
                  ) : (
                    <AlertCircle className="h-4 w-4" />
                  )}
                  <AlertDescription>{importStatus.message}</AlertDescription>
                </Alert>
              )}
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
