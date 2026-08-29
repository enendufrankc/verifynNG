'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button, Input, FormField } from '@verifyng/ui';

export default function ResetPasswordPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    if (newPassword !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    if (!token) {
      setError('Invalid or missing reset token');
      return;
    }

    setIsLoading(true);
    try {
      const res = await fetch('/api/auth/password/reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, newPassword }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.message || 'Reset failed');
        return;
      }

      router.push('/login?reset=1');
    } catch {
      setError('An unexpected error occurred');
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <h2 className="text-lg font-semibold text-fg">Set new password</h2>
        <p className="text-sm text-fg-muted">
          Choose a strong password for your account.
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

      <FormField label="New password" htmlFor="newPassword" required>
        <Input
          id="newPassword"
          type="password"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          autoComplete="new-password"
          required
          disabled={isLoading}
        />
      </FormField>

      <FormField label="Confirm password" htmlFor="confirmPassword" required>
        <Input
          id="confirmPassword"
          type="password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          autoComplete="new-password"
          required
          disabled={isLoading}
        />
      </FormField>

      <Button type="submit" className="w-full" disabled={isLoading}>
        {isLoading ? 'Resetting…' : 'Reset password'}
      </Button>
    </form>
  );
}
