'use client';

import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { NAV_SECTIONS, type NavEntry } from '@/app/(console)/nav.config';
import { filterNavByRole } from '@/lib/role-utils';
import { useAuth } from '@/lib/auth-store';
import { PanelLeftCloseIcon, PanelLeftIcon } from 'lucide-react';
import { useState } from 'react';
import { cn, IconButton } from '@verifyng/ui';

export function Sidebar() {
  const pathname = usePathname();
  const { role, platformRole } = useAuth();
  const [collapsed, setCollapsed] = useState(false);

  const visibleEntries = filterNavByRole(role, platformRole);
  const groupedBySection = Object.entries(NAV_SECTIONS)
    .sort(([, a], [, b]) => a.order - b.order)
    .map(([sectionKey, sectionMeta]) => ({
      key: sectionKey as NavEntry['section'],
      label: sectionMeta.label,
      entries: visibleEntries.filter((e) => e.section === sectionKey),
    }))
    .filter((g) => g.entries.length > 0);

  return (
    <aside
      className={cn(
        'border-border bg-surface flex h-full flex-col border-r transition-[width] duration-200',
        collapsed ? 'w-16' : 'w-60',
      )}
    >
      <div
        className={cn(
          'border-border px-s3 flex h-14 shrink-0 items-center border-b',
          collapsed ? 'justify-center' : 'justify-between',
        )}
      >
        {!collapsed && (
          <span className="gap-s2 flex items-center">
            <span
              aria-hidden="true"
              className="bg-brand text-brand-ink grid h-6 w-6 place-content-center rounded-xs text-xs font-bold"
            >
              V
            </span>
            <span className="text-fg text-sm font-semibold tracking-tight">
              Verify Admin
            </span>
          </span>
        )}
        <IconButton
          size="sm"
          onClick={() => setCollapsed(!collapsed)}
          className="text-fg-muted hover:text-fg w-10 px-0"
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? (
            <PanelLeftIcon className="h-4 w-4" />
          ) : (
            <PanelLeftCloseIcon className="h-4 w-4" />
          )}
        </IconButton>
      </div>

      <nav
        className="py-s3 space-y-s5 flex-1 overflow-y-auto"
        aria-label="Main navigation"
      >
        {groupedBySection.map((group) => (
          <div key={group.key} className="space-y-s1">
            {!collapsed && (
              <div className="text-fg-faint px-s4 pb-s1 text-xs font-semibold tracking-wider uppercase">
                {group.label}
              </div>
            )}
            {group.entries.map((entry) => {
              const Icon = entry.icon;
              const isActive =
                entry.href === '/'
                  ? pathname === '/'
                  : pathname.startsWith(entry.href);
              return (
                <Link
                  key={entry.id}
                  href={entry.href}
                  className={cn(
                    'mx-s2 gap-s3 px-s2 focus-visible:ring-focus relative flex min-h-11 items-center rounded-sm text-sm transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none lg:min-h-10',
                    isActive
                      ? 'bg-surface-sunken text-fg font-medium'
                      : 'text-fg-muted hover:bg-surface-sunken hover:text-fg',
                    collapsed && 'justify-center',
                  )}
                  title={collapsed ? entry.label : undefined}
                  aria-current={isActive ? 'page' : undefined}
                >
                  {isActive && (
                    <span
                      aria-hidden="true"
                      className="bg-brand absolute inset-y-1 left-0 w-0.5 rounded-full"
                    />
                  )}
                  <Icon className="h-4 w-4 shrink-0" />
                  {!collapsed && (
                    <span className="truncate">{entry.label}</span>
                  )}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>
    </aside>
  );
}
