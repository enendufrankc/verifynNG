import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { normalizeCode } from '@verifynng/core';
import { loadEnv } from '@verifynng/config';
import { resolveLocale, LocaleProvider, t } from '@/lib/i18n';
import { ManualEntryForm } from '@/components/verify/ManualEntryForm';
import { PageBeacon } from '@/components/analytics/PageBeacon';

interface PageProps {
  searchParams: Promise<{ code?: string; lang?: string }>;
}

/**
 * `?code=` is how the no-JS form submits (native GET) — normalize and
 * redirect to `/v/[code]`, which owns all validation (malformed input
 * renders the `invalid` verdict there, not here). JS-enabled submits skip
 * this round trip entirely via ManualEntryForm's client navigation.
 */
export default async function VerifyPage({ searchParams }: PageProps) {
  const { code, lang } = await searchParams;
  if (code && code.trim()) {
    const target = new URLSearchParams({ src: 'manual' });
    if (lang) target.set('lang', lang);
    redirect(
      `/v/${encodeURIComponent(normalizeCode(code))}?${target.toString()}`,
    );
  }

  const h = await headers();
  const locale = resolveLocale(lang, h.get('accept-language'));

  return (
    <section className="border-border bg-surface p-s8 w-full max-w-md rounded-lg border shadow-lg">
      <LocaleProvider locale={locale}>
        <PageBeacon
          tenantSlug={loadEnv().NEXT_PUBLIC_DEFAULT_TENANT}
          locale={locale}
        />
        <h1 className="text-fg text-center font-sans text-2xl font-semibold">
          {t(locale, 'verify.title')}
        </h1>
        <p className="mt-s2 text-fg-muted text-center text-sm">
          {t(locale, 'verify.subtitle')}
        </p>
        <div className="mt-s6">
          <ManualEntryForm locale={locale} />
        </div>
      </LocaleProvider>
    </section>
  );
}
