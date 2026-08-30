import * as React from 'react';
import { cn } from '@/lib/utils';

export interface KpiTileProps extends React.HTMLAttributes<HTMLDivElement> {
  label: string;
  value: string | number;
  delta?: number;
  /** true if a positive delta is bad news (e.g. suspicious %) — flips the colour. */
  invertDelta?: boolean;
}

function formatDelta(
  delta: number,
  invert: boolean,
): { text: string; tone: 'up' | 'down' | 'flat' } {
  if (delta === 0) return { text: '±0', tone: 'flat' };
  const sign = delta > 0 ? '+' : '';
  const good = invert ? delta < 0 : delta > 0;
  return { text: `${sign}${delta}`, tone: good ? 'up' : 'down' };
}

const TONE_CLASS: Record<'up' | 'down' | 'flat', string> = {
  up: 'text-v-pos',
  down: 'text-v-flag',
  flat: 'text-fg-muted',
};

const KpiTile = React.forwardRef<HTMLDivElement, KpiTileProps>(
  ({ className, label, value, delta, invertDelta, ...props }, ref) => {
    const deltaInfo =
      delta === undefined ? null : formatDelta(delta, !!invertDelta);
    return (
      <div
        ref={ref}
        className={cn(
          'bg-surface border-border p-s4 rounded-md border shadow-sm',
          className,
        )}
        {...props}
      >
        <div className="text-fg-muted text-xs font-medium tracking-wide uppercase">
          {label}
        </div>
        <div className="mt-1 flex items-baseline gap-2">
          <span className="text-fg text-2xl font-semibold tabular-nums">
            {value}
          </span>
          {deltaInfo && (
            <span
              className={cn(
                'text-xs font-medium tabular-nums',
                TONE_CLASS[deltaInfo.tone],
              )}
            >
              {deltaInfo.text}
            </span>
          )}
        </div>
      </div>
    );
  },
);
KpiTile.displayName = 'KpiTile';
export { KpiTile };
