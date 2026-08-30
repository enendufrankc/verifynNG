'use client';
import { useAuthStore } from './auth-store';

export function useTenantPath() {
  const activeTenantId = useAuthStore((s) => s.activeTenantId);
  return (path: string) => `/tenants/${activeTenantId}${path}`;
}
