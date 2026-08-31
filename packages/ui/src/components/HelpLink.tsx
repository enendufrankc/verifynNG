'use client';

import { HelpCircle, LifeBuoy } from 'lucide-react';
import { cn } from '../lib/utils';

declare const process: { env: Record<string, string | undefined> } | undefined;

export interface HelpLinkProps {
  /** Slug under apps/docs, e.g. "console/batches" — resolves to `${docsBaseUrl}/docs/<docSlug>`. */
  docSlug: string;
  /** Console module name, forwarded to the help form as context. */
  module?: string;
  /** Defaults to `NEXT_PUBLIC_DOCS_URL` (falls back to http://localhost:3002). */
  docsBaseUrl?: string;
  /** Path to the in-console "Get help" form. Defaults to "/help". */
  helpFormPath?: string;
  className?: string;
}

/**
 * Dropped into a module's page header — a "?" link to that page's docs
 * article, and a "Get help" link into the console help form pre-filled with
 * the current page. See docs/epics/E18-support-tooling.md T7/T13.
 */
export function HelpLink({
  docSlug,
  module,
  docsBaseUrl,
  helpFormPath = '/help',
  className,
}: HelpLinkProps) {
  const base =
    docsBaseUrl ??
    (typeof process !== 'undefined'
      ? process?.env.NEXT_PUBLIC_DOCS_URL
      : undefined) ??
    'http://localhost:3002';

  const helpHref = () => {
    if (typeof window === 'undefined') return helpFormPath;
    const url = new URL(helpFormPath, window.location.origin);
    url.searchParams.set('pageUrl', window.location.pathname);
    if (module) url.searchParams.set('module', module);
    return url.toString();
  };

  return (
    <span className={cn('inline-flex items-center gap-3 text-sm', className)}>
      <a
        href={`${base}/docs/${docSlug}`}
        target="_blank"
        rel="noreferrer"
        aria-label="Help for this page"
        title="Help for this page"
        className="text-fg-muted hover:text-fg inline-flex h-6 w-6 items-center justify-center rounded-full border"
      >
        <HelpCircle className="h-3.5 w-3.5" />
      </a>
      <a
        href={helpHref()}
        className="text-fg-muted hover:text-fg inline-flex items-center gap-1"
      >
        <LifeBuoy className="h-3.5 w-3.5" />
        Get help
      </a>
    </span>
  );
}
