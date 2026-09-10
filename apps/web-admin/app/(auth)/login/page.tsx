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
      // Same reasoning for platform support: no tenant membership means `/`
      // (a tenant dashboard) has nothing to show them — see AC1 in
      // docs/epics/E18-support-tooling.md.
      const fallback =
        data.activeRole === 'oem'
          ? '/oem/deliveries'
          : data.user?.platformRole === 'support'
            ? '/support'
            : '/';
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
    <div className="space-y-s5">
      <div className="space-y-s2">
        <h2 className="text-fg text-lg font-semibold tracking-tight">
          Sign in
        </h2>
        <p className="text-fg-muted text-sm">
          Enter your credentials to access the console
        </p>
      </div>

      {error && (
        <div
          className="bg-v-flag-tint text-v-flag p-s3 rounded-sm text-sm"
          role="alert"
          data-testid="auth-error"
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
        <div className="space-y-s5">
          <Button
            type="button"
            variant="outline"
            className="w-full"
            onClick={continueWithSso}
          >
            {ssoStatus.buttonLabel ?? 'Continue with SSO'}
          </Button>
          {showPasswordForm && (
            <div
              className="text-fg-faint gap-s3 flex items-center text-xs tracking-wider uppercase"
              aria-hidden="true"
            >
              <span className="bg-border h-px flex-1" />
              or
              <span className="bg-border h-px flex-1" />
            </div>
          )}
        </div>
      )}

      {showPasswordForm ? (
        <form onSubmit={handleSubmit} className="space-y-s5">
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

          <Button type="submit" className="w-full" disabled={isLoading}>
            {isLoading ? 'Signing in\u2026' : 'Sign in'}
          </Button>

          <p className="text-center">
            <a
              href="/forgot-password"
              className="text-brand-text focus-visible:ring-focus rounded-xs text-sm hover:underline focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
            >
              Forgot password?
            </a>
          </p>
        </form>
      ) : (
        <div className="text-fg-muted space-y-s2 text-sm">
          <p>Password sign-in is disabled for this organisation.</p>
          <a
            href={`/sso/break-glass?tenant=${encodeURIComponent(tenant.trim())}`}
            className="text-brand-text focus-visible:ring-focus rounded-xs hover:underline focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
          >
            Owner emergency access
          </a>
        </div>
      )}

      <p className="border-border pt-s5 text-fg-muted border-t text-center text-sm">
        New brand?{' '}
        <a
          href="/signup"
          className="text-brand-text focus-visible:ring-focus rounded-xs font-medium hover:underline focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
        >
          Create an account
        </a>
      </p>
    </div>
  );
}
