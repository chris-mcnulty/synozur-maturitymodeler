import { useQuery } from "@tanstack/react-query";
import { usePageTitle } from "@/hooks/use-page-title";
import { Link } from "wouter";
import { Helmet } from "react-helmet-async";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { BookOpen, Download, Award, ChevronRight, ClipboardCheck, CalendarClock } from "lucide-react";
import type { Course, CourseEnrollment } from "@shared/schema";

interface EnrollmentWithCourse extends CourseEnrollment {
  course: Course;
}

interface MandatoryTrainingItem {
  itemId?: string;
  kind?: string;
  title?: string;
  status?: string;
  completedAt?: string | null;
  progressPercent?: number;
  score?: number | null;
  resultLabel?: string | null;
  href?: string | null;
}

interface MandatoryTrainingAssignment {
  id?: string;
  userId?: string;
  name?: string;
  email?: string;
  status?: string;
  completedAt?: string | null;
  schedule?: { id?: string; title?: string; releaseAt?: string; dueAt?: string; [key: string]: any };
  title?: string;
  releaseAt?: string;
  dueAt?: string;
  items?: MandatoryTrainingItem[];
  recipients?: Array<{
    userId?: string;
    status?: string;
    completedAt?: string | null;
    items?: MandatoryTrainingItem[];
  }>;
}

