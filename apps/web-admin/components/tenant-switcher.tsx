'use client';

import { useAuth } from '@/lib/auth-store';
import { ChevronDownIcon } from 'lucide-react';
import { useState } from 'react';
import { cn } from '@verifyng/ui';

export function TenantSwitcher() {
  const { memberships, activeTenantId, switchTenant } = useAuth();
  const [open, setOpen] = useState(false);

  if (!memberships || memberships.length === 0) return null;

  const activeMembership = memberships.find(
    (m) => m.tenantId === activeTenantId,
  );

  if (memberships.length === 1) {
    return (
      <span className="text-sm font-medium text-fg truncate">
        {activeMembership?.tenantName}
      </span>
    );
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 rounded-md px-2 py-1 text-sm font-medium text-fg hover:bg-surface-sunken transition-colors"
        aria-expanded={open}
        aria-haspopup="listbox"
      >
        <span className="truncate max-w-32">
          {activeMembership?.tenantName}
        </span>
        <ChevronDownIcon className="h-4 w-4 text-fg-muted" />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <ul
            role="listbox"
            className="absolute left-0 top-full z-50 mt-1 w-56 rounded-md border border-border bg-surface py-1 shadow-lg"
          >
            {memberships.map((m) => (
              <li
                key={m.tenantId}
                role="option"
                aria-selected={m.tenantId === activeTenantId}
                onClick={() => {
                  switchTenant(m.tenantId, m.role);
                  setOpen(false);
                }}
                className={cn(
                  'cursor-pointer px-3 py-2 text-sm hover:bg-surface-sunken',
                  m.tenantId === activeTenantId &&
                    'bg-surface-sunken font-medium text-fg',
                )}
              >
                <div className="text-fg">{m.tenantName}</div>
                <div className="text-xs text-fg-muted capitalize">
                  {m.role}
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
