import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Trash2, FileText, Calendar, User } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

interface ImportBatch {
  id: string;
  source: string;
  filename: string | null;
  assessmentCount: number;
  questionMappings: Record<string, string> | null;
  metadata: any;
  createdAt: string;
  importedBy: {
    id: string;
    username: string;
    name: string | null;
  };
}

export function ImportBatches() {
  const { toast } = useToast();

  const { data: batches, isLoading } = useQuery<ImportBatch[]>({
    queryKey: ["/api/admin/import/batches"],
  });

  const deleteMutation = useMutation({
    mutationFn: async (batchId: string) => {
      return await apiRequest(`/api/admin/import/batches/${batchId}`, "DELETE");
    },
    onSuccess: (result) => {
      toast({
        title: "Batch Deleted",
        description: result.message,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/import/batches"] });
    },
    onError: (error: Error) => {
      toast({
        variant: "destructive",
        title: "Delete Failed",
        description: error.message,
      });
    },
  });

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center p-12">
          <div className="text-center space-y-2">
            <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full mx-auto" />
            <p className="text-sm text-muted-foreground">Loading import batches...</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!batches || batches.length === 0) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center p-12">
          <div className="text-center space-y-2">
            <FileText className="h-12 w-12 text-muted-foreground mx-auto" />
            <p className="text-lg font-medium">No Import Batches</p>
            <p className="text-sm text-muted-foreground">
              Import batches will appear here after you upload data
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Import History</CardTitle>
          <CardDescription>
            View and manage all imported assessment batches
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {batches.map((batch) => (
              <Card key={batch.id} className="hover-elevate">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 space-y-2">
                      {/* Header Row */}
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant="outline" data-testid={`badge-source-${batch.id}`}>
                          {batch.source}
                        </Badge>
                        <Badge data-testid={`badge-count-${batch.id}`}>
                          {batch.assessmentCount} assessments
                        </Badge>
                      </div>

                      {/* Filename */}
                      {batch.filename && (
                        <div className="flex items-center gap-2 text-sm">
                          <FileText className="h-4 w-4 text-muted-foreground" />
                          <span className="font-medium">{batch.filename}</span>
                        </div>
                      )}

                      {/* Metadata Row */}
                      <div className="flex items-center gap-4 text-sm text-muted-foreground flex-wrap">
                        <div className="flex items-center gap-2">
                          <Calendar className="h-3.5 w-3.5" />
                          {formatDate(batch.createdAt)}
                        </div>
                        <div className="flex items-center gap-2">
                          <User className="h-3.5 w-3.5" />
                          {batch.importedBy.name || batch.importedBy.username}
                        </div>
                      </div>

                      {/* Question Mappings Count */}
                      {batch.questionMappings && (
                        <div className="text-sm text-muted-foreground">
                          {Object.keys(batch.questionMappings).length} question mappings
                        </div>
                      )}
                    </div>

                    {/* Delete Button */}
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                          variant="outline"
                          size="icon"
                          data-testid={`button-delete-batch-${batch.id}`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete Import Batch?</AlertDialogTitle>
                          <AlertDialogDescription>
                            This will permanently delete this import batch and all{" "}
                            <span className="font-semibold">{batch.assessmentCount} imported assessments</span>.
                            This action cannot be undone.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel data-testid="button-cancel-delete">Cancel</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() => deleteMutation.mutate(batch.id)}
                            className="bg-destructive hover:bg-destructive/90"
                            data-testid="button-confirm-delete"
                          >
                            {deleteMutation.isPending ? "Deleting..." : "Delete Batch"}
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
