'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { PageHeader, cn } from '@verifyng/ui';

const SETTINGS_NAV = [
  { href: '/settings/organization', label: 'Organization' },
  { href: '/settings/security', label: 'Security' },
  { href: '/settings/api-keys', label: 'API keys' },
];

export default function SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Settings"
        description="Manage your organization, security and integrations."
      />
      <div className="border-border flex gap-1 border-b">
        {SETTINGS_NAV.map((item) => {
          const isActive = pathname.startsWith(item.href);
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
