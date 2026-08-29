import * as React from 'react';
import { cn } from '@/lib/utils';
import { type LucideIcon } from 'lucide-react';

export interface EmptyStateProps extends React.HTMLAttributes<HTMLDivElement> {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
}

const EmptyState = React.forwardRef<HTMLDivElement, EmptyStateProps>(
  ({ className, icon: Icon, title, description, action, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        'flex flex-col items-center justify-center py-12 text-center',
        className,
      )}
      {...props}
    >
      {Icon && (
        <div className="bg-surface-sunken mb-4 rounded-full p-3">
          <Icon className="text-fg-muted h-6 w-6" />
        </div>
      )}
      <h3 className="text-fg text-lg font-semibold">{title}</h3>
      {description && (
        <p className="text-fg-muted mt-1 max-w-sm text-sm">{description}</p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  ),
);
EmptyState.displayName = 'EmptyState';
export { EmptyState };
