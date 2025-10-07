import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";

interface DimensionScore {
  key: string;
  label: string;
  score: number;
}

interface ScoreCardProps {
  overallScore: number;
  label: string;
  dimensions: DimensionScore[];
  industryMean?: number;
}

const getScoreColor = (score: number) => {
  if (score >= 450) return "text-chart-3";
  if (score >= 400) return "text-chart-1";
  if (score >= 300) return "text-chart-2";
  if (score >= 200) return "text-chart-4";
  return "text-chart-5";
};

export function ScoreCard({ overallScore, label, dimensions, industryMean }: ScoreCardProps) {
  return (
    <Card className="p-8" data-testid="card-score">
      <div className="text-center mb-8">
        <div className={`text-6xl font-bold mb-2 ${getScoreColor(overallScore)}`} data-testid="text-overall-score">
          {overallScore}
        </div>
        <Badge variant="secondary" className="text-lg px-4 py-1" data-testid="text-maturity-label">
          {label}
        </Badge>
        {industryMean && (
          <p className="text-sm text-muted-foreground mt-4" data-testid="text-benchmark">
            {overallScore > industryMean ? "+" : ""}{overallScore - industryMean} points vs. industry average
          </p>
        )}
      </div>

      <div className="space-y-4">
        <h3 className="font-semibold text-lg mb-4">Dimension Breakdown</h3>
        {dimensions.map((dim) => (
          <div key={dim.key} className="space-y-2" data-testid={`dimension-${dim.key}`}>
            <div className="flex justify-between items-center">
              <span className="font-medium">{dim.label}</span>
              <span className={`font-bold ${getScoreColor(dim.score)}`} data-testid={`score-${dim.key}`}>
                {dim.score}
              </span>
            </div>
            <Progress value={(dim.score / 500) * 100} className="h-2" />
          </div>
        ))}
      </div>
    </Card>
  );
}
