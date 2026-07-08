import { useQuery } from "@tanstack/react-query";
import { usePageTitle } from "@/hooks/use-page-title";
import { Link } from "wouter";
import { Helmet } from "react-helmet-async";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { BookOpen, Download, Award, ChevronRight } from "lucide-react";
import type { Course, CourseEnrollment } from "@shared/schema";

interface EnrollmentWithCourse extends CourseEnrollment {
  course: Course;
}

export default function MyCourses() {
  usePageTitle("My Courses");
  const { data: enrollments, isLoading } = useQuery<EnrollmentWithCourse[]>({
    queryKey: ["/api/me/courses"],
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
