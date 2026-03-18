/**
 * BulkTools (formerly ContentManagement)
 *
 * Provides bulk operations for model content:
 *   - CSV question import / export
 *   - Links to AI Review Queue and AI Usage
 *
 * Individual question and answer editing is now handled inline in the
 * ModelBuilder → Structure tab via UnifiedQuestionEditor.
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Download, Upload, Sparkles, BarChart2, Info } from "lucide-react";
import type { Model } from "@shared/schema";

export function ContentManagement() {
  const { toast } = useToast();
  const [selectedModelId, setSelectedModelId] = useState<string>("");

  const { data: models = [] } = useQuery<Model[]>({
    queryKey: ["/api/models"],
  });

  const handleExportCSV = async () => {
    if (!selectedModelId) return;
    try {
      const response = await fetch(`/api/models/${selectedModelId}/export`, {
        credentials: "include",
      });
      if (!response.ok) throw new Error("Export failed");
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const model = models.find((m) => m.id === selectedModelId);
      a.download = `${model?.slug ?? "model"}-questions.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast({
        title: "Export failed",
        description: "Could not download the CSV. Please try again.",
        variant: "destructive",
      });
    }
  };

  const handleImportCSV = () => {
    if (!selectedModelId) return;
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".csv";
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      try {
        const csvContent = await file.text();
        const response = await fetch(`/api/models/${selectedModelId}/import-questions`, {
          method: "POST",
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ csvContent }),
        });
        if (!response.ok) throw new Error("Import failed");
        const result = await response.json();
        toast({
          title: "Import complete",
          description: `${result.imported ?? "Questions"} imported successfully.`,
        });
      } catch {
        toast({
          title: "Import failed",
          description: "Could not import questions. Check the CSV format and try again.",
          variant: "destructive",
        });
      }
    };
    input.click();
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Bulk Tools</CardTitle>
          <CardDescription>
            Import and export model content in bulk, or use AI tools to generate and review content at scale.
            To edit individual questions and answers, open a model and use the Structure tab.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Model selector */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Select Model</label>
            <Select value={selectedModelId} onValueChange={setSelectedModelId}>
              <SelectTrigger className="w-full max-w-sm" data-testid="select-model">
                <SelectValue placeholder="Choose a model for bulk operations" />
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

          {/* CSV Import / Export */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold">CSV Import / Export</h3>
            <p className="text-sm text-muted-foreground">
              Export all questions and answers as a CSV spreadsheet, edit in bulk, then re-import.
            </p>
            <div className="flex gap-3">
              <Button
                variant="outline"
                onClick={handleExportCSV}
                disabled={!selectedModelId}
                data-testid="button-export-content"
              >
                <Download className="h-4 w-4 mr-2" />
                Export CSV
              </Button>
              <Button
                variant="outline"
                onClick={handleImportCSV}
                disabled={!selectedModelId}
                data-testid="button-import-content"
              >
                <Upload className="h-4 w-4 mr-2" />
                Import CSV
              </Button>
            </div>
          </div>

          {/* AI Tools quick-links */}
          <div className="space-y-3 pt-2 border-t">
            <h3 className="text-sm font-semibold">AI Tools</h3>
            <p className="text-sm text-muted-foreground">
              Use the AI Review queue to approve or reject AI-generated content, or view AI usage statistics.
            </p>
            <div className="flex gap-3">
              <Button
                variant="outline"
                onClick={() => {
                  window.dispatchEvent(new CustomEvent("admin:navigate", { detail: "ai-review" }));
                }}
              >
                <Sparkles className="h-4 w-4 mr-2" />
                AI Review Queue
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  window.dispatchEvent(new CustomEvent("admin:navigate", { detail: "ai-usage" }));
                }}
              >
                <BarChart2 className="h-4 w-4 mr-2" />
                AI Usage
              </Button>
            </div>
          </div>

          {/* Tip */}
          <div className="flex gap-2 p-3 bg-muted/40 rounded-md text-sm text-muted-foreground">
            <Info className="h-4 w-4 flex-shrink-0 mt-0.5" />
            <span>
              To edit questions and answers for a specific model, go to{" "}
              <strong>All Models</strong>, open the model, and use the{" "}
              <strong>Structure</strong> tab. Questions and answers can be edited inline
              — no separate dialogs needed.
            </span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
