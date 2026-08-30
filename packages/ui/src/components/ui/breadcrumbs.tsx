import * as React from 'react';
import { cn } from '@/lib/utils';
import { ChevronRightIcon } from 'lucide-react';

export interface BreadcrumbItem {
  label: string;
  href?: string;
}
export interface BreadcrumbsProps extends React.HTMLAttributes<HTMLElement> {
  items: BreadcrumbItem[];
}

const Breadcrumbs = React.forwardRef<HTMLElement, BreadcrumbsProps>(
  ({ className, items, ...props }, ref) => (
    <nav
      ref={ref}
      aria-label="Breadcrumb"
      className={cn(
        'text-fg-muted flex items-center gap-1.5 text-sm',
        className,
      )}
      {...props}
    >
      {items.map((item, i) => (
        <React.Fragment key={i}>
          {i > 0 && <ChevronRightIcon className="h-3.5 w-3.5" aria-hidden />}
          {item.href ? (
            <a href={item.href} className="hover:text-fg transition-colors">
              {item.label}
            </a>
          ) : (
            <span className="text-fg font-medium" aria-current="page">
              {item.label}
            </span>
          )}
        </React.Fragment>
      ))}
    </nav>
  ),
);
Breadcrumbs.displayName = 'Breadcrumbs';
export { Breadcrumbs };
