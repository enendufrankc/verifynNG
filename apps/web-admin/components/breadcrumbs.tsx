'use client';

import { usePathname } from 'next/navigation';
import { Breadcrumbs as BreadcrumbsUI } from '@verifyng/ui';

export function ConsoleBreadcrumbs() {
  const pathname = usePathname();
  const segments = pathname.split('/').filter(Boolean);

  const items = segments.map((segment, i) => ({
    label:
      segment.charAt(0).toUpperCase() + segment.slice(1).replace(/-/g, ' '),
    href:
      i < segments.length - 1
        ? '/' + segments.slice(0, i + 1).join('/')
        : undefined,
  }));

  if (items.length === 0) return null;

  return <BreadcrumbsUI items={items} />;
}
