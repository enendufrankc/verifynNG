import * as React from 'react';
import { cn } from '@/lib/utils';

export type StatusVariant =
  | 'ok'
  | 'authentic'
  | 'history'
  | 'suspicious'
  | 'flagged'
  | 'decommissioned'
  | 'unknown'
  | 'utility'
  | 'success'
  | 'warning'
  | 'danger'
  | 'info'
  | 'neutral';

const variantStyles: Record<StatusVariant, string> = {
  ok: 'bg-v-pos-tint text-v-pos border-v-pos/20',
  authentic: 'bg-v-pos-tint text-v-pos border-v-pos/20',
  history: 'bg-v-hist-tint text-v-hist border-v-hist/20',
  suspicious: 'bg-v-susp-tint text-v-susp border-v-susp/20',
  flagged: 'bg-v-flag-tint text-v-flag border-v-flag/20',
  decommissioned: 'bg-v-dec-tint text-v-dec border-v-dec/20',
  unknown: 'bg-v-unk-tint text-v-unk border-v-unk/20',
  utility: 'bg-v-util-tint text-v-util border-v-util/20',
  success: 'bg-v-pos-tint text-v-pos border-v-pos/20',
  warning: 'bg-v-susp-tint text-v-susp border-v-susp/20',
  danger: 'bg-v-flag-tint text-v-flag border-v-flag/20',
  info: 'bg-v-hist-tint text-v-hist border-v-hist/20',
  neutral: 'bg-surface-sunken text-fg-muted border-border',
};

export interface StatusChipProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: StatusVariant;
}

const StatusChip = React.forwardRef<HTMLSpanElement, StatusChipProps>(
  ({ className, variant = 'neutral', ...props }, ref) => (
    <span
      ref={ref}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium',
        variantStyles[variant],
        className,
      )}
      {...props}
    />
  ),
);
StatusChip.displayName = 'StatusChip';
export { StatusChip };
