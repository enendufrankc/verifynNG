'use client';

import { useEffect } from 'react';
import { useAuthStore } from '@/lib/auth-store';

/**
 * On mount, silently exchanges the httpOnly vg_refresh cookie (if present)
 * for a fresh access token so role/tenant state survives a page reload —
 * without this, the zustand auth store starts empty on every navigation
 * that isn't a client-side route change, even though middleware still
 * treats the cookie as a valid session.
 */
export function AuthBootstrap() {
  useEffect(() => {
    if (useAuthStore.getState().accessToken) {
      useAuthStore.getState().setBootstrapped();
      return;
    }

    (async () => {
      try {
        const res = await fetch('/api/auth/session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'refresh' }),
        });
        if (!res.ok) return;
        const data = await res.json();
        if (data.user) {
          useAuthStore.getState().setAuth({
            accessToken: data.accessToken,
            user: data.user,
            memberships: data.memberships,
            activeTenantId: data.activeTenantId,
            activeRole: data.activeRole,
          });
        } else {
          useAuthStore.getState().setAccessToken(data.accessToken);
        }
      } catch {
        /* no valid session — middleware will redirect on next navigation */
      } finally {
        useAuthStore.getState().setBootstrapped();
      }
    })();
  }, []);

  return null;
}
