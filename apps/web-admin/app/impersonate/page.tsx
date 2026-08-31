'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuthStore } from '@/lib/auth-store';
import { useImpersonationStore } from '@/lib/impersonation-store';
import { apiClient, ApiError } from '@/lib/api-client';

interface MeResponse {
  user: {
    id: string;
    email: string;
    displayName: string;
    platformRole: string | null;
    mfaEnabled: boolean;
  };
}

/**
 * Bridge page for "View as tenant": the tenant directory opens this in a new
 * tab with the freshly-minted impersonation token in the query string
 * (never in a cookie or shared store — a fresh tab is the point, see
 * docs/support-impersonation-policy.md), stores it, then redirects into the
 * tenant console root.
 */
function ImpersonateBootstrap() {
  const router = useRouter();
  const params = useSearchParams();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const token = params.get('token');
    const tenantId = params.get('tenantId');
    const tenantName = params.get('tenantName') ?? '';
    const mode = params.get('mode') as 'read' | 'write' | null;
    const expiresAt = params.get('expiresAt');
    const sessionId = params.get('sessionId');

    if (!token || !tenantId || !mode || !expiresAt || !sessionId) {
      setError('Missing impersonation parameters.');
      return;
    }

    useAuthStore.getState().setAccessToken(token);

    (async () => {
      try {
        const me = await apiClient.get<MeResponse>('/auth/me');
        useAuthStore.getState().setAuth({
          accessToken: token,
          user: me.user,
          memberships: [],
          activeTenantId: tenantId,
          activeRole: mode === 'write' ? 'operator' : 'viewer',
        });
        useImpersonationStore.getState().set({
          sessionId,
          tenantId,
          tenantName,
          mode,
          expiresAt,
        });
        router.replace('/');
      } catch (err) {
        setError(
          err instanceof ApiError
            ? err.message
            : 'Could not start impersonation.',
        );
      }
    })();
  }, [params, router]);

  if (error) {
    return (
      <div className="flex h-screen items-center justify-center p-8 text-center">
        <div>
          <p className="text-fg font-medium">{error}</p>
          <p className="text-fg-muted mt-2 text-sm">
            Close this tab and try starting the impersonation session again.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen items-center justify-center">
      <p className="text-fg-muted text-sm">Starting impersonation session…</p>
    </div>
  );
}

export default function ImpersonatePage() {
  return (
    <Suspense fallback={null}>
      <ImpersonateBootstrap />
    </Suspense>
  );
}
