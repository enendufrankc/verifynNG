'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button, Input, FormField } from '@verifyng/ui';
import { useAuthStore } from '@/lib/auth-store';

export default function BreakGlassPage() {
  return (
    <Suspense>
      <BreakGlassForm />
    </Suspense>
  );
}

function BreakGlassForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const setAuth = useAuthStore((s) => s.setAuth);
  const [tenant, setTenant] = useState(searchParams.get('tenant') ?? '');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [totp, setTotp] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setIsLoading(true);
    try {
      const res = await fetch('/api/auth/break-glass', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenant, email, password, totp }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.message || 'Emergency access denied');
        return;
      }
      setAuth({
        accessToken: data.accessToken,
        user: data.user,
        memberships: data.memberships,
        activeTenantId: data.activeTenantId,
        activeRole: data.activeRole,
      });
      router.push('/');
    } catch {
      setError('An unexpected error occurred');
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <h2 className="text-fg text-lg font-semibold">
          Owner emergency access
        </h2>
        <p className="text-fg-muted text-sm">
          For owners only, when single sign-on is enforced and your identity
          provider is unavailable. Issues a one-hour session.
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

      <FormField label="Organisation" htmlFor="tenant" required>
        <Input
          id="tenant"
          value={tenant}
          onChange={(e) => setTenant(e.target.value)}
          placeholder="ivoryglow"
          required
          disabled={isLoading}
        />
      </FormField>

      <FormField label="Email" htmlFor="email" required>
        <Input
          id="email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
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

      <FormField label="Authentication code" htmlFor="totp" required>
        <Input
          id="totp"
          value={totp}
          onChange={(e) =>
            setTotp(e.target.value.replace(/\D/g, '').slice(0, 6))
          }
          placeholder="000000"
          inputMode="numeric"
          autoComplete="one-time-code"
          required
          disabled={isLoading}
        />
      </FormField>

      <Button
        type="submit"
        variant="destructive"
        className="w-full"
        disabled={isLoading}
      >
        {isLoading ? 'Verifying…' : 'Get emergency access'}
      </Button>

      <a
        href="/login"
        className="text-brand-text block text-sm hover:underline"
      >
        Back to sign in
      </a>
    </form>
  );
}
