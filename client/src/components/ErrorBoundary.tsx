import { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertTriangle, RefreshCw, MessageSquare, Home } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: (error: Error, reset: () => void) => ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("ErrorBoundary caught an error:", error, errorInfo);
  }

  reset = () => {
    this.setState({ error: null });
  };

  reportError = () => {
    const error = this.state.error;
    if (!error) return;
    const description = `An unexpected error occurred while using Orion.\n\nError: ${error.message}\n\nWhere: ${window.location.pathname}\n\nWhat I was doing:\n(please describe what you were trying to do)\n`;
    const url = `/support?description=${encodeURIComponent(description)}`;
    window.location.href = url;
  };

  goHome = () => {
    window.location.href = "/";
  };

  render() {
    if (this.state.error) {
      if (this.props.fallback) {
        return this.props.fallback(this.state.error, this.reset);
      }

      return (
        <div className="min-h-screen flex items-center justify-center bg-background p-4">
          <Card className="max-w-lg w-full" data-testid="card-error-boundary">
            <CardHeader>
              <div className="flex justify-center mb-2">
                <div className="w-14 h-14 rounded-full bg-destructive/10 flex items-center justify-center">
                  <AlertTriangle className="h-7 w-7 text-destructive" />
                </div>
              </div>
              <CardTitle className="text-center text-2xl" data-testid="text-error-title">
                Something went wrong
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-center text-muted-foreground" data-testid="text-error-message">
                We hit an unexpected error while showing this page. Try again, or let us know so we can fix it.
              </p>
              {import.meta.env.DEV && (
                <details className="rounded-md border bg-muted/50 p-3 text-xs">
                  <summary className="cursor-pointer font-medium">Technical details</summary>
                  <pre className="mt-2 whitespace-pre-wrap break-words text-muted-foreground">
                    {this.state.error.message}
                  </pre>
                </details>
              )}
              <div className="flex flex-col gap-2 sm:flex-row sm:justify-center">
                <Button onClick={this.reset} data-testid="button-error-retry">
                  <RefreshCw className="mr-2 h-4 w-4" />
                  Try again
                </Button>
                <Button variant="outline" onClick={this.reportError} data-testid="button-error-report">
                  <MessageSquare className="mr-2 h-4 w-4" />
                  Report this
                </Button>
                <Button variant="ghost" onClick={this.goHome} data-testid="button-error-home">
                  <Home className="mr-2 h-4 w-4" />
                  Home
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      );
    }

    return this.props.children;
  }
}
