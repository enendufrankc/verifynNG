'use client';

import { MoonIcon, SunIcon } from 'lucide-react';
import { useTheme } from 'next-themes';
import { TenantSwitcher } from './tenant-switcher';
import { UserMenu } from './user-menu';
import { ConsoleBreadcrumbs } from './breadcrumbs';

export function Topbar() {
  const { theme, setTheme } = useTheme();

  return (
    <header className="flex h-14 items-center justify-between border-b border-border bg-surface px-4">
      <ConsoleBreadcrumbs />
      <div className="flex items-center gap-3">
        <TenantSwitcher />
        <button
          onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          className="rounded-md p-1.5 text-fg-muted hover:bg-surface-sunken"
          aria-label="Toggle dark mode"
        >
          {theme === 'dark' ? (
            <SunIcon className="h-4 w-4" />
          ) : (
            <MoonIcon className="h-4 w-4" />
          )}
        </button>
        <UserMenu />
      </div>
    </header>
  );
}
