import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Download, User, Building, Briefcase, Globe, Calendar, ClipboardList } from "lucide-react";

interface ReviewQuestion {
  questionId: string;
  dimensionId: string | null;
  order: number;
  questionText: string;
  questionType: string;
  answerText: string;
  answerScore: number | null;
  respondedAt: string;
}

interface ReviewDimensionGroup {
  dimensionName: string;
  order: number;
  questions: ReviewQuestion[];
}

interface ReviewData {
  assessment: {
    id: string;
    modelName: string;
    status: string;
    startedAt: string;
    completedAt: string | null;
    isProxy: boolean;
    subject: {
      name: string | null;
      company: string | null;
      jobTitle: string | null;
      industry: string | null;
      country: string | null;
    } | null;
  };
  result: { overallScore: number; label: string } | null;
  dimensionGroups: ReviewDimensionGroup[];
  totalQuestions: number;
}

interface AssessmentReviewDialogProps {
  assessmentId: string | null;
  onClose: () => void;
}

function formatDateTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function exportToCsv(data: ReviewData) {
  const rows: string[][] = [];

  // Header block
  rows.push(["Assessment Review Export"]);
  rows.push(["Model", data.assessment.modelName]);
  rows.push(["Date", formatDateTime(data.assessment.startedAt)]);
  if (data.assessment.completedAt) {
    rows.push(["Completed", formatDateTime(data.assessment.completedAt)]);
  }
  rows.push(["Status", data.assessment.status]);
  if (data.result) {
    rows.push(["Overall Score", String(data.result.overallScore), data.result.label]);
  }
  if (data.assessment.isProxy && data.assessment.subject) {
    const s = data.assessment.subject;
    rows.push(["Subject Name", s.name || ""]);
    rows.push(["Company", s.company || ""]);
    if (s.jobTitle) rows.push(["Job Title", s.jobTitle]);
    if (s.industry) rows.push(["Industry", s.industry]);
    if (s.country) rows.push(["Country", s.country]);
  }
  rows.push([]);
  rows.push(["Dimension", "Question", "Answer", "Score"]);

  for (const group of data.dimensionGroups) {
    for (const q of group.questions) {
      rows.push([
        group.dimensionName,
        q.questionText,
        q.answerText || "(no answer)",
        q.answerScore !== null ? String(q.answerScore) : "",
      ]);
    }
  }

  const csvContent = rows
    .map((row) =>
      row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")
    )
    .join("\n");

  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  const subject = data.assessment.isProxy
    ? data.assessment.subject?.name || data.assessment.id
    : data.assessment.id;
  link.href = url;
  link.download = `assessment-review-${subject.replace(/\s+/g, "-")}-${new Date(data.assessment.startedAt).toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

export function AssessmentReviewDialog({ assessmentId, onClose }: AssessmentReviewDialogProps) {
  const open = !!assessmentId;

  const { data, isLoading, error } = useQuery<ReviewData>({
    queryKey: ["/api/admin/assessments", assessmentId, "review"],
    queryFn: async () => {
      const res = await fetch(`/api/admin/assessments/${assessmentId}/review`);
      if (!res.ok) throw new Error("Failed to load review");
      return res.json();
    },
    enabled: !!assessmentId,
  });

  let questionCounter = 0;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col" data-testid="dialog-assessment-review">
        <DialogHeader className="flex-shrink-0">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <DialogTitle className="flex items-center gap-2">
              <ClipboardList className="h-5 w-5" />
              Assessment Review
            </DialogTitle>
            {data && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => exportToCsv(data)}
                data-testid="button-export-review-csv"
              >
                <Download className="h-4 w-4 mr-1.5" />
                Export CSV
              </Button>
            )}
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto pr-1 space-y-5">
          {isLoading && (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          )}

          {error && (
            <p className="text-destructive text-sm py-8 text-center">
              Failed to load assessment review. Please try again.
            </p>
          )}

          {data && (
            <>
              {/* Metadata card */}
              <div className="rounded-md border bg-muted/30 p-4 space-y-3">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-sm">{data.assessment.modelName}</span>
                  <Badge variant={data.assessment.status === "completed" ? "default" : "secondary"} className="text-xs">
                    {data.assessment.status}
                  </Badge>
                  {data.assessment.isProxy && (
                    <Badge variant="secondary" className="text-xs">Proxy</Badge>
                  )}
                  {data.result && (
                    <Badge variant="outline" className="text-xs ml-auto">
                      Score: {data.result.overallScore} — {data.result.label}
                    </Badge>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5 text-sm">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Calendar className="h-3.5 w-3.5 flex-shrink-0" />
                    <span>Started: <span className="text-foreground">{formatDateTime(data.assessment.startedAt)}</span></span>
                  </div>
                  {data.assessment.completedAt && (
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Calendar className="h-3.5 w-3.5 flex-shrink-0" />
                      <span>Completed: <span className="text-foreground">{formatDateTime(data.assessment.completedAt)}</span></span>
                    </div>
                  )}
                  {data.assessment.isProxy && data.assessment.subject && (
                    <>
                      {data.assessment.subject.name && (
                        <div className="flex items-center gap-2 text-muted-foreground">
                          <User className="h-3.5 w-3.5 flex-shrink-0" />
                          <span className="text-foreground">{data.assessment.subject.name}</span>
                        </div>
                      )}
                      {data.assessment.subject.company && (
                        <div className="flex items-center gap-2 text-muted-foreground">
                          <Building className="h-3.5 w-3.5 flex-shrink-0" />
                          <span className="text-foreground">{data.assessment.subject.company}</span>
                        </div>
                      )}
                      {data.assessment.subject.jobTitle && (
                        <div className="flex items-center gap-2 text-muted-foreground">
                          <Briefcase className="h-3.5 w-3.5 flex-shrink-0" />
                          <span className="text-foreground">{data.assessment.subject.jobTitle}</span>
                        </div>
                      )}
                      {data.assessment.subject.country && (
                        <div className="flex items-center gap-2 text-muted-foreground">
                          <Globe className="h-3.5 w-3.5 flex-shrink-0" />
                          <span className="text-foreground">{data.assessment.subject.country}</span>
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>

              {/* Q&A by dimension */}
              {data.dimensionGroups.length === 0 && (
                <p className="text-muted-foreground text-sm text-center py-8">
                  No responses recorded for this assessment.
                </p>
              )}

              {data.dimensionGroups.map((group) => (
                <div key={group.dimensionName} className="space-y-2">
                  <h3 className="text-xs font-bold tracking-wider uppercase text-muted-foreground border-b pb-1.5">
                    {group.dimensionName}
                  </h3>
                  <div className="space-y-2">
                    {group.questions.map((q) => {
                      questionCounter += 1;
                      const num = questionCounter;
                      return (
                        <div
                          key={q.questionId}
                          className="rounded-md border bg-card px-4 py-3 space-y-1"
                          data-testid={`review-question-${q.questionId}`}
                        >
                          <p className="text-sm text-muted-foreground leading-snug">
                            <span className="text-foreground font-medium mr-1.5">Q{num}.</span>
                            {q.questionText}
                          </p>
                          <div className="flex items-center gap-3 flex-wrap pt-0.5">
                            <span
                              className="text-sm font-medium text-foreground"
                              data-testid={`review-answer-${q.questionId}`}
                            >
                              {q.answerText || <span className="text-muted-foreground italic">No answer recorded</span>}
                            </span>
                            {q.answerScore !== null && (
                              <Badge variant="outline" className="text-xs">
                                Score: {q.answerScore}
                              </Badge>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
