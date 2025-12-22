import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Tag, Plus } from "lucide-react";
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
