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
      <div className="space-y-s5 text-center">
        <h2 className="text-fg text-lg font-semibold tracking-tight">
          Check your email
        </h2>
        <p className="text-fg-muted text-sm">
          If an account exists with that email, you&apos;ll receive a password
          reset link.
        </p>
        <a
          href="/login"
          className="text-brand-text focus-visible:ring-focus inline-block rounded-xs text-sm hover:underline focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
        >
          Back to sign in
        </a>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-s5">
      <div className="space-y-s2">
        <h2 className="text-fg text-lg font-semibold tracking-tight">
          Reset your password
        </h2>
        <p className="text-fg-muted text-sm">
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
        className="text-brand-text focus-visible:ring-focus block rounded-xs text-center text-sm hover:underline focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
      >
        Back to sign in
      </a>
    </form>
  );
}
