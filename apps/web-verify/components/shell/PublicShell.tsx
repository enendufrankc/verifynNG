'use client';

import type { ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import type { TenantPublicProfile } from '@/lib/api';
import { TenantThemeProvider } from '@/components/tenant/ThemeProvider';

/** Selects the platform shell on home, including during client navigation. */
export function PublicShell({
  children,
  footer,
  profile,
}: {
  children: ReactNode;
  footer: ReactNode;
  profile: TenantPublicProfile;
}) {
  const pathname = usePathname();
  if (pathname === '/') return children;

  return (
    <TenantThemeProvider profile={profile}>
      <main className="px-s4 py-s10 flex flex-1 flex-col items-center justify-center">
        {children}
      </main>
      {footer}
    </TenantThemeProvider>
  );
}
