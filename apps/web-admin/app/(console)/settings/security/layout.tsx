'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@verifyng/ui';

// Sub-tabs within Settings → Security. `page.tsx` (personal password/MFA)
// is E02's; `sso/` and `mfa-policy/` are E20's, added here rather than
// editing page.tsx directly.
const SECURITY_NAV = [
  { href: '/settings/security', label: 'Password & sessions', exact: true },
  { href: '/settings/security/sso', label: 'Single sign-on' },
  { href: '/settings/security/mfa-policy', label: 'MFA policy' },
];

export default function SettingsSecurityLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  return (
    <div className="space-y-4">
      <div className="flex gap-4 text-sm">
        {SECURITY_NAV.map((item) => {
          const isActive = item.exact
            ? pathname === item.href
            : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'pb-1',
                isActive
                  ? 'text-fg border-brand border-b-2 font-medium'
                  : 'text-fg-muted hover:text-fg',
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
