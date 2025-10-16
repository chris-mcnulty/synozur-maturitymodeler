import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { AlertCircle, CheckCircle, XCircle, Sparkles, Eye, Clock } from "lucide-react";
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

export function AiContentReviewQueue() {
  const { toast } = useToast();
  const [selectedReview, setSelectedReview] = useState<AiContentReview | null>(null);
  const [showRejectDialog, setShowRejectDialog] = useState(false);
  const [rejectionReason, setRejectionReason] = useState("");

  // Fetch pending reviews
  const { data: reviews = [], isLoading } = useQuery<AiContentReview[]>({
    queryKey: ['/api/admin/ai/pending-reviews'],
  });

  // Approve mutation
  const approveMutation = useMutation({
    mutationFn: (reviewId: string) => 
      apiRequest(`/api/admin/ai/approve-review/${reviewId}`, 'POST', {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/ai/pending-reviews'] });
      toast({
        title: "Content Approved",
        description: "AI-generated content has been approved and will be applied.",
      });
      setSelectedReview(null);
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
    mutationFn: ({ reviewId, reason }: { reviewId: string; reason?: string }) => 
      apiRequest(`/api/admin/ai/reject-review/${reviewId}`, 'POST', { reason }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/ai/pending-reviews'] });
      toast({
        title: "Content Rejected",
        description: "AI-generated content has been rejected.",
      });
      setSelectedReview(null);
      setShowRejectDialog(false);
      setRejectionReason("");
    },
    onError: () => {
      toast({
        title: "Rejection Failed",
        description: "Failed to reject content. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleApprove = (reviewId: string) => {
    approveMutation.mutate(reviewId);
  };

  const handleReject = () => {
    if (selectedReview) {
      rejectMutation.mutate({
        reviewId: selectedReview.id,
        reason: rejectionReason,
      });
    }
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

  const renderContentPreview = (review: AiContentReview) => {
    const content = review.generatedContent;

    switch (review.contentType) {
      case 'maturity_level_interpretation':
        return (
          <div className="space-y-2">
            <div>
              <span className="font-semibold">Title:</span> {content?.title}
            </div>
            <div>
              <span className="font-semibold">Interpretation:</span> {content?.interpretation}
            </div>
            {content?.characteristics && (
              <div>
                <span className="font-semibold">Characteristics:</span>
                <ul className="list-disc list-inside mt-1">
                  {content.characteristics.map((char: string, idx: number) => (
                    <li key={idx}>{char}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        );

      case 'dimension_resources':
        return (
          <div className="space-y-2">
            {content?.resources?.map((resource: any, idx: number) => (
              <div key={idx} className="border-l-2 border-primary pl-3">
                <div className="font-semibold">{resource.title}</div>
                <div className="text-sm text-muted-foreground">{resource.description}</div>
                <div className="text-sm">
                  <a href={resource.link} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                    {resource.link}
                  </a>
                </div>
              </div>
            ))}
          </div>
        );

      case 'answer_improvement':
        return (
          <div className="space-y-2">
            <div>
              <span className="font-semibold">Improvement:</span> {content?.improvementStatement}
            </div>
            <div>
              <span className="font-semibold">Priority:</span> <Badge variant="outline">{content?.priority}</Badge>
            </div>
            {content?.quickWin && (
              <div>
                <span className="font-semibold">Quick Win:</span> {content.quickWin}
              </div>
            )}
          </div>
        );

      case 'answer_rewrite':
        return (
          <div className="space-y-2">
            <div>
              <span className="font-semibold">Rewritten Answer:</span> {content?.rewrittenAnswer}
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
        <CardContent className="space-y-4">
          {reviews.map((review) => (
            <Card key={review.id} className="hover-elevate" data-testid={`card-review-${review.id}`}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 space-y-3">
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

                    {review.metadata?.questionText && (
                      <div className="text-sm text-muted-foreground">
                        Question: {review.metadata.questionText}
                      </div>
                    )}

                    <div className="text-sm text-muted-foreground">
                      Generated by {review.creatorName} · {formatDistanceToNow(new Date(review.createdAt), { addSuffix: true })}
                    </div>

                    <div className="mt-3 p-3 bg-muted rounded-md">
                      {renderContentPreview(review)}
                    </div>
                  </div>

                  <div className="flex flex-col gap-2">
                    <Button
                      size="sm"
                      variant="default"
                      onClick={() => handleApprove(review.id)}
                      disabled={approveMutation.isPending}
                      data-testid={`button-approve-${review.id}`}
                    >
                      <CheckCircle className="h-4 w-4 mr-1" />
                      Approve
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => {
                        setSelectedReview(review);
                        setShowRejectDialog(true);
                      }}
                      disabled={rejectMutation.isPending}
                      data-testid={`button-reject-${review.id}`}
                    >
                      <XCircle className="h-4 w-4 mr-1" />
                      Reject
                    </Button>
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
              onClick={handleReject}
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
