import * as React from 'react';
import { cn } from '@/lib/utils';

export interface ProgressBarProps extends React.HTMLAttributes<HTMLDivElement> {
  value: number;
  max?: number;
  label?: string;
  showValue?: boolean;
}

const ProgressBar = React.forwardRef<HTMLDivElement, ProgressBarProps>(
  ({ className, value, max = 100, label, showValue, ...props }, ref) => {
    const pct = Math.min(100, Math.max(0, (value / max) * 100));
    return (
      <div ref={ref} className={cn('space-y-1', className)} {...props}>
        {(label || showValue) && (
          <div className="flex justify-between text-sm">
            {label && <span className="text-fg-muted">{label}</span>}
            {showValue && (
              <span className="text-fg-muted tabular-nums">
                {Math.round(pct)}%
              </span>
            )}
          </div>
        )}
        <div
          className="bg-surface-sunken h-2 w-full rounded-full"
          role="progressbar"
          aria-valuenow={value}
          aria-valuemin={0}
          aria-valuemax={max}
          aria-label={label}
        >
          <div
            className="bg-brand h-full rounded-full transition-all"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>
    );
  },
);
ProgressBar.displayName = 'ProgressBar';
export { ProgressBar };
