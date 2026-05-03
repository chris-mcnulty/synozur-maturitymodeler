import { useQuery } from "@tanstack/react-query";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { BookOpen } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

export function AdminGuideSection() {
  const { data: content, isLoading, isError } = useQuery<string>({
    queryKey: ["/api/admin-guide"],
    queryFn: async () => {
      const res = await fetch("/api/admin-guide");
      if (!res.ok) throw new Error("Failed to load admin guide");
      const data = await res.json();
      return data.content || "";
    },
  });

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  if (isError || !content) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <p className="text-destructive mb-2">Failed to load admin guide.</p>
          <p className="text-sm text-muted-foreground">Please try refreshing the page.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4" data-testid="section-admin-guide">
      <h2 className="text-xl font-semibold flex items-center gap-2">
        <BookOpen className="h-5 w-5" /> Admin Guide
      </h2>
      <Card>
        <CardContent className="p-6 prose dark:prose-invert max-w-none">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
        </CardContent>
      </Card>
    </div>
  );
}
