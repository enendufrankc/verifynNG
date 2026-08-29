'use client';

import { useAuth, useAuthStore } from '@/lib/auth-store';
import { ChevronDownIcon } from 'lucide-react';
import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { cn } from '@verifyng/ui';

export function TenantSwitcher() {
  const { memberships, activeTenantId } = useAuth();
  const [open, setOpen] = useState(false);
  const [switching, setSwitching] = useState(false);
  const queryClient = useQueryClient();

  if (!memberships || memberships.length === 0) return null;

  const activeMembership = memberships.find(
    (m) => m.tenantId === activeTenantId,
  );

  async function switchTenant(tenantId: string) {
    setSwitching(true);
    try {
      const res = await fetch('/api/auth/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'switch-tenant', tenantId }),
      });
      if (!res.ok) return;
      const data = await res.json();
      useAuthStore.getState().setAccessToken(data.accessToken);
      useAuthStore
        .getState()
        .setActiveTenant(data.activeTenantId, data.activeRole);
      queryClient.clear();
    } finally {
      setSwitching(false);
      setOpen(false);
    }
  }

  if (memberships.length === 1) {
    return (
      <span className="text-fg truncate text-sm font-medium">
        {activeMembership?.tenantName}
      </span>
    );
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        disabled={switching}
        className="text-fg hover:bg-surface-sunken flex items-center gap-1.5 rounded-md px-2 py-1 text-sm font-medium transition-colors disabled:opacity-50"
        aria-expanded={open}
        aria-haspopup="listbox"
      >
        <span className="max-w-32 truncate">
          {activeMembership?.tenantName}
        </span>
        <ChevronDownIcon className="text-fg-muted h-4 w-4" />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <ul
            role="listbox"
            className="border-border bg-surface absolute top-full left-0 z-50 mt-1 w-56 rounded-md border py-1 shadow-lg"
          >
            {memberships.map((m) => (
              <li
                key={m.tenantId}
                role="option"
                aria-selected={m.tenantId === activeTenantId}
                onClick={() => switchTenant(m.tenantId)}
                className={cn(
                  'hover:bg-surface-sunken cursor-pointer px-3 py-2 text-sm',
                  m.tenantId === activeTenantId &&
                    'bg-surface-sunken text-fg font-medium',
                )}
              >
                <div className="text-fg">{m.tenantName}</div>
                <div className="text-fg-muted text-xs capitalize">{m.role}</div>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