function formatTrainingDate(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

export default function MyCourses() {
  usePageTitle("My Courses");
  const { data: enrollments, isLoading } = useQuery<EnrollmentWithCourse[]>({
    queryKey: ["/api/me/courses"],
  });
  const { data: mandatoryTraining, isLoading: mandatoryLoading, isError: mandatoryError } = useQuery<MandatoryTrainingAssignment[]>({
    queryKey: ["/api/me/mandatory-training"],
    staleTime: 0,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
    refetchInterval: 60_000,
  });

  return (
    <div className="container mx-auto px-4 py-8 max-w-5xl">
      <Helmet>
        <title>My Courses | Orion</title>
        <meta name="description" content="Track your enrolled courses and download completion certificates." />
      </Helmet>

      <div className="mb-8 flex items-end justify-between gap-2 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold mb-2" data-testid="text-my-courses-heading">My Courses</h1>
          <p className="text-muted-foreground">Your enrollments, progress, and earned certificates.</p>
        </div>
        <Link href="/courses">
          <Button variant="outline" data-testid="button-browse-courses">
            <BookOpen className="h-4 w-4 mr-2" /> Browse catalog
          </Button>
        </Link>
      </div>

      <section className="mb-8 space-y-3" aria-labelledby="mandatory-training-heading" data-testid="section-mandatory-training">
        <div>
          <h2 id="mandatory-training-heading" className="text-xl font-semibold flex items-center gap-2">
            <ClipboardCheck className="h-5 w-5" /> Required training
          </h2>
          <p className="text-sm text-muted-foreground">Training assigned to you by your organization.</p>
        </div>
        {mandatoryLoading && <Skeleton className="h-24" data-testid="skeleton-mandatory-training" />}
        {mandatoryError && (
          <Card><CardContent className="pt-6 text-sm text-destructive" role="alert">
            Required training could not be loaded. Please refresh to try again.
          </CardContent></Card>
        )}
        {!mandatoryLoading && !mandatoryError && (!mandatoryTraining || mandatoryTraining.length === 0) && (
          <Card><CardContent className="pt-6 text-sm text-muted-foreground">
            You have no required training assignments.
          </CardContent></Card>
        )}
        {(mandatoryTraining || []).map((assignment, index) => {
          const schedule = assignment.schedule || assignment;
          const recipient = assignment.recipients?.[0];
          const key = schedule.id || assignment.userId || `${schedule.title || "assignment"}-${index}`;
          const items = recipient?.items || assignment.items || [];
          const status = assignment.status || recipient?.status;
          return (
            <Card key={key} data-testid={`card-mandatory-training-${key}`}>
              <CardHeader>
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div>
                    <CardTitle className="text-lg">{schedule.title || assignment.title || "Required training"}</CardTitle>
                    <p className="mt-1 flex items-center gap-1 text-sm text-muted-foreground">
                      <CalendarClock className="h-4 w-4" /> Due {formatTrainingDate(schedule.dueAt || assignment.dueAt)}
                    </p>
                  </div>
                  <Badge variant={(status || "").toLowerCase() === "completed" ? "secondary" : "outline"}>
                    {status || "required"}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {items.map((item, itemIndex) => (
                  <div key={item.itemId || `${item.title || "item"}-${itemIndex}`} className="flex items-center justify-between gap-3 rounded-md border p-3 flex-wrap">
                    <div>
                      <p className="font-medium">{item.title || "Training item"}</p>
                      <p className="text-sm text-muted-foreground">
                        {item.status || "required"}
                        {typeof item.progressPercent === "number" ? ` · ${item.progressPercent}% complete` : ""}
                        {item.resultLabel ? ` · ${item.resultLabel}` : ""}
                      </p>
                    </div>
                    {item.href && (
                      <a href={item.href}>
                        <Button size="sm" variant="outline" data-testid={`button-open-required-training-${item.itemId || itemIndex}`}>
                          {(item.status || "").toLowerCase() === "completed" ? "Review" : "Start"} <ChevronRight className="h-4 w-4 ml-1" />
                        </Button>
                      </a>
                    )}
                  </div>
                ))}
                {!items.length && <p className="text-sm text-muted-foreground">No required items are available yet.</p>}
                {(assignment.completedAt || recipient?.completedAt) && <p className="text-xs text-muted-foreground">Completed {formatTrainingDate(assignment.completedAt || recipient?.completedAt)}</p>}
              </CardContent>
            </Card>
          );
        })}
      </section>

      {isLoading && (
        <div className="space-y-4">
          {[1, 2, 3].map(i => (
            <Skeleton key={i} className="h-32" data-testid={`skeleton-enrollment-${i}`} />
          ))}
        </div>
      )}

      {!isLoading && (!enrollments || enrollments.length === 0) && (
        <Card>
          <CardContent className="pt-6 text-center text-muted-foreground" data-testid="text-no-enrollments">
            You haven't enrolled in any courses yet.
          </CardContent>
        </Card>
      )}

      {!isLoading && enrollments && enrollments.length > 0 && (
        <div className="space-y-3">
          {enrollments.map(e => (
            <Card key={e.id} data-testid={`card-enrollment-${e.id}`}>
              <CardHeader>
                <div className="flex items-start justify-between gap-2 flex-wrap">
                  <CardTitle className="text-lg" data-testid={`text-enrollment-course-${e.id}`}>
                    {e.course.title}
                  </CardTitle>
                  <Badge
                    variant={e.status === "completed" ? "secondary" : "outline"}
                    data-testid={`badge-enrollment-status-${e.id}`}
                  >
                    {e.status}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between mb-2 gap-2 flex-wrap">
                  <span className="text-sm text-muted-foreground">{e.progressPercent}% complete</span>
                  <div className="flex items-center gap-2 flex-wrap">
                    {e.status === "completed" && e.course.certificateEnabled && e.certificateUrl && (
                      <a href={e.certificateUrl} target="_blank" rel="noopener noreferrer" download>
                        <Button size="sm" data-testid={`button-download-certificate-${e.id}`}>
                          <Award className="h-4 w-4 mr-2" /> Certificate
                          <Download className="h-4 w-4 ml-2" />
                        </Button>
                      </a>
                    )}
                    <Link href={`/courses/${e.course.slug}`}>
                      <Button size="sm" variant="outline" data-testid={`button-resume-course-${e.id}`}>
                        {e.status === "completed" ? "Review" : "Resume"} <ChevronRight className="h-4 w-4 ml-1" />
                      </Button>
                    </Link>
                  </div>
                </div>
                <Progress value={e.progressPercent} />
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
