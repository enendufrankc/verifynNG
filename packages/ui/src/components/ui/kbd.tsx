import * as React from 'react';
import { cn } from '@/lib/utils';

export type KbdProps = React.HTMLAttributes<HTMLElement>;

const Kbd = React.forwardRef<HTMLElement, KbdProps>(
  ({ className, ...props }, ref) => (
    <kbd
      ref={ref}
      className={cn(
        'border-border bg-surface-sunken text-fg-muted pointer-events-none inline-flex h-5 items-center gap-1 rounded-xs border px-1.5 font-mono text-[10px] font-medium',
        className,
      )}
      {...props}
    />
  ),
);
Kbd.displayName = 'Kbd';
export { Kbd };
