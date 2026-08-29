'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button, Input, FormField } from '@verifyng/ui';

export default function SetPasswordPage() {
  return (
    <Suspense>
      <SetPasswordForm />
    </Suspense>
  );
}

function SetPasswordForm() {
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
      setError('Invalid or missing invite token');
      return;
    }

    setIsLoading(true);
    try {
      // This would proxy to E02's set-password endpoint.
      // Stub: just redirect to login.
      router.push('/login?invited=1');
    } catch {
      setError('An unexpected error occurred');
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <h2 className="text-fg text-lg font-semibold">Set your password</h2>
        <p className="text-fg-muted text-sm">
          You&apos;ve been invited to join the team. Set a password to get
          started.
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
        {isLoading ? 'Setting password…' : 'Set password & sign in'}
      </Button>
    </form>
  );
}
