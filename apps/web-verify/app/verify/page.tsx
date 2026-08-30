import { redirect } from 'next/navigation';
import { normalizeCode } from '@verifynng/core';
import { loadEnv } from '@verifynng/config';
import { ManualEntryForm } from '@/components/verify/ManualEntryForm';
import { PageBeacon } from '@/components/analytics/PageBeacon';

interface PageProps {
  searchParams: Promise<{ code?: string }>;
}

/**
 * `?code=` is how the no-JS form submits (native GET) — normalize and
 * redirect to `/v/[code]`, which owns all validation (malformed input
 * renders the `invalid` verdict there, not here). JS-enabled submits skip
 * this round trip entirely via ManualEntryForm's client navigation.
 */
export default async function VerifyPage({ searchParams }: PageProps) {
  const { code } = await searchParams;
  if (code && code.trim()) {
    redirect(`/v/${encodeURIComponent(normalizeCode(code))}?src=manual`);
  }

  return (
    <section className="border-border bg-surface p-s8 w-full max-w-md rounded-lg border shadow-lg">
      <PageBeacon tenantSlug={loadEnv().NEXT_PUBLIC_DEFAULT_TENANT} />
      <h1 className="text-fg text-center font-sans text-2xl font-semibold">
        Enter your code
      </h1>
      <p className="mt-s2 text-fg-muted text-center text-sm">
        Type the code from the hidden scratch panel, or the code under the cap.
      </p>
      <div className="mt-s6">
        <ManualEntryForm />
      </div>
    </section>
  );
}
