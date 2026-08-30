import * as React from 'react';
import { cn } from '@/lib/utils';

export interface FormMessageProps
  extends React.HTMLAttributes<HTMLParagraphElement> {
  error?: boolean;
}

const FormMessage = React.forwardRef<HTMLParagraphElement, FormMessageProps>(
  ({ className, error, children, ...props }, ref) => {
    if (!children) return null;
    return (
      <p
        ref={ref}
        className={cn(
          'text-sm',
          error ? 'text-danger' : 'text-fg-muted',
          className,
        )}
        role={error ? 'alert' : undefined}
        {...props}
      >
        {children}
      </p>
    );
  },
);
FormMessage.displayName = 'FormMessage';
export { FormMessage };
