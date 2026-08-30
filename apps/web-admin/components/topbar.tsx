'use client';

import { MenuIcon, MoonIcon, SunIcon } from 'lucide-react';
import { useTheme } from 'next-themes';
import { IconButton } from '@verifyng/ui';
import { TenantSwitcher } from './tenant-switcher';
import { UserMenu } from './user-menu';
import { ConsoleBreadcrumbs } from './breadcrumbs';

export function Topbar({ onOpenMobileNav }: { onOpenMobileNav?: () => void }) {
  const { theme, setTheme } = useTheme();

  return (
    <header className="border-border bg-surface flex h-14 items-center justify-between border-b px-4">
      <div className="flex items-center gap-2">
        <IconButton
          className="lg:hidden"
          aria-label="Open navigation"
          onClick={onOpenMobileNav}
        >
          <MenuIcon className="h-4 w-4" />
        </IconButton>
        <ConsoleBreadcrumbs />
      </div>
      <div className="flex items-center gap-3">
        <TenantSwitcher />
        <button
          onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          className="text-fg-muted hover:bg-surface-sunken rounded-md p-1.5"
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
