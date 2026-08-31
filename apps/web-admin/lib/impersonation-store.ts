import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { ImpersonationMode } from './impersonation';

export interface ImpersonationState {
  sessionId: string | null;
  tenantId: string | null;
  tenantName: string | null;
  mode: ImpersonationMode | null;
  expiresAt: string | null;
  /** Set once the guard/timer notices the session is over — distinct from
   * `clear()` so the banner can show "Session expired" before disappearing. */
  expired: boolean;
  set: (data: {
    sessionId: string;
    tenantId: string;
    tenantName: string;
    mode: ImpersonationMode;
    expiresAt: string;
  }) => void;
  markExpired: () => void;
  clear: () => void;
}

/**
 * Per-tab impersonation state. `sessionStorage` (not the accessToken store's
 * plain in-memory zustand) because impersonation deliberately opens in its
 * own browser tab — see `/impersonate` — and must never leak into the
 * support user's original console tab or survive as a shared login.
 */
export const useImpersonationStore = create<ImpersonationState>()(
  persist(
    (set) => ({
      sessionId: null,
      tenantId: null,
      tenantName: null,
      mode: null,
      expiresAt: null,
      expired: false,
      set: (data) => set({ ...data, expired: false }),
      markExpired: () => set({ expired: true }),
      clear: () =>
        set({
          sessionId: null,
          tenantId: null,
          tenantName: null,
          mode: null,
          expiresAt: null,
          expired: false,
        }),
    }),
    {
      name: 'verifyng-impersonation',
      storage: createJSONStorage(() =>
        typeof window === 'undefined'
          ? // SSR/build-time no-op storage
            {
              getItem: () => null,
              setItem: () => undefined,
              removeItem: () => undefined,
            }
          : window.sessionStorage,
      ),
    },
  ),
);
