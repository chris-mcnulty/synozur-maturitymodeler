import { useQuery } from "@tanstack/react-query";
import { usePageTitle } from "@/hooks/use-page-title";
import { Link, useRoute } from "wouter";
import { Helmet } from "react-helmet-async";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, BookOpen, ExternalLink, Clock } from "lucide-react";
import type { Academy, AcademyItem, AcademyExternalProvider, Course } from "@shared/schema";

interface AcademyItemWithCourse extends AcademyItem {
  course?: Pick<Course, "id" | "slug" | "title" | "summary" | "imageUrl" | "estimatedMinutes" | "status" | "visibility"> | null;
}

interface AcademyFull extends Academy {
  items: AcademyItemWithCourse[];
}

const PROVIDER_LABELS: Record<AcademyExternalProvider, string> = {
  linkedin_learning: "LinkedIn Learning",
  coursera: "Coursera",
  pluralsight: "Pluralsight",
  youtube: "YouTube",
  udemy: "Udemy",
  edx: "edX",
  other: "External",
};

export default function AcademyDetail() {
  const [, params] = useRoute<{ slug: string }>("/academies/:slug");
  const slug = params?.slug;

  const { data: academy, isLoading, error } = useQuery<AcademyFull>({
    queryKey: [`/api/academies/${slug}`],
    enabled: !!slug,
  });
  usePageTitle(academy?.title ?? "Academy");

  if (isLoading) {
    return (
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        <Skeleton className="h-64 w-full mb-4" />
        <Skeleton className="h-8 w-1/2 mb-2" />
        <Skeleton className="h-4 w-3/4" />
      </div>
    );
  }

  if (error || !academy) {
    return (
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        <Card>
          <CardContent className="pt-6 text-center" data-testid="text-academy-not-found">
            <p className="text-muted-foreground">Academy not found or you don't have access.</p>
            <Link href="/academies">
              <Button variant="outline" className="mt-4">Back to academies</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      <Helmet>
        <title>{academy.title} | Academies</title>
        {academy.summary && <meta name="description" content={academy.summary} />}
      </Helmet>

      <Link href="/academies">
        <Button variant="ghost" size="sm" className="mb-4" data-testid="button-back-to-academies">
          <ArrowLeft className="h-4 w-4 mr-1" /> All academies
        </Button>
      </Link>

      {academy.imageUrl && (
        <div className="aspect-video w-full overflow-hidden rounded-lg mb-6">
          <img src={academy.imageUrl} alt={academy.title} className="w-full h-full object-cover" data-testid="img-academy-hero" />
        </div>
      )}

      <div className="flex items-start justify-between gap-3 mb-2 flex-wrap">
        <h1 className="text-3xl font-bold" data-testid="text-academy-title">{academy.title}</h1>
        {academy.status !== "published" && <Badge variant="secondary">{academy.status}</Badge>}
      </div>
      {academy.summary && <p className="text-muted-foreground mb-4" data-testid="text-academy-summary">{academy.summary}</p>}
      {academy.description && (
        <div className="prose dark:prose-invert max-w-none mb-8" data-testid="text-academy-description">
          <p className="whitespace-pre-wrap">{academy.description}</p>
        </div>
      )}

      <h2 className="text-xl font-semibold mb-3">Learning sequence</h2>
      {academy.items.length === 0 && (
        <Card>
          <CardContent className="pt-6 text-muted-foreground">No items in this academy yet.</CardContent>
        </Card>
      )}
      <div className="space-y-3">
        {academy.items.map((item, idx) => (
          <AcademyItemCard key={item.id} item={item} index={idx} />
        ))}
      </div>
    </div>
  );
}

function AcademyItemCard({ item, index }: { item: AcademyItemWithCourse; index: number }) {
  if (item.itemType === "course") {
    if (!item.course) {
      return (
        <Card data-testid={`card-academy-item-${item.id}`}>
          <CardContent className="pt-6 text-muted-foreground">
            <span className="font-mono mr-2">{index + 1}.</span>
            Course unavailable.
          </CardContent>
        </Card>
      );
    }
    return (
      <Link href={`/courses/${item.course.slug}`}>
        <Card className="hover-elevate cursor-pointer" data-testid={`card-academy-item-${item.id}`}>
          <CardHeader>
            <div className="flex items-start gap-3">
              <span className="font-mono text-muted-foreground w-8 shrink-0">{index + 1}.</span>
              <BookOpen className="h-5 w-5 text-primary shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <CardTitle className="text-base">{item.course.title}</CardTitle>
                {item.course.summary && (
                  <p className="text-sm text-muted-foreground mt-1">{item.course.summary}</p>
                )}
                <div className="flex items-center gap-3 text-xs text-muted-foreground mt-2">
                  <span>Orion course</span>
                  {item.course.estimatedMinutes != null && (
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {item.course.estimatedMinutes} min
                    </span>
                  )}
                  {item.required && <Badge variant="outline">required</Badge>}
                </div>
              </div>
            </div>
          </CardHeader>
        </Card>
      </Link>
    );
  }

  // External item
  return (
    <a href={item.externalUrl ?? "#"} target="_blank" rel="noopener noreferrer">
      <Card className="hover-elevate cursor-pointer" data-testid={`card-academy-item-${item.id}`}>
        <CardHeader>
          <div className="flex items-start gap-3">
            <span className="font-mono text-muted-foreground w-8 shrink-0">{index + 1}.</span>
            <ExternalLink className="h-5 w-5 text-primary shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <CardTitle className="text-base">{item.externalTitle}</CardTitle>
              {item.externalDescription && (
                <p className="text-sm text-muted-foreground mt-1">{item.externalDescription}</p>
              )}
              <div className="flex items-center gap-3 text-xs text-muted-foreground mt-2">
                <span>{PROVIDER_LABELS[item.externalProvider as AcademyExternalProvider] ?? "External"}</span>
                {item.externalDurationMinutes != null && (
                  <span className="flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {item.externalDurationMinutes} min
                  </span>
                )}
                {item.required && <Badge variant="outline">required</Badge>}
              </div>
            </div>
          </div>
        </CardHeader>
      </Card>
    </a>
  );
}
