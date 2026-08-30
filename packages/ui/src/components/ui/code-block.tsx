import * as React from 'react';
import { cn } from '@/lib/utils';

export interface CodeBlockProps extends React.HTMLAttributes<HTMLPreElement> {
  code: string;
  language?: string;
}

const CodeBlock = React.forwardRef<HTMLPreElement, CodeBlockProps>(
  ({ className, code, language, ...props }, ref) => (
    <pre
      ref={ref}
      className={cn(
        'bg-surface-sunken text-fg overflow-x-auto rounded-md p-4 font-mono text-sm',
        className,
      )}
      data-language={language}
      {...props}
    >
      <code>{code}</code>
    </pre>
  ),
);
CodeBlock.displayName = 'CodeBlock';
export { CodeBlock };
