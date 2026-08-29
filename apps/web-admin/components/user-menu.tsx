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
        className="flex h-8 w-8 items-center justify-center rounded-full bg-brand text-brand-ink text-sm font-semibold hover:bg-brand-strong transition-colors"
        aria-label="User menu"
        aria-expanded={open}
        aria-haspopup="menu"
      >
        {initials}
      </button>

      {open && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setOpen(false)}
          />
          <div
            role="menu"
            className="absolute right-0 top-full z-50 mt-1 w-56 rounded-md border border-border bg-surface py-1 shadow-lg"
          >
            <div className="border-b border-border px-3 py-2">
              <p className="text-sm font-medium text-fg">
                {user.displayName}
              </p>
              <p className="text-xs text-fg-muted">{user.email}</p>
            </div>
            <button
              role="menuitem"
              onClick={async () => {
                await fetch('/api/auth/logout', { method: 'POST' });
                logout();
                setOpen(false);
                router.push('/login');
              }}
              className="flex w-full items-center gap-2 px-3 py-2 text-sm text-fg-muted hover:bg-surface-sunken"
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
