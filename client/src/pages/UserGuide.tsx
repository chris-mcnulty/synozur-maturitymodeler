import { useState, useEffect, useMemo, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Search, ArrowUp, BookOpen } from "lucide-react";
import { Footer } from "@/components/Footer";
import { Helmet } from "react-helmet-async";

function slugify(text: string): string {
  return text.toLowerCase().replace(/[^\w]+/g, "-").replace(/^-+|-+$/g, "");
}

export default function UserGuide() {
  const [search, setSearch] = useState("");
  const [showScrollTop, setShowScrollTop] = useState(false);

  const { data: content, isLoading } = useQuery<string>({
    queryKey: ["/api/user-guide"],
    queryFn: async () => {
      const res = await fetch("/api/user-guide");
      return res.text();
    },
  });

  useEffect(() => {
    const handleScroll = () => setShowScrollTop(window.scrollY > 300);
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  useEffect(() => {
    if (content && window.location.hash) {
      const id = window.location.hash.slice(1);
      setTimeout(() => {
        document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
      }, 200);
    }
  }, [content]);

  const headings = useMemo(() => {
    if (!content) return [];
    const lines = content.split("\n");
    const result: { level: number; text: string; id: string }[] = [];
    for (const line of lines) {
      const match = line.match(/^(#{1,3})\s+(.+)/);
      if (match) {
        const text = match[2].replace(/\*\*/g, "").trim();
        result.push({ level: match[1].length, text, id: slugify(text) });
      }
    }
    return result;
  }, [content]);

  const filteredContent = useMemo(() => {
    if (!content || !search.trim()) return content || "";
    return content;
  }, [content, search]);

  const highlightSearch = useCallback(
    (text: string) => {
      if (!search.trim()) return text;
      const regex = new RegExp(`(${search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "gi");
      return text.replace(regex, "**$1**");
    },
    [search]
  );

  const scrollToTop = () => window.scrollTo({ top: 0, behavior: "smooth" });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <>
      <Helmet>
        <title>User Guide - Orion by Synozur</title>
        <meta name="description" content="Comprehensive user guide for the Orion maturity assessment platform by Synozur." />
      </Helmet>
      <div className="flex min-h-screen" data-testid="page-user-guide">
        <aside className="hidden lg:block w-72 border-r bg-card sticky top-16 h-[calc(100vh-4rem)] overflow-y-auto p-4">
          <div className="flex items-center gap-2 mb-4">
            <BookOpen className="h-5 w-5 text-primary" />
            <h2 className="font-semibold text-sm">Table of Contents</h2>
          </div>
          <nav className="space-y-1">
            {headings.map((h) => (
              <a
                key={h.id}
                href={`#${h.id}`}
                className={`block text-sm py-1 hover:text-primary transition-colors ${
                  h.level === 1
                    ? "font-semibold"
                    : h.level === 2
                    ? "pl-3 text-muted-foreground"
                    : "pl-6 text-muted-foreground text-xs"
                }`}
                data-testid={`toc-link-${h.id}`}
                onClick={(e) => {
                  e.preventDefault();
                  document.getElementById(h.id)?.scrollIntoView({ behavior: "smooth" });
                }}
              >
                {h.text}
              </a>
            ))}
          </nav>
        </aside>

        <main className="flex-1 min-w-0">
          <div className="container mx-auto px-4 py-8 max-w-4xl">
            <div className="flex items-center gap-3 mb-6">
              <BookOpen className="h-8 w-8 text-primary" />
              <h1 className="text-3xl font-bold" data-testid="text-guide-title">User Guide</h1>
            </div>

            <div className="relative mb-8">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search the guide..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10"
                data-testid="input-guide-search"
              />
            </div>

            <Card className="p-6 md:p-8">
              <div className="prose prose-sm dark:prose-invert max-w-none">
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  components={{
                    h1: ({ children }) => {
                      const text = String(children);
                      const id = slugify(text);
                      return <h1 id={id} className="scroll-mt-20">{children}</h1>;
                    },
                    h2: ({ children }) => {
                      const text = String(children);
                      const id = slugify(text);
                      return <h2 id={id} className="scroll-mt-20">{children}</h2>;
                    },
                    h3: ({ children }) => {
                      const text = String(children);
                      const id = slugify(text);
                      return <h3 id={id} className="scroll-mt-20">{children}</h3>;
                    },
                  }}
                >
                  {search.trim() ? highlightSearch(filteredContent) : filteredContent}
                </ReactMarkdown>
              </div>
            </Card>
          </div>
          <Footer />
        </main>
      </div>

      {showScrollTop && (
        <Button
          size="icon"
          variant="outline"
          className="fixed bottom-6 right-6 z-50 rounded-full shadow-lg"
          onClick={scrollToTop}
          data-testid="button-scroll-top"
        >
          <ArrowUp className="h-4 w-4" />
        </Button>
      )}
    </>
  );
}
