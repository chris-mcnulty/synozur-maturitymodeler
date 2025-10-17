import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { AlertCircle, Upload, FileJson, CheckCircle, XCircle, AlertTriangle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Progress } from "@/components/ui/progress";

interface QuestionMatch {
  externalId: string;
  externalText: string;
  internalId: string | null;
  internalText: string | null;
  confidence: number;
  dimension: string;
}

interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  questionMatches: QuestionMatch[];
  assessmentCount: number;
  dimensionMappings: Record<string, string>;
}

export function ImportManager() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [importData, setImportData] = useState<any>(null);
  const [validation, setValidation] = useState<ValidationResult | null>(null);
  const [modelSlug] = useState("ai-maturity"); // Fixed model for import
  const { toast } = useToast();

  // Preview mutation
  const previewMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await apiRequest("/api/admin/import/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ importData: data, modelSlug }),
      });
      return response.json();
    },
    onSuccess: (result: ValidationResult) => {
      setValidation(result);
      
      if (result.valid) {
        toast({
          title: "Validation Successful",
          description: `Ready to import ${result.assessmentCount} assessments with ${result.questionMatches.length} question mappings.`,
        });
      } else {
        toast({
          variant: "destructive",
          title: "Validation Failed",
          description: result.errors.join(", "),
        });
      }
    },
    onError: (error: Error) => {
      toast({
        variant: "destructive",
        title: "Validation Error",
        description: error.message,
      });
    },
  });

  // Execute mutation
  const executeMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await apiRequest("/api/admin/import/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          importData: data, 
          modelSlug,
          filename: selectedFile?.name || "unknown.json"
        }),
      });
      return response.json();
    },
    onSuccess: (result) => {
      toast({
        title: "Import Complete",
        description: `Successfully imported ${result.importedCount} assessments.`,
      });
      
      // Reset form
      setSelectedFile(null);
      setImportData(null);
      setValidation(null);
      
      // Invalidate batches query
      queryClient.invalidateQueries({ queryKey: ["/api/admin/import/batches"] });
    },
    onError: (error: Error) => {
      toast({
        variant: "destructive",
        title: "Import Failed",
        description: error.message,
      });
    },
  });

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setSelectedFile(file);
    setValidation(null);

    try {
      const text = await file.text();
      const data = JSON.parse(text);
      setImportData(data);
      
      toast({
        title: "File Loaded",
        description: `${file.name} loaded successfully. Click "Validate" to check compatibility.`,
      });
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Invalid File",
        description: "Could not parse JSON file. Please check the file format.",
      });
      setSelectedFile(null);
      setImportData(null);
    }
  };

  const handleValidate = () => {
    if (!importData) return;
    previewMutation.mutate(importData);
  };

  const handleExecute = () => {
    if (!importData || !validation?.valid) return;
    executeMutation.mutate(importData);
  };

  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 0.9) return "text-green-600 dark:text-green-400";
    if (confidence >= 0.7) return "text-yellow-600 dark:text-yellow-400";
    return "text-red-600 dark:text-red-400";
  };

  const getConfidenceBadge = (confidence: number) => {
    if (confidence >= 0.9) return <Badge variant="default" className="bg-green-600">Excellent</Badge>;
    if (confidence >= 0.7) return <Badge variant="outline" className="border-yellow-600 text-yellow-600">Good</Badge>;
    return <Badge variant="destructive">Poor</Badge>;
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5" />
            Upload Import File
          </CardTitle>
          <CardDescription>
            Select an assessment export JSON file from the external system
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-4">
            <Button
              variant="outline"
              onClick={() => document.getElementById("import-file")?.click()}
              data-testid="button-select-file"
            >
              <FileJson className="h-4 w-4 mr-2" />
              Select File
            </Button>
            <input
              id="import-file"
              type="file"
              accept=".json"
              className="hidden"
              onChange={handleFileSelect}
              data-testid="input-file"
            />
            {selectedFile && (
              <span className="text-sm text-muted-foreground">
                {selectedFile.name} ({(selectedFile.size / 1024).toFixed(1)} KB)
              </span>
            )}
          </div>

          {importData && !validation && (
            <Button
              onClick={handleValidate}
              disabled={previewMutation.isPending}
              data-testid="button-validate"
            >
              {previewMutation.isPending ? "Validating..." : "Validate Import"}
            </Button>
          )}
        </CardContent>
      </Card>

      {validation && (
        <>
          {/* Validation Summary */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                {validation.valid ? (
                  <CheckCircle className="h-5 w-5 text-green-600" />
                ) : (
                  <XCircle className="h-5 w-5 text-red-600" />
                )}
                Validation Results
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Errors */}
              {validation.errors.length > 0 && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    <div className="font-semibold mb-2">Errors:</div>
                    <ul className="list-disc list-inside space-y-1">
                      {validation.errors.map((error, i) => (
                        <li key={i} className="text-sm">{error}</li>
                      ))}
                    </ul>
                  </AlertDescription>
                </Alert>
              )}

              {/* Warnings */}
              {validation.warnings.length > 0 && (
                <Alert>
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription>
                    <div className="font-semibold mb-2">Warnings:</div>
                    <ul className="list-disc list-inside space-y-1">
                      {validation.warnings.map((warning, i) => (
                        <li key={i} className="text-sm">{warning}</li>
                      ))}
                    </ul>
                  </AlertDescription>
                </Alert>
              )}

              {/* Stats */}
              <div className="grid grid-cols-3 gap-4">
                <div className="p-4 border rounded-md">
                  <div className="text-2xl font-bold">{validation.assessmentCount}</div>
                  <div className="text-sm text-muted-foreground">Assessments</div>
                </div>
                <div className="p-4 border rounded-md">
                  <div className="text-2xl font-bold">{validation.questionMatches.length}</div>
                  <div className="text-sm text-muted-foreground">Questions</div>
                </div>
                <div className="p-4 border rounded-md">
                  <div className="text-2xl font-bold">
                    {validation.questionMatches.filter(m => m.confidence >= 0.9).length}
                  </div>
                  <div className="text-sm text-muted-foreground">High Confidence</div>
                </div>
              </div>

              {/* Execute Button */}
              {validation.valid && (
                <Button
                  onClick={handleExecute}
                  disabled={executeMutation.isPending}
                  className="w-full"
                  data-testid="button-execute-import"
                >
                  {executeMutation.isPending ? (
                    <span className="flex items-center gap-2">
                      <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" />
                      Importing {validation.assessmentCount} assessments...
                    </span>
                  ) : (
                    `Import ${validation.assessmentCount} Assessments`
                  )}
                </Button>
              )}
            </CardContent>
          </Card>

          {/* Question Mappings */}
          <Card>
            <CardHeader>
              <CardTitle>Question Mappings</CardTitle>
              <CardDescription>
                How external questions map to internal questions
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {validation.questionMatches.map((match, i) => (
                  <div key={i} className="border rounded-md p-3 space-y-2">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium mb-1">External: {match.externalId}</div>
                        <div className="text-sm text-muted-foreground truncate">{match.externalText}</div>
                      </div>
                      <div className="flex items-center gap-2">
                        {getConfidenceBadge(match.confidence)}
                        <span className={`text-sm font-mono ${getConfidenceColor(match.confidence)}`}>
                          {(match.confidence * 100).toFixed(0)}%
                        </span>
                      </div>
                    </div>
                    {match.internalId && (
                      <div className="text-sm text-muted-foreground border-t pt-2">
                        <span className="font-medium">Maps to:</span> {match.internalText}
                      </div>
                    )}
                    {!match.internalId && (
                      <div className="text-sm text-red-600 dark:text-red-400">
                        No matching internal question found
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
