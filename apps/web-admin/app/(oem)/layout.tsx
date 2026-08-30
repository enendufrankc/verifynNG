'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@verifyng/ui';
import { useAuth } from '@/lib/auth-store';

/**
 * Separate shell for the OEM (factory) portal — no tenant sidebar/nav, since
 * an OEM user isn't a tenant console user even though they share this Next app.
 * Tenant roles landing here (e.g. a stale bookmark) get redirected to `/`.
 */
export default function OemLayout({ children }: { children: React.ReactNode }) {
  const { role, isAuthenticated, logout } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (isAuthenticated && role !== null && role !== 'oem') {
      router.replace('/');
    }
  }, [isAuthenticated, role, router]);

  if (role !== null && role !== 'oem') return null;

  return (
    <div className="bg-bg min-h-screen">
      <header className="border-border bg-surface flex items-center justify-between border-b px-6 py-4">
        <div>
          <div className="text-fg text-lg font-semibold">OEM Portal</div>
          <div className="text-fg-muted text-sm">Manifest deliveries</div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            logout();
            router.push('/login');
          }}
        >
          Log out
        </Button>
      </header>
      <main className="mx-auto max-w-4xl p-6">{children}</main>
    </div>
  );
}
