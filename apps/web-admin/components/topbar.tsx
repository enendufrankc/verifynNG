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
    <header className="border-border bg-surface px-s4 gap-s3 flex h-14 shrink-0 items-center justify-between border-b">
      <div className="gap-s2 flex min-w-0 items-center">
        <IconButton
          className="text-fg-muted hover:text-fg lg:hidden"
          aria-label="Open navigation"
          onClick={onOpenMobileNav}
        >
          <MenuIcon className="h-4 w-4" />
        </IconButton>
        <div className="min-w-0 truncate">
          <ConsoleBreadcrumbs />
        </div>
      </div>
      <div className="gap-s2 flex shrink-0 items-center">
        <TenantSwitcher />
        <IconButton
          onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          className="text-fg-muted hover:text-fg"
          aria-label="Toggle dark mode"
        >
          {theme === 'dark' ? (
            <SunIcon className="h-4 w-4" />
          ) : (
            <MoonIcon className="h-4 w-4" />
          )}
        </IconButton>
        <UserMenu />
      </div>
    </header>
  );
}
