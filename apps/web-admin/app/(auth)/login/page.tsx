'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button, Input, FormField } from '@verifyng/ui';
import { useAuthStore } from '@/lib/auth-store';
import { apiClient } from '@/lib/api-client';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

interface SsoStatus {
  enabled: boolean;
  provider?: string;
  enforceSso?: boolean;
  buttonLabel?: string;
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [tenant, setTenant] = useState(searchParams.get('tenant') ?? '');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [ssoStatus, setSsoStatus] = useState<SsoStatus | null>(null);
  const setAuth = useAuthStore((s) => s.setAuth);

  // Debounced: this fires on every keystroke in the organisation field, and
  // /auth/sso/:slug is a real (if cheap) tenant lookup.
  useEffect(() => {
    const slug = tenant.trim().toLowerCase();
    if (!slug) {
      setSsoStatus(null);
      return;
    }
    const timer = setTimeout(() => {
      apiClient
        .get<SsoStatus>(`/auth/sso/${encodeURIComponent(slug)}`)
        .then(setSsoStatus)
        .catch(() => setSsoStatus(null));
    }, 300);
    return () => clearTimeout(timer);
  }, [tenant]);

  function continueWithSso() {
    const slug = tenant.trim().toLowerCase();
    const redirectTo = encodeURIComponent(window.location.origin);
    window.location.href = `${API_BASE}/auth/sso/${encodeURIComponent(slug)}/start?redirectTo=${redirectTo}`;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      const res = await fetch('/api/auth/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'login',
          email,
          password,
          tenant: tenant.trim() || undefined,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        if (data.code === 'sso_required') {
          setError(
            'This organisation requires signing in with single sign-on.',
          );
          return;
        }
        setError(data.message || 'Login failed');
        return;
      }

      if (data.mfaRequired) {
        router.push(`/login/mfa?mfaToken=${data.mfaToken}`);
        return;
      }

      setAuth({
        accessToken: data.accessToken,
        user: data.user,
        memberships: data.memberships,
        activeTenantId: data.activeTenantId,
        activeRole: data.activeRole,
      });

      // An OEM user has no tenant console to land on — the email link's own
      // `next` (an /oem/... deep link) still takes priority when present.
      const fallback = data.activeRole === 'oem' ? '/oem/deliveries' : '/';
      const next = searchParams.get('next') || fallback;
      router.push(next);
    } catch {
      setError('An unexpected error occurred');
    } finally {
      setIsLoading(false);
    }
  }

  const showPasswordForm = !ssoStatus?.enforceSso;

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <h2 className="text-fg text-lg font-semibold">Sign in</h2>
        <p className="text-fg-muted text-sm">
          Enter your credentials to access the console
        </p>
      </div>

      {error && (
        <div
          className="bg-v-flag-tint text-v-flag rounded-md p-3 text-sm"
          role="alert"
        >
          {error}
        </div>
      )}

      <FormField label="Organisation" htmlFor="tenant">
        <Input
          id="tenant"
          value={tenant}
          onChange={(e) => setTenant(e.target.value)}
          placeholder="your-organisation"
          autoComplete="organization"
          disabled={isLoading}
        />
      </FormField>

      {ssoStatus?.enabled && (
        <Button
          type="button"
          variant="outline"
          className="w-full"
          onClick={continueWithSso}
        >
          {ssoStatus.buttonLabel ?? 'Continue with SSO'}
        </Button>
      )}

      {showPasswordForm ? (
        <form onSubmit={handleSubmit} className="space-y-4">
          <FormField label="Email" htmlFor="email" required>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@company.com"
              autoComplete="email"
              required
              disabled={isLoading}
            />
          </FormField>

          <FormField label="Password" htmlFor="password" required>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
              disabled={isLoading}
            />
          </FormField>

          <div className="flex items-center justify-between">
            <a
              href="/forgot-password"
              className="text-brand-text text-sm hover:underline"
            >
              Forgot password?
            </a>
          </div>

          <Button type="submit" className="w-full" disabled={isLoading}>
            {isLoading ? 'Signing in…' : 'Sign in'}
          </Button>
        </form>
      ) : (
        <div className="text-fg-muted space-y-2 text-sm">
          <p>Password sign-in is disabled for this organisation.</p>
          <a
            href={`/sso/break-glass?tenant=${encodeURIComponent(tenant.trim())}`}
            className="text-brand-text hover:underline"
          >
            Owner emergency access
          </a>
        </div>
      )}
    </div>
  );
}
