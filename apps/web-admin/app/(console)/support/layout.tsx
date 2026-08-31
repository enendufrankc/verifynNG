'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { notFound } from 'next/navigation';
import { PageHeader, cn } from '@verifyng/ui';
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

  // hasBootstrapped guards against the false-empty flash on a hard reload —
  // platformRole reads as null until AuthBootstrap's cookie-refresh settles,
  // which would otherwise 404 a real support user every time. Noted as a
  // known gap in lib/auth-store.ts before this fix.
  if (!hasBootstrapped) return null;
  if (platformRole !== 'support') notFound();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Support"
        description="Tenant directory, impersonation and tickets for platform support."
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
