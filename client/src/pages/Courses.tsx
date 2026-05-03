import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Helmet } from "react-helmet-async";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { BookOpen, Clock, Users } from "lucide-react";
import type { Course, CourseTag } from "@shared/schema";

interface CourseListItem extends Course {
  moduleCount: number;
  lessonCount: number;
  enrollmentCount: number;
  tags: CourseTag[];
}

export default function Courses() {
  const { data: courses, isLoading } = useQuery<CourseListItem[]>({
    queryKey: ["/api/courses"],
  });

  return (
    <div className="container mx-auto px-4 py-8 max-w-6xl">
      <Helmet>
        <title>Learning Courses | Orion</title>
        <meta name="description" content="Browse Synozur learning courses on AI maturity, transformation, and leadership." />
      </Helmet>
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2" data-testid="text-courses-heading">Learning Courses</h1>
        <p className="text-muted-foreground">
          Build your skills with curated learning paths from The Synozur Alliance.
        </p>
      </div>

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
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {courses.map(c => (
            <Link key={c.id} href={`/courses/${c.slug}`}>
              <Card className="h-full hover-elevate cursor-pointer" data-testid={`card-course-${c.id}`}>
                {c.imageUrl && (
                  <div className="aspect-video w-full overflow-hidden rounded-t-md">
                    <img src={c.imageUrl} alt={c.title} className="w-full h-full object-cover" data-testid={`img-course-${c.id}`} />
                  </div>
                )}
                <CardHeader>
                  <div className="flex items-start justify-between gap-2">
                    <CardTitle className="text-lg" data-testid={`text-course-title-${c.id}`}>{c.title}</CardTitle>
                    {c.status !== "published" && (
                      <Badge variant="secondary">{c.status}</Badge>
                    )}
                  </div>
                  {c.summary && (
                    <CardDescription data-testid={`text-course-summary-${c.id}`}>{c.summary}</CardDescription>
                  )}
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground mb-3">
                    <span className="flex items-center gap-1">
                      <BookOpen className="h-4 w-4" />
                      {c.lessonCount} lesson{c.lessonCount === 1 ? "" : "s"}
                    </span>
                    {c.estimatedMinutes != null && (
                      <span className="flex items-center gap-1">
                        <Clock className="h-4 w-4" />
                        {c.estimatedMinutes} min
                      </span>
                    )}
                    <span className="flex items-center gap-1">
                      <Users className="h-4 w-4" />
                      {c.enrollmentCount}
                    </span>
                  </div>
                  {c.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {c.tags.map(t => (
                        <Badge key={t.id} variant="outline" data-testid={`badge-tag-${t.id}`}>{t.name}</Badge>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
