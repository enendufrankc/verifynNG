import * as React from 'react';
import { cn } from '@/lib/utils';

export interface PageHeaderProps extends React.HTMLAttributes<HTMLDivElement> {
  title: string;
  description?: string;
  actions?: React.ReactNode;
}

const PageHeader = React.forwardRef<HTMLDivElement, PageHeaderProps>(
  ({ className, title, description, actions, ...props }, ref) => (
    <div
      ref={ref}
      className={cn('flex items-start justify-between gap-4', className)}
      {...props}
    >
      <div className="space-y-1">
        <h1 className="text-fg text-2xl font-semibold tracking-tight">
          {title}
        </h1>
        {description && <p className="text-fg-muted text-sm">{description}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  ),
);
PageHeader.displayName = 'PageHeader';
export { PageHeader };
