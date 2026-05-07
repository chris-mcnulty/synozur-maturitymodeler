import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Helmet } from "react-helmet-async";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { GraduationCap, Clock } from "lucide-react";
import type { Academy } from "@shared/schema";

interface AcademyListItem extends Academy {
  itemCount: number;
}

export default function Academies() {
  const { data: academies, isLoading } = useQuery<AcademyListItem[]>({
    queryKey: ["/api/academies"],
  });

  return (
    <div className="container mx-auto px-4 py-8 max-w-6xl">
      <Helmet>
        <title>Academies | Orion</title>
        <meta name="description" content="Browse curated learning academies — sequenced paths combining Orion courses with external sources." />
      </Helmet>
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2" data-testid="text-academies-heading">Academies</h1>
        <p className="text-muted-foreground">
          Sequenced learning paths that combine Orion courses with external resources from LinkedIn Learning, Coursera, and more.
        </p>
      </div>

      {isLoading && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map(i => (
            <Skeleton key={i} className="h-64" data-testid={`skeleton-academy-${i}`} />
          ))}
        </div>
      )}

      {!isLoading && (!academies || academies.length === 0) && (
        <Card>
          <CardContent className="pt-6 text-center text-muted-foreground" data-testid="text-academies-empty">
            No academies available yet. Check back soon.
          </CardContent>
        </Card>
      )}

      {!isLoading && academies && academies.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {academies.map(a => (
            <Link key={a.id} href={`/academies/${a.slug}`}>
              <Card className="h-full hover-elevate cursor-pointer" data-testid={`card-academy-${a.id}`}>
                {a.imageUrl && (
                  <div className="aspect-video w-full overflow-hidden rounded-t-md">
                    <img src={a.imageUrl} alt={a.title} className="w-full h-full object-cover" />
                  </div>
                )}
                <CardHeader>
                  <div className="flex items-start justify-between gap-2 flex-wrap">
                    <CardTitle className="text-lg" data-testid={`text-academy-title-${a.id}`}>{a.title}</CardTitle>
                    {a.status !== "published" && <Badge variant="secondary">{a.status}</Badge>}
                  </div>
                  {a.summary && <CardDescription>{a.summary}</CardDescription>}
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <GraduationCap className="h-4 w-4" />
                      {a.itemCount} item{a.itemCount === 1 ? "" : "s"}
                    </span>
                    {a.estimatedMinutes != null && (
                      <span className="flex items-center gap-1">
                        <Clock className="h-4 w-4" />
                        {a.estimatedMinutes} min
                      </span>
                    )}
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
