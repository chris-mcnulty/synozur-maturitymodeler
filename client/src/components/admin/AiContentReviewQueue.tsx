import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { AlertCircle, CheckCircle, XCircle, Sparkles, Eye, Clock, CheckSquare, Square } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { formatDistanceToNow } from "date-fns";

interface AiContentReview {
  id: string;
  type: string;
  contentType: string;
  modelId: string | null;
  targetId: string | null;
  generatedContent: any;
  metadata: any;
  status: string;
  createdBy: string;
  createdAt: string;
  reviewedBy: string | null;
  reviewedAt: string | null;
  rejectionReason: string | null;
  creatorName: string;
}

interface EditableContent {
  [reviewId: string]: any;
}

interface SelectedItems {
  [reviewId: string]: string[];
}

export function AiContentReviewQueue() {
  const { toast } = useToast();
  const [selectedReview, setSelectedReview] = useState<AiContentReview | null>(null);
  const [showRejectDialog, setShowRejectDialog] = useState(false);
  const [rejectionReason, setRejectionReason] = useState("");
  const [selectedItems, setSelectedItems] = useState<SelectedItems>({});
  const [editableContent, setEditableContent] = useState<EditableContent>({});

  // Fetch pending reviews
  const { data: reviews = [], isLoading } = useQuery<AiContentReview[]>({
    queryKey: ['/api/admin/ai/pending-reviews'],
  });

  // Initialize editable content when reviews are loaded
  useEffect(() => {
    if (reviews.length > 0) {
      const initialContent: EditableContent = {};
      reviews.forEach(review => {
        initialContent[review.id] = JSON.parse(JSON.stringify(review.generatedContent));
      });
      setEditableContent(initialContent);
    }
  }, [reviews]);

  // Approve mutation
  const approveMutation = useMutation({
    mutationFn: ({ reviewId, selectedItemIds }: { reviewId: string; selectedItemIds?: string[] }) => 
      apiRequest(`/api/admin/ai/approve-review/${reviewId}`, 'POST', { 
        selectedItemIds,
        editedContent: editableContent[reviewId]
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/ai/pending-reviews'] });
      toast({
        title: "Content Approved",
        description: "Selected content has been approved and will be applied.",
      });
      setSelectedReview(null);
      setSelectedItems({});
    },
    onError: () => {
      toast({
        title: "Approval Failed",
        description: "Failed to approve content. Please try again.",
        variant: "destructive",
      });
    },
  });

  // Reject mutation
  const rejectMutation = useMutation({
    mutationFn: ({ reviewId, reason, selectedItemIds }: { reviewId: string; reason?: string; selectedItemIds?: string[] }) => 
      apiRequest(`/api/admin/ai/reject-review/${reviewId}`, 'POST', { 
        reason,
        selectedItemIds 
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/ai/pending-reviews'] });
      toast({
        title: "Content Rejected",
        description: "Selected content has been rejected.",
      });
      setSelectedReview(null);
      setShowRejectDialog(false);
      setRejectionReason("");
      setSelectedItems({});
    },
    onError: () => {
      toast({
        title: "Rejection Failed",
        description: "Failed to reject content. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleBulkApprove = () => {
    const reviewsToApprove = Object.entries(selectedItems).filter(([_, items]) => items.length > 0);
    reviewsToApprove.forEach(([reviewId, items]) => {
      approveMutation.mutate({
        reviewId,
        selectedItemIds: items
      });
    });
  };

  const handleBulkReject = () => {
    const reviewsToReject = Object.entries(selectedItems).filter(([_, items]) => items.length > 0);
    reviewsToReject.forEach(([reviewId, items]) => {
      rejectMutation.mutate({
        reviewId,
        selectedItemIds: items,
        reason: "Bulk rejection"
      });
    });
  };

  const handleSelectAll = () => {
    const allSelections: SelectedItems = {};
    reviews.forEach(review => {
      allSelections[review.id] = getSelectableItemIds(review);
    });
    setSelectedItems(allSelections);
  };

  const handleClearSelection = () => {
    setSelectedItems({});
  };

  const getSelectableItemIds = (review: AiContentReview): string[] => {
    const content = review.generatedContent;
    const ids: string[] = [];

    switch (review.contentType) {
      case 'dimension_resources':
        content?.resources?.forEach((_: any, idx: number) => {
          ids.push(`resource-${idx}`);
        });
        break;
      case 'maturity_level_interpretation':
        if (content?.characteristics) {
          content.characteristics.forEach((_: string, idx: number) => {
            ids.push(`characteristic-${idx}`);
          });
        }
        ids.push('interpretation');
        break;
      case 'answer_improvement':
      case 'answer_rewrite':
        ids.push('main-content');
        break;
    }
    return ids;
  };

  const toggleItemSelection = (reviewId: string, itemId: string) => {
    setSelectedItems(prev => {
      const current = prev[reviewId] || [];
      if (current.includes(itemId)) {
        return {
          ...prev,
          [reviewId]: current.filter(id => id !== itemId)
        };
      } else {
        return {
          ...prev,
          [reviewId]: [...current, itemId]
        };
      }
    });
  };

  const isItemSelected = (reviewId: string, itemId: string) => {
    return selectedItems[reviewId]?.includes(itemId) || false;
  };

  const handleContentEdit = (reviewId: string, path: string[], value: any) => {
    setEditableContent(prev => {
      const updated = { ...prev };
      let current = updated[reviewId];
      
      for (let i = 0; i < path.length - 1; i++) {
        current = current[path[i]];
      }
      
      current[path[path.length - 1]] = value;
      
      return updated;
    });
  };

  const getTotalSelectedCount = () => {
    return Object.values(selectedItems).reduce((sum, items) => sum + items.length, 0);
  };

  const getContentTypeLabel = (contentType: string) => {
    const labels: Record<string, string> = {
      'maturity_level_interpretation': 'Maturity Level Interpretation',
      'dimension_resources': 'Dimension Resources',
      'answer_improvement': 'Answer Improvement',
      'answer_rewrite': 'Answer Rewrite',
    };
    return labels[contentType] || contentType;
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'interpretation':
        return <Sparkles className="h-4 w-4" />;
      case 'resource':
        return <Eye className="h-4 w-4" />;
      case 'improvement':
        return <AlertCircle className="h-4 w-4" />;
      case 'answer-rewrite':
        return <Sparkles className="h-4 w-4" />;
      default:
        return <Clock className="h-4 w-4" />;
    }
  };

  const renderEditableContent = (review: AiContentReview) => {
    const content = editableContent[review.id] || review.generatedContent;
    const reviewId = review.id;

    switch (review.contentType) {
      case 'maturity_level_interpretation':
        return (
          <div className="space-y-4">
            <div className={`p-3 rounded-md border ${isItemSelected(reviewId, 'interpretation') ? 'bg-primary/5 border-primary' : ''}`}>
              <div className="flex items-start gap-3">
                <Checkbox
                  checked={isItemSelected(reviewId, 'interpretation')}
                  onCheckedChange={() => toggleItemSelection(reviewId, 'interpretation')}
                  data-testid={`checkbox-interpretation-${reviewId}`}
                />
                <div className="flex-1 space-y-2">
                  <div>
                    <label className="text-sm font-semibold">Title:</label>
                    <Input
                      value={content?.title || ''}
                      onChange={(e) => handleContentEdit(reviewId, ['title'], e.target.value)}
                      className="mt-1"
                      data-testid={`input-title-${reviewId}`}
                    />
                  </div>
                  <div>
                    <label className="text-sm font-semibold">Interpretation:</label>
                    <Textarea
                      value={content?.interpretation || ''}
                      onChange={(e) => handleContentEdit(reviewId, ['interpretation'], e.target.value)}
                      className="mt-1 min-h-[100px]"
                      data-testid={`textarea-interpretation-${reviewId}`}
                    />
                  </div>
                </div>
              </div>
            </div>
            {content?.characteristics && (
              <div className="space-y-2">
                <span className="font-semibold text-sm">Characteristics:</span>
                {content.characteristics.map((char: string, idx: number) => (
                  <div
                    key={idx}
                    className={`p-3 rounded-md border ${isItemSelected(reviewId, `characteristic-${idx}`) ? 'bg-primary/5 border-primary' : ''}`}
                  >
                    <div className="flex items-start gap-3">
                      <Checkbox
                        checked={isItemSelected(reviewId, `characteristic-${idx}`)}
                        onCheckedChange={() => toggleItemSelection(reviewId, `characteristic-${idx}`)}
                        data-testid={`checkbox-characteristic-${idx}-${reviewId}`}
                      />
                      <Input
                        value={char}
                        onChange={(e) => {
                          const newChars = [...content.characteristics];
                          newChars[idx] = e.target.value;
                          handleContentEdit(reviewId, ['characteristics'], newChars);
                        }}
                        className="flex-1"
                        data-testid={`input-characteristic-${idx}-${reviewId}`}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        );

      case 'dimension_resources':
        return (
          <div className="space-y-3">
            {content?.resources?.map((resource: any, idx: number) => (
              <div
                key={idx}
                className={`p-4 rounded-md border ${isItemSelected(reviewId, `resource-${idx}`) ? 'bg-primary/5 border-primary' : ''}`}
              >
                <div className="flex items-start gap-3">
                  <Checkbox
                    checked={isItemSelected(reviewId, `resource-${idx}`)}
                    onCheckedChange={() => toggleItemSelection(reviewId, `resource-${idx}`)}
                    data-testid={`checkbox-resource-${idx}-${reviewId}`}
                  />
                  <div className="flex-1 space-y-2">
                    <Input
                      value={resource.title}
                      onChange={(e) => {
                        const newResources = [...content.resources];
                        newResources[idx].title = e.target.value;
                        handleContentEdit(reviewId, ['resources'], newResources);
                      }}
                      placeholder="Resource title"
                      className="font-semibold"
                      data-testid={`input-resource-title-${idx}-${reviewId}`}
                    />
                    <Textarea
                      value={resource.description}
                      onChange={(e) => {
                        const newResources = [...content.resources];
                        newResources[idx].description = e.target.value;
                        handleContentEdit(reviewId, ['resources'], newResources);
                      }}
                      placeholder="Resource description"
                      className="text-sm min-h-[60px]"
                      data-testid={`textarea-resource-description-${idx}-${reviewId}`}
                    />
                    <Input
                      value={resource.link}
                      onChange={(e) => {
                        const newResources = [...content.resources];
                        newResources[idx].link = e.target.value;
                        handleContentEdit(reviewId, ['resources'], newResources);
                      }}
                      placeholder="Resource URL"
                      className="text-sm"
                      data-testid={`input-resource-link-${idx}-${reviewId}`}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        );

      case 'answer_improvement':
        return (
          <div className={`p-4 rounded-md border ${isItemSelected(reviewId, 'main-content') ? 'bg-primary/5 border-primary' : ''}`}>
            <div className="flex items-start gap-3">
              <Checkbox
                checked={isItemSelected(reviewId, 'main-content')}
                onCheckedChange={() => toggleItemSelection(reviewId, 'main-content')}
                data-testid={`checkbox-improvement-${reviewId}`}
              />
              <div className="flex-1 space-y-3">
                <div>
                  <label className="text-sm font-semibold">Improvement:</label>
                  <Textarea
                    value={content?.improvementStatement || ''}
                    onChange={(e) => handleContentEdit(reviewId, ['improvementStatement'], e.target.value)}
                    className="mt-1 min-h-[80px]"
                    data-testid={`textarea-improvement-${reviewId}`}
                  />
                </div>
                <div className="flex gap-3">
                  <div className="flex-1">
                    <label className="text-sm font-semibold">Priority:</label>
                    <Input
                      value={content?.priority || ''}
                      onChange={(e) => handleContentEdit(reviewId, ['priority'], e.target.value)}
                      className="mt-1"
                      data-testid={`input-priority-${reviewId}`}
                    />
                  </div>
                  {content?.quickWin && (
                    <div className="flex-1">
                      <label className="text-sm font-semibold">Quick Win:</label>
                      <Input
                        value={content.quickWin}
                        onChange={(e) => handleContentEdit(reviewId, ['quickWin'], e.target.value)}
                        className="mt-1"
                        data-testid={`input-quickwin-${reviewId}`}
                      />
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        );

      case 'answer_rewrite':
        return (
          <div className={`p-4 rounded-md border ${isItemSelected(reviewId, 'main-content') ? 'bg-primary/5 border-primary' : ''}`}>
            <div className="flex items-start gap-3">
              <Checkbox
                checked={isItemSelected(reviewId, 'main-content')}
                onCheckedChange={() => toggleItemSelection(reviewId, 'main-content')}
                data-testid={`checkbox-rewrite-${reviewId}`}
              />
              <div className="flex-1 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-semibold text-muted-foreground">Original Answer:</label>
                    <div className="mt-1 p-3 rounded-md bg-muted/50 border min-h-[100px]">
                      <p className="text-sm">{review.metadata?.answerText || 'N/A'}</p>
                    </div>
                  </div>
                  <div>
                    <label className="text-sm font-semibold">Rewritten Answer:</label>
                    <Textarea
                      value={content?.rewrittenAnswer || ''}
                      onChange={(e) => handleContentEdit(reviewId, ['rewrittenAnswer'], e.target.value)}
                      className="mt-1 min-h-[100px]"
                      data-testid={`textarea-rewrite-${reviewId}`}
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        );

      default:
        return <pre className="text-sm">{JSON.stringify(content, null, 2)}</pre>;
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="text-center text-muted-foreground">Loading pending reviews...</div>
        </CardContent>
      </Card>
    );
  }

  if (reviews.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>AI Content Review Queue</CardTitle>
          <CardDescription>
            Review and approve AI-generated content before it's applied to your models
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-muted-foreground">
            <Sparkles className="h-12 w-12 mx-auto mb-3 opacity-50" />
            <div>No pending reviews</div>
            <div className="text-sm">AI-generated content will appear here for approval</div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            AI Content Review Queue
            <Badge variant="secondary" data-testid="badge-pending-count">{reviews.length}</Badge>
          </CardTitle>
          <CardDescription>
            Review and approve AI-generated content before it's applied to your models
          </CardDescription>
        </CardHeader>
        
        {/* Bulk Action Bar */}
        {getTotalSelectedCount() > 0 && (
          <div className="px-6 pb-4">
            <div className="flex items-center justify-between p-3 bg-muted rounded-md">
              <div className="flex items-center gap-2">
                <CheckSquare className="h-4 w-4" />
                <span className="text-sm font-medium">{getTotalSelectedCount()} items selected</span>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleClearSelection}
                  data-testid="button-clear-selection"
                >
                  <Square className="h-4 w-4 mr-1" />
                  Clear Selection
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={handleBulkReject}
                  data-testid="button-reject-selected"
                >
                  <XCircle className="h-4 w-4 mr-1" />
                  Reject Selected
                </Button>
                <Button
                  variant="default"
                  size="sm"
                  onClick={handleBulkApprove}
                  data-testid="button-approve-selected"
                >
                  <CheckCircle className="h-4 w-4 mr-1" />
                  Approve Selected
                </Button>
              </div>
            </div>
          </div>
        )}
        
        {/* Select All Button */}
        {reviews.length > 0 && (
          <div className="px-6 pb-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleSelectAll}
              data-testid="button-select-all"
            >
              <CheckSquare className="h-4 w-4 mr-1" />
              Select All Items
            </Button>
          </div>
        )}
        
        <CardContent className="space-y-4">
          {reviews.map((review) => (
            <Card key={review.id} className="hover-elevate" data-testid={`card-review-${review.id}`}>
              <CardContent className="p-4">
                <div className="space-y-4">
                  <div className="flex items-center gap-2">
                    {getTypeIcon(review.type)}
                    <span className="font-semibold">{getContentTypeLabel(review.contentType)}</span>
                    <Badge variant="outline">{review.type}</Badge>
                  </div>

                  {review.metadata?.modelName && (
                    <div className="text-sm text-muted-foreground">
                      Model: {review.metadata.modelName}
                    </div>
                  )}

                  {review.metadata?.dimensionLabel && (
                    <div className="text-sm text-muted-foreground">
                      Dimension: {review.metadata.dimensionLabel}
                    </div>
                  )}

                  <div className="border rounded-md p-4 bg-muted/30">
                    {renderEditableContent(review)}
                  </div>

                  <div className="flex items-center justify-between pt-2">
                    <div className="text-xs text-muted-foreground">
                      Submitted by {review.creatorName || 'Unknown'} • {formatDistanceToNow(new Date(review.createdAt), { addSuffix: true })}
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setSelectedReview(review);
                          setShowRejectDialog(true);
                        }}
                        data-testid={`button-reject-${review.id}`}
                      >
                        <XCircle className="h-4 w-4 mr-1" />
                        Reject
                      </Button>
                      <Button
                        variant="default"
                        size="sm"
                        onClick={() => {
                          approveMutation.mutate({
                            reviewId: review.id,
                            selectedItemIds: getSelectableItemIds(review)
                          });
                        }}
                        data-testid={`button-approve-${review.id}`}
                      >
                        <CheckCircle className="h-4 w-4 mr-1" />
                        Accept
                      </Button>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </CardContent>
      </Card>

      {/* Reject Dialog */}
      <Dialog open={showRejectDialog} onOpenChange={setShowRejectDialog}>
        <DialogContent data-testid="dialog-reject">
          <DialogHeader>
            <DialogTitle>Reject AI Content</DialogTitle>
            <DialogDescription>
              Optionally provide a reason for rejecting this content. This will be logged for future reference.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Textarea
              placeholder="Rejection reason (optional)"
              value={rejectionReason}
              onChange={(e) => setRejectionReason(e.target.value)}
              rows={4}
              data-testid="textarea-rejection-reason"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRejectDialog(false)} data-testid="button-cancel-reject">
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (selectedReview) {
                  rejectMutation.mutate({
                    reviewId: selectedReview.id,
                    reason: rejectionReason,
                    selectedItemIds: getSelectableItemIds(selectedReview)
                  });
                }
              }}
              disabled={rejectMutation.isPending}
              data-testid="button-confirm-reject"
            >
              Reject Content
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
