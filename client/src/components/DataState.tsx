import type { ReactNode } from "react";
import { AlertTriangle, Inbox, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

interface DataStateProps {
  isLoading?: boolean;
  isError?: boolean;
  error?: Error | null;
  isEmpty?: boolean;
  onRetry?: () => void;
  loading?: ReactNode;
  empty?: ReactNode;
  emptyTitle?: string;
  emptyDescription?: string;
  errorTitle?: string;
  errorDescription?: string;
  children: ReactNode;
}

export function DefaultLoadingFallback() {
  return (
    <div className="space-y-3" data-testid="data-state-loading">
      <Skeleton className="h-6 w-1/3" />
      <Skeleton className="h-4 w-2/3" />
      <Skeleton className="h-4 w-1/2" />
    </div>
  );
}

export function DataState({
  isLoading,
  isError,
  error,
  isEmpty,
  onRetry,
  loading,
  empty,
  emptyTitle = "Nothing to show yet",
  emptyDescription = "Once there's data here, you'll see it.",
  errorTitle = "We couldn't load this",
  errorDescription,
  children,
}: DataStateProps) {
  if (isLoading) {
    return <>{loading ?? <DefaultLoadingFallback />}</>;
  }

  if (isError) {
    const message = errorDescription || error?.message || "Something went wrong while loading. Please try again.";
    return (
      <Card className="p-8 text-center" data-testid="data-state-error">
        <div className="flex flex-col items-center gap-3">
          <div className="w-12 h-12 rounded-full bg-destructive/10 flex items-center justify-center">
            <AlertTriangle className="h-6 w-6 text-destructive" />
          </div>
          <div className="space-y-1">
            <h3 className="font-semibold" data-testid="text-data-state-error-title">{errorTitle}</h3>
            <p className="text-sm text-muted-foreground max-w-md" data-testid="text-data-state-error-message">
              {message}
            </p>
          </div>
          {onRetry && (
            <Button variant="outline" size="sm" onClick={onRetry} data-testid="button-data-state-retry">
              <RefreshCw className="mr-2 h-4 w-4" />
              Try again
            </Button>
          )}
        </div>
      </Card>
    );
  }

  if (isEmpty) {
    if (empty !== undefined) return <>{empty}</>;
    return (
      <Card className="p-8 text-center" data-testid="data-state-empty">
        <div className="flex flex-col items-center gap-3">
          <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center">
            <Inbox className="h-6 w-6 text-muted-foreground" />
          </div>
          <div className="space-y-1">
            <h3 className="font-semibold">{emptyTitle}</h3>
            <p className="text-sm text-muted-foreground max-w-md">{emptyDescription}</p>
          </div>
        </div>
      </Card>
    );
  }

  return <>{children}</>;
}
