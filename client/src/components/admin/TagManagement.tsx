import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Plus, Edit, Trash, Tag } from "lucide-react";
import type { AssessmentTag } from "@shared/schema";

const TAG_COLORS = [
  "#6366f1", // Indigo
  "#8b5cf6", // Violet
  "#a855f7", // Purple
  "#d946ef", // Fuchsia
  "#ec4899", // Pink
  "#f43f5e", // Rose
  "#ef4444", // Red
  "#f97316", // Orange
  "#f59e0b", // Amber
  "#eab308", // Yellow
  "#84cc16", // Lime
  "#22c55e", // Green
  "#10b981", // Emerald
  "#14b8a6", // Teal
  "#06b6d4", // Cyan
  "#0ea5e9", // Sky
  "#3b82f6", // Blue
  "#6b7280", // Gray
];

export function TagManagement() {
  const { toast } = useToast();
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editingTag, setEditingTag] = useState<AssessmentTag | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    color: "#6366f1",
    description: "",
  });

  const { data: tags = [], isLoading } = useQuery<AssessmentTag[]>({
    queryKey: ['/api/admin/tags'],
  });

  const createTagMutation = useMutation({
    mutationFn: (data: { name: string; color: string; description: string }) =>
      apiRequest('/api/admin/tags', 'POST', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/tags'] });
      toast({ title: "Tag created successfully" });
      setIsCreateDialogOpen(false);
      resetForm();
    },
    onError: (error: any) => {
      toast({
        title: "Failed to create tag",
        description: error.message || "A tag with this name may already exist.",
        variant: "destructive",
      });
    },
  });

  const updateTagMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: { name: string; color: string; description: string } }) =>
      apiRequest(`/api/admin/tags/${id}`, 'PATCH', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/tags'] });
      toast({ title: "Tag updated successfully" });
      setIsEditDialogOpen(false);
      setEditingTag(null);
      resetForm();
    },
    onError: (error: any) => {
      toast({
        title: "Failed to update tag",
        description: error.message || "A tag with this name may already exist.",
        variant: "destructive",
      });
    },
  });

  const deleteTagMutation = useMutation({
    mutationFn: (id: string) =>
      apiRequest(`/api/admin/tags/${id}`, 'DELETE'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/tags'] });
      toast({ title: "Tag deleted successfully" });
    },
    onError: () => {
      toast({
        title: "Failed to delete tag",
        variant: "destructive",
      });
    },
  });

  const resetForm = () => {
    setFormData({ name: "", color: "#6366f1", description: "" });
  };

  const handleCreateTag = () => {
    if (!formData.name.trim()) {
      toast({ title: "Tag name is required", variant: "destructive" });
      return;
    }
    createTagMutation.mutate(formData);
  };

  const handleUpdateTag = () => {
    if (!editingTag || !formData.name.trim()) {
      toast({ title: "Tag name is required", variant: "destructive" });
      return;
    }
    updateTagMutation.mutate({ id: editingTag.id, data: formData });
  };

  const handleEditClick = (tag: AssessmentTag) => {
    setEditingTag(tag);
    setFormData({
      name: tag.name,
      color: tag.color,
      description: tag.description || "",
    });
    setIsEditDialogOpen(true);
  };

  const handleDeleteClick = (tag: AssessmentTag) => {
    if (confirm(`Are you sure you want to delete the tag "${tag.name}"? This will remove it from all assessments.`)) {
      deleteTagMutation.mutate(tag.id);
    }
  };

  if (isLoading) {
    return (
      <Card className="p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-muted rounded w-1/4" />
          <div className="h-24 bg-muted rounded" />
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card className="p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-xl font-semibold flex items-center gap-2">
              <Tag className="h-5 w-5" />
              Assessment Tags
            </h2>
            <p className="text-muted-foreground text-sm mt-1">
              Create and manage tags to categorize assessments for grouping and analysis
            </p>
          </div>
          <Button 
            onClick={() => {
              resetForm();
              setIsCreateDialogOpen(true);
            }}
            data-testid="button-create-tag"
          >
            <Plus className="h-4 w-4 mr-2" />
            Create Tag
          </Button>
        </div>

        {tags.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <Tag className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>No tags created yet.</p>
            <p className="text-sm">Create your first tag to start categorizing assessments.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {tags.map((tag) => (
              <Card key={tag.id} className="p-4 flex items-start justify-between gap-4">
                <div className="flex items-start gap-3 min-w-0">
                  <div
                    className="w-4 h-4 rounded-full flex-shrink-0 mt-1"
                    style={{ backgroundColor: tag.color }}
                  />
                  <div className="min-w-0">
                    <p className="font-medium truncate">{tag.name}</p>
                    {tag.description && (
                      <p className="text-sm text-muted-foreground line-clamp-2">{tag.description}</p>
                    )}
                  </div>
                </div>
                <div className="flex gap-1 flex-shrink-0">
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => handleEditClick(tag)}
                    data-testid={`button-edit-tag-${tag.id}`}
                    aria-label="Edit tag"
                  >
                    <Edit className="h-4 w-4" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => handleDeleteClick(tag)}
                    data-testid={`button-delete-tag-${tag.id}`}
                    aria-label="Delete tag"
                  >
                    <Trash className="h-4 w-4" />
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        )}
      </Card>

      {/* Create Tag Dialog */}
      <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Tag</DialogTitle>
            <DialogDescription>
              Create a new tag to categorize assessments.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="tag-name">Name *</Label>
              <Input
                id="tag-name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="e.g., Priority, Q4 2024, Follow-up"
                data-testid="input-tag-name"
              />
            </div>
            <div className="space-y-2">
              <Label>Color</Label>
              <div className="flex flex-wrap gap-2">
                {TAG_COLORS.map((color) => (
                  <button
                    key={color}
                    type="button"
                    className={`w-8 h-8 rounded-full border-2 transition-transform hover:scale-110 ${
                      formData.color === color ? "border-foreground scale-110" : "border-transparent"
                    }`}
                    style={{ backgroundColor: color }}
                    onClick={() => setFormData({ ...formData, color })}
                    data-testid={`button-color-${color.replace('#', '')}`}
                  />
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="tag-description">Description (optional)</Label>
              <Input
                id="tag-description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Brief description of what this tag represents"
                data-testid="input-tag-description"
              />
            </div>
            <div className="pt-2">
              <Label>Preview</Label>
              <div className="mt-2">
                <Badge
                  style={{ backgroundColor: formData.color, color: "white" }}
                  className="text-sm"
                >
                  {formData.name || "Tag Name"}
                </Badge>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setIsCreateDialogOpen(false);
                resetForm();
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={handleCreateTag}
              disabled={createTagMutation.isPending}
              data-testid="button-save-tag"
            >
              {createTagMutation.isPending ? "Creating..." : "Create Tag"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Tag Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Tag</DialogTitle>
            <DialogDescription>
              Update the tag details.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="edit-tag-name">Name *</Label>
              <Input
                id="edit-tag-name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="Tag name"
                data-testid="input-edit-tag-name"
              />
            </div>
            <div className="space-y-2">
              <Label>Color</Label>
              <div className="flex flex-wrap gap-2">
                {TAG_COLORS.map((color) => (
                  <button
                    key={color}
                    type="button"
                    className={`w-8 h-8 rounded-full border-2 transition-transform hover:scale-110 ${
                      formData.color === color ? "border-foreground scale-110" : "border-transparent"
                    }`}
                    style={{ backgroundColor: color }}
                    onClick={() => setFormData({ ...formData, color })}
                  />
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-tag-description">Description (optional)</Label>
              <Input
                id="edit-tag-description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Brief description"
                data-testid="input-edit-tag-description"
              />
            </div>
            <div className="pt-2">
              <Label>Preview</Label>
              <div className="mt-2">
                <Badge
                  style={{ backgroundColor: formData.color, color: "white" }}
                  className="text-sm"
                >
                  {formData.name || "Tag Name"}
                </Badge>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setIsEditDialogOpen(false);
                setEditingTag(null);
                resetForm();
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={handleUpdateTag}
              disabled={updateTagMutation.isPending}
              data-testid="button-update-tag"
            >
              {updateTagMutation.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
