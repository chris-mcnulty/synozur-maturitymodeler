import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Tag, Plus, Loader2 } from "lucide-react";
import type { AssessmentTag } from "@shared/schema";

interface AssessmentTagSelectorProps {
  assessmentId: string;
  compact?: boolean;
}

export function AssessmentTagSelector({ assessmentId, compact = false }: AssessmentTagSelectorProps) {
  const { toast } = useToast();
  const [isOpen, setIsOpen] = useState(false);

  const { data: allTags = [] } = useQuery<AssessmentTag[]>({
    queryKey: ['/api/admin/tags'],
  });

  const { data: assignedTags = [] } = useQuery<AssessmentTag[]>({
    queryKey: ['/api/admin/assessments', assessmentId, 'tags'],
    enabled: !!assessmentId,
  });

  const updateTagsMutation = useMutation({
    mutationFn: (tagIds: string[]) =>
      apiRequest(`/api/admin/assessments/${assessmentId}/tags`, 'PUT', { tagIds }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/assessments', assessmentId, 'tags'] });
    },
    onError: () => {
      toast({
        title: "Failed to update tags",
        variant: "destructive",
      });
    },
  });

  const handleToggleTag = (tagId: string) => {
    const currentTagIds = assignedTags.map(t => t.id);
    const newTagIds = currentTagIds.includes(tagId)
      ? currentTagIds.filter(id => id !== tagId)
      : [...currentTagIds, tagId];
    updateTagsMutation.mutate(newTagIds);
  };

  if (allTags.length === 0) {
    return null;
  }

  return (
    <div className="flex items-center gap-1 flex-wrap">
      {assignedTags.map((tag) => (
        <Badge
          key={tag.id}
          style={{ backgroundColor: tag.color, color: "white" }}
          className="text-xs"
        >
          {tag.name}
        </Badge>
      ))}
      
      <Popover open={isOpen} onOpenChange={setIsOpen}>
        <PopoverTrigger asChild>
          <Button 
            size="icon" 
            variant="ghost" 
            className="h-6 w-6"
            data-testid={`button-add-tag-${assessmentId}`}
            aria-label="Manage tags"
          >
            {assignedTags.length === 0 ? (
              <Tag className="h-3 w-3 text-muted-foreground" />
            ) : (
              <Plus className="h-3 w-3 text-muted-foreground" />
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-56 p-2">
          <div className="space-y-1">
            <p className="text-sm font-medium px-2 py-1">Tags</p>
            {allTags.map((tag) => {
              const isAssigned = assignedTags.some(t => t.id === tag.id);
              return (
                <button
                  key={tag.id}
                  className="flex items-center gap-2 w-full px-2 py-1.5 rounded hover:bg-muted text-left"
                  onClick={() => handleToggleTag(tag.id)}
                  disabled={updateTagsMutation.isPending}
                >
                  <Checkbox 
                    checked={isAssigned}
                    className="pointer-events-none"
                  />
                  <div
                    className="w-3 h-3 rounded-full flex-shrink-0"
                    style={{ backgroundColor: tag.color }}
                  />
                  <span className="text-sm truncate">{tag.name}</span>
                </button>
              );
            })}
            {allTags.length === 0 && (
              <p className="text-sm text-muted-foreground px-2 py-1">No tags available</p>
            )}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}

interface BulkAssessmentTagActionsProps {
  assessmentIds: string[];
  onCompleted: () => void;
}

type BulkTagAction = "apply" | "remove";

export function BulkAssessmentTagActions({
  assessmentIds,
  onCompleted,
}: BulkAssessmentTagActionsProps) {
  const { toast } = useToast();
  const [selectedTagId, setSelectedTagId] = useState("");

  const { data: allTags = [] } = useQuery<AssessmentTag[]>({
    queryKey: ["/api/admin/tags"],
  });

  const bulkTagMutation = useMutation({
    mutationFn: (action: BulkTagAction) =>
      apiRequest("/api/admin/assessments/bulk-tags", "POST", {
        assessmentIds,
        tagId: selectedTagId,
        action,
      }),
    onSuccess: async (_data, action) => {
      await Promise.all(
        assessmentIds.map((assessmentId) =>
          queryClient.invalidateQueries({
            queryKey: ["/api/admin/assessments", assessmentId, "tags"],
          }),
        ),
      );
      toast({
        title: action === "apply" ? "Tag applied" : "Tag removed",
        description: `${selectedTagId ? "The selected tag was" : "Tag changes were"} updated for ${assessmentIds.length} result${assessmentIds.length === 1 ? "" : "s"}.`,
      });
      onCompleted();
    },
    onError: () => {
      toast({
        title: "Bulk tag update failed",
        description: "No tag changes were reported as successful. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleAction = (action: BulkTagAction) => {
    if (!selectedTagId || assessmentIds.length === 0) {
      toast({
        title: "Choose a tag first",
        description: "Select a tag before applying or removing it.",
        variant: "destructive",
      });
      return;
    }
    bulkTagMutation.mutate(action);
  };

  return (
    <div
      className="mb-4 flex flex-col gap-3 rounded-md border bg-muted/30 p-3 sm:flex-row sm:items-center sm:justify-between"
      data-testid="bulk-tag-actions"
    >
      <div className="flex items-center gap-2">
        <Tag className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-medium">
          {assessmentIds.length} result{assessmentIds.length === 1 ? "" : "s"} selected
        </span>
      </div>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <Select
          value={selectedTagId}
          onValueChange={setSelectedTagId}
          disabled={bulkTagMutation.isPending || allTags.length === 0}
        >
          <SelectTrigger className="w-full sm:w-52" aria-label="Bulk tag" data-testid="select-bulk-tag">
            <SelectValue placeholder={allTags.length === 0 ? "No tags available" : "Choose a tag"} />
          </SelectTrigger>
          <SelectContent>
            {allTags.map((tag) => (
              <SelectItem key={tag.id} value={tag.id}>
                <span className="flex items-center gap-2">
                  <span
                    className="h-2.5 w-2.5 rounded-full"
                    style={{ backgroundColor: tag.color }}
                  />
                  {tag.name}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          variant="default"
          onClick={() => handleAction("apply")}
          disabled={bulkTagMutation.isPending || !selectedTagId || allTags.length === 0}
          data-testid="button-bulk-apply-tag"
        >
          {bulkTagMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Apply
        </Button>
        <Button
          variant="outline"
          onClick={() => handleAction("remove")}
          disabled={bulkTagMutation.isPending || !selectedTagId || allTags.length === 0}
          data-testid="button-bulk-remove-tag"
        >
          Remove
        </Button>
      </div>
    </div>
  );
}
