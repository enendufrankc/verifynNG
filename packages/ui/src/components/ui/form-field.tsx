import * as React from 'react';
import { cn } from '@/lib/utils';
import { Label } from './label';

export interface FormFieldProps extends React.HTMLAttributes<HTMLDivElement> {
  label?: string;
  htmlFor?: string;
  error?: string;
  description?: string;
  required?: boolean;
}

const FormField = React.forwardRef<HTMLDivElement, FormFieldProps>(
  (
    {
      className,
      label,
      htmlFor,
      error,
      description,
      required,
      children,
      ...props
    },
    ref,
  ) => (
    <div ref={ref} className={cn('space-y-2', className)} {...props}>
      {label && (
        <Label htmlFor={htmlFor}>
          {label}
          {required && <span className="text-danger ml-1">*</span>}
        </Label>
      )}
      {children}
      {description && !error && (
        <p className="text-fg-muted text-sm">{description}</p>
      )}
      {error && (
        <p className="text-danger text-sm" role="alert">
          {error}
        </p>
      )}
    </div>
  ),
);
FormField.displayName = 'FormField';
export { FormField };
