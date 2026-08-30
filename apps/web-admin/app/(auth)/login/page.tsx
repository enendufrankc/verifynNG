'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button, Input, FormField } from '@verifyng/ui';
import { useAuthStore } from '@/lib/auth-store';

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
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const setAuth = useAuthStore((s) => s.setAuth);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      const res = await fetch('/api/auth/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'login', email, password }),
      });

      const data = await res.json();

      if (!res.ok) {
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

      const next = searchParams.get('next') || '/';
      router.push(next);
    } catch {
      setError('An unexpected error occurred');
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
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
  );
}
