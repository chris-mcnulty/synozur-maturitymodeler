import { Button } from "@/components/ui/button";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

interface QuestionNavigatorProps {
  total: number;
  currentIndex: number;
  answeredIndices: Set<number>;
  onJump: (index: number) => void;
  saveStatus?: "idle" | "saving" | "saved" | "failed";
}

export function QuestionNavigator({
  total,
  currentIndex,
  answeredIndices,
  onJump,
  saveStatus = "idle",
}: QuestionNavigatorProps) {
  const answeredCount = answeredIndices.size;

  return (
    <div className="w-full" data-testid="question-navigator">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <span className="text-sm text-muted-foreground" data-testid="text-navigator-progress">
          {answeredCount} of {total} answered
        </span>
        <SaveIndicator status={saveStatus} />
      </div>
      <div
        className="flex flex-wrap gap-1.5"
        role="list"
        aria-label="Question navigator"
        title="Tip: use ← and → to move between questions. Hold Alt and press a digit (1–9, 0 for 10) to jump."
      >
        {Array.from({ length: total }).map((_, i) => {
          const isCurrent = i === currentIndex;
          const isAnswered = answeredIndices.has(i);
          return (
            <Button
              key={i}
              type="button"
              size="icon"
              variant={isCurrent ? "default" : isAnswered ? "secondary" : "outline"}
              onClick={() => onJump(i)}
              className={cn(
                "h-8 w-8 text-xs font-semibold",
                isAnswered && !isCurrent && "border-primary/40",
              )}
              aria-current={isCurrent ? "step" : undefined}
              aria-label={`Question ${i + 1}${isAnswered ? ", answered" : ", unanswered"}${isCurrent ? ", current" : ""}`}
              data-testid={`button-nav-question-${i + 1}`}
            >
              {isAnswered && !isCurrent ? (
                <Check className="h-3.5 w-3.5" aria-hidden="true" />
              ) : (
                i + 1
              )}
            </Button>
          );
        })}
      </div>
      <p
        className="hidden sm:block text-xs text-muted-foreground mt-2"
        data-testid="text-navigator-shortcuts-hint"
      >
        Tip: use <kbd className="px-1 py-0.5 rounded border bg-muted text-[10px] font-mono">←</kbd>{" "}
        <kbd className="px-1 py-0.5 rounded border bg-muted text-[10px] font-mono">→</kbd> to move between questions,{" "}
        <kbd className="px-1 py-0.5 rounded border bg-muted text-[10px] font-mono">Enter</kbd> to advance, or hold{" "}
        <kbd className="px-1 py-0.5 rounded border bg-muted text-[10px] font-mono">Alt</kbd> + a digit to jump.
      </p>
    </div>
  );
}

function SaveIndicator({ status }: { status: "idle" | "saving" | "saved" | "failed" }) {
  if (status === "idle") {
    return <span className="text-xs text-muted-foreground" aria-live="polite" />;
  }
  if (status === "saving") {
    return (
      <span
        className="text-xs text-muted-foreground inline-flex items-center gap-1.5"
        aria-live="polite"
        data-testid="status-save-saving"
      >
        <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground animate-pulse" />
        Saving…
      </span>
    );
  }
  if (status === "saved") {
    return (
      <span
        className="text-xs text-muted-foreground inline-flex items-center gap-1.5"
        aria-live="polite"
        data-testid="status-save-saved"
      >
        <Check className="h-3 w-3" aria-hidden="true" />
        Saved
      </span>
    );
  }
  return (
    <span
      className="text-xs text-destructive inline-flex items-center gap-1.5"
      aria-live="assertive"
      data-testid="status-save-failed"
    >
      <span className="h-1.5 w-1.5 rounded-full bg-destructive" />
      Save failed — retrying
    </span>
  );
}
