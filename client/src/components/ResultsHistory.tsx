import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import { useLocation } from "wouter";

interface ResultItem {
  id: string;
  modelName: string;
  date: string;
  score: number;
  label: string;
  change?: number;
}

interface ResultsHistoryProps {
  results: ResultItem[];
}

export function ResultsHistory({ results }: ResultsHistoryProps) {
  const [, setLocation] = useLocation();
  
  const getTrendIcon = (change?: number) => {
    if (!change) return <Minus className="h-4 w-4" />;
    if (change > 0) return <TrendingUp className="h-4 w-4 text-chart-3" />;
    return <TrendingDown className="h-4 w-4 text-chart-5" />;
  };

  return (
    <div className="space-y-4" data-testid="results-history">
      {results.map((result) => (
        <Card key={result.id} className="p-6 hover-elevate transition-all" data-testid={`result-card-${result.id}`}>
          <div className="flex items-center justify-between">
            <div className="flex-1">
              <h3 className="font-bold text-lg mb-1" data-testid={`text-model-${result.id}`}>
                {result.modelName}
              </h3>
              <p className="text-sm text-muted-foreground" data-testid={`text-date-${result.id}`}>
                {result.date}
              </p>
            </div>
            
            <div className="flex items-center gap-4">
              <div className="text-center">
                <div className="text-3xl font-bold text-primary" data-testid={`text-score-${result.id}`}>
                  {result.score}
                </div>
                <Badge variant="secondary" className="mt-1">
                  {result.label}
                </Badge>
              </div>
              
              {result.change !== undefined && (
                <div className="flex items-center gap-1 text-sm">
                  {getTrendIcon(result.change)}
                  <span className={result.change > 0 ? "text-chart-3" : result.change < 0 ? "text-chart-5" : "text-muted-foreground"}>
                    {result.change > 0 ? "+" : ""}{result.change}
                  </span>
                </div>
              )}
              
              <Button 
                variant="outline" 
                data-testid={`button-view-${result.id}`}
                onClick={() => setLocation(`/results/${result.id}`)}
              >
                View Details
              </Button>
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}
