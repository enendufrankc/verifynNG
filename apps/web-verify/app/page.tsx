import Link from 'next/link';
import { headers } from 'next/headers';
import { resolveLocale, t } from '@/lib/i18n';

export default async function Home() {
  const h = await headers();
  const locale = resolveLocale(undefined, h.get('accept-language'));

  return (
    <section className="border-border bg-surface p-s8 w-full max-w-md rounded-lg border text-center shadow-lg">
      <h1 className="text-fg font-sans text-2xl font-semibold">
        {t(locale, 'home.title')}
      </h1>
      <p className="mt-s3 text-fg-muted text-sm">
        {t(locale, 'home.subtitle')}
      </p>
      <Link
        href="/verify"
        className="mt-s6 bg-brand py-s3 text-brand-ink block w-full rounded-md text-sm font-semibold transition hover:opacity-90"
      >
        {t(locale, 'home.cta')}
      </Link>
    </section>
  );
}
