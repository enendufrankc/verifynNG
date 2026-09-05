'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';

const MESSAGES: Record<string, string> = {
  sso_not_configured: 'Single sign-on is not set up for this organisation.',
  invalid_redirect: 'That sign-in link is not valid. Try signing in again.',
  state_mismatch:
    'Your sign-in session expired or was already used. Please try again.',
  idp_unreachable:
    "We couldn't reach your identity provider. Please try again in a moment, or use the owner emergency access link below.",
  idp_error: 'Your identity provider reported an error during sign-in.',
  email_unverified:
    'Your identity provider account does not have a verified email address.',
  domain_not_allowed:
    'Your email domain is not allowed to sign in to this organisation.',
  jit_disabled:
    "This organisation hasn't been set up to automatically add new members. Ask an owner to invite you.",
  mfa_enrolment_required:
    'Two-factor authentication is now required for your role. Sign in with your password to set it up.',
};

export default function SsoErrorPage() {
  return (
    <Suspense>
      <SsoErrorContent />
    </Suspense>
  );
}

function SsoErrorContent() {
  const searchParams = useSearchParams();
  const code = searchParams.get('code') ?? '';
  const tenant = searchParams.get('tenant');
  const message = MESSAGES[code] ?? 'Something went wrong finishing sign-in.';

  return (
    <div className="space-y-4">
      <h2 className="text-fg text-lg font-semibold">Sign-in failed</h2>
      <div
        className="bg-v-flag-tint text-v-flag rounded-md p-3 text-sm"
        role="alert"
      >
        {message}
      </div>
      <p className="text-fg-muted text-xs">
        Error code: <code>{code}</code>
      </p>
      <div className="flex flex-col gap-2">
        <a href="/login" className="text-brand-text text-sm hover:underline">
          Back to sign in
        </a>
        {tenant && (
          <a
            href={`/sso/break-glass?tenant=${encodeURIComponent(tenant)}`}
            className="text-brand-text text-sm hover:underline"
          >
            Owner emergency access
          </a>
        )}
      </div>
    </div>
  );
}
