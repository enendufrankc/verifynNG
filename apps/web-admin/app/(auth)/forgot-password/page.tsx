'use client';

import { useState } from 'react';
import { Button, Input, FormField } from '@verifyng/ui';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setIsLoading(true);

    try {
      // Always returns 202 (no user enumeration)
      await fetch('/api/auth/password/forgot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
    } catch {
      // Swallow errors — same UX
    } finally {
      setIsLoading(false);
      setSubmitted(true);
    }
  }

  if (submitted) {
    return (
      <div className="space-y-4 text-center">
        <h2 className="text-lg font-semibold text-fg">Check your email</h2>
        <p className="text-sm text-fg-muted">
          If an account exists with that email, you&apos;ll receive a password
          reset link.
        </p>
        <a href="/login" className="text-sm text-brand-text hover:underline">
          Back to sign in
        </a>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <h2 className="text-lg font-semibold text-fg">Reset your password</h2>
        <p className="text-sm text-fg-muted">
          Enter your email and we&apos;ll send you a reset link.
        </p>
      </div>

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

      <Button type="submit" className="w-full" disabled={isLoading}>
        {isLoading ? 'Sending…' : 'Send reset link'}
      </Button>

      <a
        href="/login"
        className="block text-center text-sm text-brand-text hover:underline"
      >
        Back to sign in
      </a>
    </form>
  );
}
