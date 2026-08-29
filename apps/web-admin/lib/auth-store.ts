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
  setAuth: (data: {
    accessToken: string;
    user: AuthUser;
    memberships: Membership[];
    activeTenantId: string;
    activeRole: string;
  }) => void;
  setAccessToken: (token: string) => void;
  setActiveTenant: (tenantId: string, role: string) => void;
  clear: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  accessToken: null,
  user: null,
  memberships: [],
  activeTenantId: null,
  activeRole: null,
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
    platformRole: store.user?.platformRole,
    switchTenant: store.setActiveTenant,
    logout: store.clear,
    isAuthenticated: !!store.accessToken,
  };
}
