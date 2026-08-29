'use client';

import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { NAV_SECTIONS, type NavEntry } from '@/app/(console)/nav.config';
import { filterNavByRole } from '@/lib/role-utils';
import { useAuth } from '@/lib/auth-store';
import { PanelLeftCloseIcon, PanelLeftIcon } from 'lucide-react';
import { useState } from 'react';
import { cn } from '@verifyng/ui';

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
        'border-border bg-surface flex h-full flex-col border-r transition-all',
        collapsed ? 'w-16' : 'w-60',
      )}
    >
      <div className="border-border flex items-center justify-between border-b px-3 py-3">
        {!collapsed && (
          <span className="text-fg text-sm font-semibold">Verify Admin</span>
        )}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="text-fg-muted hover:bg-surface-sunken rounded-md p-1.5"
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? (
            <PanelLeftIcon className="h-4 w-4" />
          ) : (
            <PanelLeftCloseIcon className="h-4 w-4" />
          )}
        </button>
      </div>

      <nav className="flex-1 overflow-y-auto py-2" aria-label="Main navigation">
        {groupedBySection.map((group) => (
          <div key={group.key} className="mb-3">
            {!collapsed && (
              <div className="text-fg-faint px-3 pb-1 text-xs font-medium tracking-wider uppercase">
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
                    'mx-2 flex items-center gap-3 rounded-md px-2 py-1.5 text-sm transition-colors',
                    isActive
                      ? 'bg-surface-sunken text-fg font-medium'
                      : 'text-fg-muted hover:bg-surface-sunken hover:text-fg',
                    collapsed && 'justify-center',
                  )}
                  title={collapsed ? entry.label : undefined}
                  aria-current={isActive ? 'page' : undefined}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  {!collapsed && <span>{entry.label}</span>}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>
    </aside>
  );
}
