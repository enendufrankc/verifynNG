'use client';

import { useState, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button, Input, FormField } from '@verifyng/ui';
import { useAuthStore } from '@/lib/auth-store';

export default function MfaPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const mfaToken = searchParams.get('mfaToken') || '';
  const [code, setCode] = useState('');
  const [recoveryCode, setRecoveryCode] = useState('');
  const [useRecoveryCode, setUseRecoveryCode] = useState(false);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const setAuth = useAuthStore((s) => s.setAuth);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      const res = await fetch('/api/auth/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'mfa',
          mfaToken,
          ...(useRecoveryCode ? { recoveryCode } : { code }),
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.message || 'Verification failed');
        if (!useRecoveryCode) inputRef.current?.focus();
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
        <h2 className="text-lg font-semibold text-fg">
          Two-factor authentication
        </h2>
        <p className="text-sm text-fg-muted">
          {useRecoveryCode
            ? 'Enter one of your recovery codes'
            : 'Enter the 6-digit code from your authenticator app'}
        </p>
      </div>

      {error && (
        <div
          className="rounded-md bg-v-flag-tint p-3 text-sm text-v-flag"
          role="alert"
        >
          {error}
        </div>
      )}

      {useRecoveryCode ? (
        <FormField label="Recovery code" htmlFor="recoveryCode" required>
          <Input
            id="recoveryCode"
            ref={inputRef}
            value={recoveryCode}
            onChange={(e) => setRecoveryCode(e.target.value)}
            placeholder="abcd-efgh"
            autoComplete="off"
            required
            disabled={isLoading}
          />
        </FormField>
      ) : (
        <FormField label="Authentication code" htmlFor="code" required>
          <Input
            id="code"
            ref={inputRef}
            value={code}
            onChange={(e) =>
              setCode(e.target.value.replace(/\D/g, '').slice(0, 6))
            }
            placeholder="000000"
            autoComplete="one-time-code"
            inputMode="numeric"
            pattern="\d{6}"
            required
            disabled={isLoading}
          />
        </FormField>
      )}

      <Button type="submit" className="w-full" disabled={isLoading}>
        {isLoading ? 'Verifying…' : 'Verify'}
      </Button>

      <button
        type="button"
        onClick={() => {
          setUseRecoveryCode(!useRecoveryCode);
          setError('');
        }}
        className="text-sm text-brand-text hover:underline"
      >
        {useRecoveryCode ? 'Use authenticator code' : 'Use a recovery code'}
      </button>
    </form>
  );
}
