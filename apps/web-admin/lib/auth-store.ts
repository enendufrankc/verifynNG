import { create } from 'zustand';

export interface Membership {
  tenantId: string;
  tenantName: string;
  tenantSlug: string;
  role: 'owner' | 'operator' | 'viewer';
}

export interface AuthUser {
  id: string;
  email: string;
  displayName: string;
  platformRole: string | null;
  mfaEnabled: boolean;
}

interface AuthState {
  accessToken: string | null;
  user: AuthUser | null;
  memberships: Membership[];
  activeTenantId: string | null;
  activeRole: string | null;
  /** False until AuthBootstrap's cookie-refresh attempt settles (success,
   * failure, or "already had a token, nothing to do"). Every role/
   * platformRole gate checked on first render — before this flips true —
   * sees a false-empty state on a hard page reload, since the zustand
   * store starts empty and only AuthBootstrap's async refresh repopulates
   * it. Found via E19's own new layout guards (legal-docs/incidents/
   * retention) 404ing on a fresh navigation straight to those routes;
   * apps/web-admin/app/(console)/support/layout.tsx has the same
   * unguarded check and the same latent bug, not fixed here (E11-owned). */
  hasBootstrapped: boolean;
  setAuth: (data: {
    accessToken: string;
    user: AuthUser;
    memberships: Membership[];
    activeTenantId: string;
    activeRole: string;
  }) => void;
  setAccessToken: (token: string) => void;
  setActiveTenant: (tenantId: string, role: string) => void;
  setBootstrapped: () => void;
  clear: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  accessToken: null,
  user: null,
  memberships: [],
  activeTenantId: null,
  activeRole: null,
  hasBootstrapped: false,
  setAuth: (data) =>
    set({
      accessToken: data.accessToken,
      user: data.user,
      memberships: data.memberships,
      activeTenantId: data.activeTenantId,
      activeRole: data.activeRole,
    }),
  setAccessToken: (token) => set({ accessToken: token }),
  setActiveTenant: (tenantId, role) =>
    set({ activeTenantId: tenantId, activeRole: role }),
  setBootstrapped: () => set({ hasBootstrapped: true }),
  clear: () =>
    set({
      accessToken: null,
      user: null,
      memberships: [],
      activeTenantId: null,
      activeRole: null,
    }),
}));

export function useAuth() {
  const store = useAuthStore();
  return {
    user: store.user,
    memberships: store.memberships,
    activeTenantId: store.activeTenantId,
    role: store.activeRole as 'owner' | 'operator' | 'viewer' | null,
    platformRole: store.user?.platformRole ?? null,
    switchTenant: store.setActiveTenant,
    logout: store.clear,
    isAuthenticated: !!store.accessToken,
    hasBootstrapped: store.hasBootstrapped,
  };
}
