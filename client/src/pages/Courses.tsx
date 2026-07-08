import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Helmet } from "react-helmet-async";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { BookOpen, Clock, Users, Sparkles, Search, X } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { usePageTitle } from "@/hooks/use-page-title";
import type { Course, CourseTag, CourseEnrollment } from "@shared/schema";

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

interface EnrollmentWithCourse extends CourseEnrollment {
  course: Course;
}

type DurationFilter = "any" | "short" | "medium" | "long";
type StatusFilter = "any" | "not_started" | "in_progress" | "completed";

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
  usePageTitle("Learning Courses");
  const { user } = useAuth();

  const { data: courses, isLoading } = useQuery<CourseListItem[]>({
    queryKey: ["/api/courses"],
  });

  const { data: recommended } = useQuery<MyRecommendationsResponse>({
    queryKey: ["/api/me/recommended-courses"],
    enabled: !!user,
  });

  const { data: myEnrollments, isLoading: enrollmentsLoading } = useQuery<EnrollmentWithCourse[]>({
    queryKey: ["/api/me/courses"],
    enabled: !!user,
  });

  const suggested = recommended?.courses ?? [];

  const [search, setSearch] = useState("");
  const [selectedTagIds, setSelectedTagIds] = useState<Set<string>>(new Set());
  const [duration, setDuration] = useState<DurationFilter>("any");
  const [status, setStatus] = useState<StatusFilter>("any");

  // courseId -> learner's bucketed completion status
  const enrollmentStatusByCourse = useMemo(() => {
    const map = new Map<string, StatusFilter>();
    // Enrollment enum is ['enrolled','in_progress','completed','expired'].
    // Map to learner-facing buckets: only an active "in_progress" counts as
    // in progress; "enrolled" (never opened) and "expired" read as not
    // started so they align with the filter's "Not started" option.
    for (const e of myEnrollments ?? []) {
      const bucket: StatusFilter =
        e.status === "completed"
          ? "completed"
          : e.status === "in_progress"
            ? "in_progress"
            : "not_started";
      map.set(e.courseId, bucket);
    }
    return map;
  }, [myEnrollments]);

  // Unique tags across the catalog, for the tag filter chips
  const allTags = useMemo(() => {
    const byId = new Map<string, CourseTag>();
    for (const c of courses ?? []) {
      for (const t of c.tags) byId.set(t.id, t);
    }
    return Array.from(byId.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [courses]);

  const hasActiveFilters =
    search.trim() !== "" || selectedTagIds.size > 0 || duration !== "any" || status !== "any";

  const toggleTag = (id: string) => {
    setSelectedTagIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const clearFilters = () => {
    setSearch("");
    setSelectedTagIds(new Set());
    setDuration("any");
    setStatus("any");
  };

  const filteredCourses = useMemo(() => {
    if (!courses) return [];
    const q = search.trim().toLowerCase();
    return courses.filter(c => {
      if (q) {
        const haystack = `${c.title} ${c.summary ?? ""} ${c.description ?? ""}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      if (selectedTagIds.size > 0) {
        if (!c.tags.some(t => selectedTagIds.has(t.id))) return false;
      }
      if (duration !== "any") {
        const m = c.estimatedMinutes;
        if (m == null) return false;
        if (duration === "short" && m >= 30) return false;
        if (duration === "medium" && (m < 30 || m > 60)) return false;
        if (duration === "long" && m <= 60) return false;
      }
      // Don't apply the status filter until enrollments have loaded,
      // otherwise everything reads as "not started" for a logged-in user
      // and the empty state flashes before the data resolves.
      if (status !== "any" && !enrollmentsLoading) {
        const courseStatus = enrollmentStatusByCourse.get(c.id) ?? "not_started";
        if (courseStatus !== status) return false;
      }
      return true;
    });
  }, [courses, search, selectedTagIds, duration, status, enrollmentStatusByCourse, enrollmentsLoading]);

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

          <div className="mb-6 space-y-4" data-testid="course-filters">
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search courses..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-10"
                  data-testid="input-course-search"
                />
              </div>
              <Select value={duration} onValueChange={(v) => setDuration(v as DurationFilter)}>
                <SelectTrigger className="w-full sm:w-44" data-testid="select-duration">
                  <SelectValue placeholder="Duration" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="any">Any duration</SelectItem>
                  <SelectItem value="short">Under 30 min</SelectItem>
                  <SelectItem value="medium">30–60 min</SelectItem>
                  <SelectItem value="long">Over 60 min</SelectItem>
                </SelectContent>
              </Select>
              {user && (
                <Select value={status} onValueChange={(v) => setStatus(v as StatusFilter)}>
                  <SelectTrigger className="w-full sm:w-44" data-testid="select-status">
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="any">Any status</SelectItem>
                    <SelectItem value="not_started">Not started</SelectItem>
                    <SelectItem value="in_progress">In progress</SelectItem>
                    <SelectItem value="completed">Completed</SelectItem>
                  </SelectContent>
                </Select>
              )}
            </div>

            {allTags.length > 0 && (
              <div className="flex flex-wrap items-center gap-2" data-testid="filter-tags">
                {allTags.map(t => {
                  const active = selectedTagIds.has(t.id);
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => toggleTag(t.id)}
                      data-testid={`filter-tag-${t.id}`}
                      aria-pressed={active}
                      aria-label={`Filter by ${t.name}`}
                      className="rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                    >
                      <Badge variant={active ? "default" : "outline"} className="cursor-pointer">
                        {t.name}
                      </Badge>
                    </button>
                  );
                })}
              </div>
            )}

            {hasActiveFilters && (
              <div className="flex items-center gap-3 text-sm text-muted-foreground">
                <span data-testid="text-filter-count">
                  {filteredCourses.length} of {courses.length} course{courses.length === 1 ? "" : "s"}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2"
                  onClick={clearFilters}
                  data-testid="button-clear-filters"
                >
                  <X className="h-3.5 w-3.5 mr-1" /> Clear filters
                </Button>
              </div>
            )}
          </div>

          {filteredCourses.length === 0 ? (
            <Card>
              <CardContent className="pt-6 text-center text-muted-foreground" data-testid="text-no-matching-courses">
                No courses match your filters.
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredCourses.map(c => (
                <CourseCard key={c.id} course={c} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
