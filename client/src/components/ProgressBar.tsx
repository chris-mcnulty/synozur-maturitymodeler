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
      <div className="relative h-3 bg-muted rounded-full overflow-hidden">
        <div 
          className="h-full bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500 transition-all duration-300 rounded-full"
          style={{ width: `${percentage}%` }}
          data-testid="progress-bar-fill"
        />
      </div>
    </div>
  );
}
