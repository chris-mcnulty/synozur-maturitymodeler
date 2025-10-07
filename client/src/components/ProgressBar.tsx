import { Progress } from "@/components/ui/progress";

interface ProgressBarProps {
  current: number;
  total: number;
}

export function ProgressBar({ current, total }: ProgressBarProps) {
  const percentage = Math.round((current / total) * 100);
  
  return (
    <div className="w-full" data-testid="progress-assessment">
      <div className="flex justify-between items-center mb-2">
        <span className="text-sm font-medium" data-testid="text-progress">
          Question {current} of {total}
        </span>
        <span className="text-sm text-muted-foreground">{percentage}%</span>
      </div>
      <Progress 
        value={percentage} 
        className="h-2 bg-muted"
      />
    </div>
  );
}
