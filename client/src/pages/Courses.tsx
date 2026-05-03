import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Helmet } from "react-helmet-async";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { BookOpen, Clock, Users, Sparkles } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import type { Course, CourseTag } from "@shared/schema";

interface CourseListItem extends Course {
  moduleCount: number;
  lessonCount: number;
  enrollmentCount: number;
  tags: CourseTag[];
}

interface RecommendedCourse extends CourseListItem {
  matchedDimensionId: string | null;
  matchedDimensionLabel: string | null;
  matchedScore: number;
  threshold: number;
  priority: number;
}

interface MyRecommendationsResponse {
  assessmentId: string | null;
  courses: RecommendedCourse[];
}

function CourseCard({ course, testIdPrefix = "card-course" }: { course: CourseListItem; testIdPrefix?: string }) {
  return (
    <Link href={`/courses/${course.slug}`}>
      <Card className="h-full hover-elevate cursor-pointer" data-testid={`${testIdPrefix}-${course.id}`}>
        {course.imageUrl && (
          <div className="aspect-video w-full overflow-hidden rounded-t-md">
            <img src={course.imageUrl} alt={course.title} className="w-full h-full object-cover" data-testid={`img-course-${course.id}`} />
          </div>
        )}
        <CardHeader>
          <div className="flex items-start justify-between gap-2 flex-wrap">
            <CardTitle className="text-lg" data-testid={`text-course-title-${course.id}`}>{course.title}</CardTitle>
            {course.status !== "published" && (
              <Badge variant="secondary">{course.status}</Badge>
            )}
          </div>
          {course.summary && (
            <CardDescription data-testid={`text-course-summary-${course.id}`}>{course.summary}</CardDescription>
          )}
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground mb-3">
            <span className="flex items-center gap-1">
              <BookOpen className="h-4 w-4" />
              {course.lessonCount} lesson{course.lessonCount === 1 ? "" : "s"}
            </span>
            {course.estimatedMinutes != null && (
              <span className="flex items-center gap-1">
                <Clock className="h-4 w-4" />
                {course.estimatedMinutes} min
              </span>
            )}
            <span className="flex items-center gap-1">
              <Users className="h-4 w-4" />
              {course.enrollmentCount}
            </span>
          </div>
          {course.tags.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {course.tags.map(t => (
                <Badge key={t.id} variant="outline" data-testid={`badge-tag-${t.id}`}>{t.name}</Badge>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </Link>
  );
}

export default function Courses() {
  const { user } = useAuth();

  const { data: courses, isLoading } = useQuery<CourseListItem[]>({
    queryKey: ["/api/courses"],
  });

  const { data: recommended } = useQuery<MyRecommendationsResponse>({
    queryKey: ["/api/me/recommended-courses"],
    enabled: !!user,
  });

  const suggested = recommended?.courses ?? [];

  return (
    <div className="container mx-auto px-4 py-8 max-w-6xl">
      <Helmet>
        <title>Learning Courses | Orion</title>
        <meta name="description" content="Browse Synozur learning courses on AI maturity, transformation, and leadership." />
      </Helmet>
      <div className="mb-8 flex items-end justify-between gap-2 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold mb-2" data-testid="text-courses-heading">Learning Courses</h1>
          <p className="text-muted-foreground">
            Build your skills with curated learning paths from The Synozur Alliance.
          </p>
        </div>
        <Link href="/my-courses">
          <Button variant="outline" data-testid="button-my-courses">My Courses</Button>
        </Link>
      </div>

      {suggested.length > 0 && (
        <section className="mb-10" data-testid="section-suggested-for-you">
          <div className="flex items-center gap-2 mb-4">
            <Sparkles className="h-5 w-5 text-primary" />
            <h2 className="text-xl font-semibold">Suggested for you</h2>
          </div>
          <p className="text-sm text-muted-foreground mb-4">
            Based on your most recent assessment results.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {suggested.map(c => (
              <CourseCard key={c.id} course={c} testIdPrefix="card-suggested-course" />
            ))}
          </div>
        </section>
      )}

      {isLoading && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map(i => (
            <Skeleton key={i} className="h-64" data-testid={`skeleton-course-${i}`} />
          ))}
        </div>
      )}

      {!isLoading && (!courses || courses.length === 0) && (
        <Card>
          <CardContent className="pt-6 text-center text-muted-foreground" data-testid="text-courses-empty">
            No courses available yet. Check back soon.
          </CardContent>
        </Card>
      )}

      {!isLoading && courses && courses.length > 0 && (
        <>
          {suggested.length > 0 && (
            <h2 className="text-xl font-semibold mb-4" data-testid="text-all-courses-heading">All courses</h2>
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {courses.map(c => (
              <CourseCard key={c.id} course={c} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
