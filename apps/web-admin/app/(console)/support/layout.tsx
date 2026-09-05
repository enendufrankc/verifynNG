'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { notFound } from 'next/navigation';
import { PageHeader, HelpLink, cn } from '@verifyng/ui';
import { useAuth } from '@/lib/auth-store';

const SUPPORT_NAV = [
  { href: '/support', label: 'Tenants' },
  { href: '/support/tickets', label: 'Tickets' },
  { href: '/support/canned-responses', label: 'Canned responses' },
  { href: '/support/impersonation', label: 'Impersonation' },
  { href: '/support/tenant-review', label: 'Tenant review' },
  { href: '/support/subscriptions', label: 'Subscriptions' },
];

export default function SupportLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { platformRole, hasBootstrapped } = useAuth();
  const pathname = usePathname();


  // This route is statically prerendered, so without this guard Next
  // executes this component once at build time (no auth context at all —
  // platformRole is null) and permanently bakes a 404 into the static
  // output. hasBootstrapped only flips true after the client-side auth
  // store rehydrates post-hydration (see auth-store.ts's own comment on
  // this class of bug); same fix already proven in production for
  // apps/web-admin/app/(console)/billing/layout.tsx.
  if (!hasBootstrapped) return null;
  if (platformRole !== 'support') notFound();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Support"
        description="Tenant directory, impersonation and tickets for platform support."
        actions={<HelpLink docSlug="console/support" module="support" />}
      />
      <div className="border-border flex flex-wrap gap-1 border-b">
        {SUPPORT_NAV.map((item) => {
          const isActive =
            item.href === '/support'
              ? pathname === '/support'
              : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'border-b-2 px-3 py-2 text-sm font-medium transition-colors',
                isActive
                  ? 'border-brand text-fg'
                  : 'text-fg-muted hover:text-fg border-transparent',
              )}
            >
              {item.label}
            </Link>
          );
        })}
      </div>
      <div>{children}</div>
    </div>
  );
}
