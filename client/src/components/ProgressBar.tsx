interface ProgressBarProps {
  current: number;
  total: number;
  dimensionLabel?: string;
}

export function ProgressBar({ current, total, dimensionLabel }: ProgressBarProps) {
  const percentage = Math.round((current / total) * 100);

  return (
    <div className="w-full" data-testid="progress-assessment">
      {dimensionLabel && (
        <div className="mb-3 text-center">
          <span className="text-sm font-semibold text-primary" data-testid="text-dimension">
            {dimensionLabel}
          </span>
        </div>
      )}
      <div className="flex justify-between items-center mb-2">
        <span className="text-sm font-medium" data-testid="text-progress">
          Question {current} of {total}
        </span>
        <span className="text-sm text-foreground/80">{percentage}%</span>
      </div>
      <div
        className="relative h-3 bg-muted rounded-full overflow-hidden border border-border"
        role="progressbar"
        aria-valuenow={percentage}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`Assessment progress: question ${current} of ${total}, ${percentage} percent complete`}
      >
        <div
          className="h-full bg-primary transition-all duration-300 rounded-full"
          style={{ width: `${percentage}%` }}
          data-testid="progress-bar-fill"
        />
      </div>
    </div>
  );
}
