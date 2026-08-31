'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuthStore } from '@/lib/auth-store';

export default function SsoCompletePage() {
  return (
    <Suspense>
      <SsoCompleteHandler />
    </Suspense>
  );
}

function SsoCompleteHandler() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const setAuth = useAuthStore((s) => s.setAuth);
  const [error, setError] = useState('');
  const ranOnce = useRef(false);

  useEffect(() => {
    if (ranOnce.current) return; // the exchange code is single-use — StrictMode double-invokes effects
    ranOnce.current = true;

    const code = searchParams.get('code');
    const redirectTo = searchParams.get('redirectTo');
    if (!code) {
      router.replace('/sso/error?code=state_mismatch');
      return;
    }

    (async () => {
      try {
        const res = await fetch('/api/auth/sso/complete', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code }),
        });
        const data = await res.json();

        if (!res.ok) {
          setError(data.message || 'Sign-in failed');
          return;
        }

        if (data.mfaRequired) {
          router.replace(`/login/mfa?mfaToken=${data.mfaToken}`);
          return;
        }

        setAuth({
          accessToken: data.accessToken,
          user: data.user,
          memberships: data.memberships,
          activeTenantId: data.activeTenantId,
          activeRole: data.activeRole,
        });
        router.replace(redirectTo || '/');
      } catch {
        setError('An unexpected error occurred');
      }
    })();
  }, [router, searchParams, setAuth]);

  if (error) {
    return (
      <div className="space-y-4">
        <h2 className="text-fg text-lg font-semibold">Sign-in failed</h2>
        <p className="text-fg-muted text-sm">{error}</p>
        <a href="/login" className="text-brand-text text-sm hover:underline">
          Back to sign in
        </a>
      </div>
    );
  }

  return (
    <div className="text-fg-muted space-y-2 text-sm">
      <p>Finishing sign-in…</p>
    </div>
  );
}
