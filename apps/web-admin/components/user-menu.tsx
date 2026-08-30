'use client';

import { useAuth } from '@/lib/auth-store';
import { LogOutIcon } from 'lucide-react';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

export function UserMenu() {
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const router = useRouter();

  if (!user) return null;

  const initials = user.displayName
    .split(' ')
    .map((n) => n[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="bg-brand text-brand-ink hover:bg-brand-strong flex h-8 w-8 items-center justify-center rounded-full text-sm font-semibold transition-colors"
        aria-label="User menu"
        aria-expanded={open}
        aria-haspopup="menu"
      >
        {initials}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div
            role="menu"
            className="border-border bg-surface absolute top-full right-0 z-50 mt-1 w-56 rounded-md border py-1 shadow-lg"
          >
            <div className="border-border border-b px-3 py-2">
              <p className="text-fg text-sm font-medium">{user.displayName}</p>
              <p className="text-fg-muted text-xs">{user.email}</p>
            </div>
            <button
              role="menuitem"
              onClick={async () => {
                await fetch('/api/auth/logout', { method: 'POST' });
                logout();
                setOpen(false);
                router.push('/login');
              }}
              className="text-fg-muted hover:bg-surface-sunken flex w-full items-center gap-2 px-3 py-2 text-sm"
            >
              <LogOutIcon className="h-4 w-4" />
              Sign out
            </button>
          </div>
        </>
      )}
    </div>
  );
}
