import Link from 'next/link';
import { headers } from 'next/headers';
import { resolveLocale, t } from '@/lib/i18n';

export default async function NotFound() {
  const h = await headers();
  const locale = resolveLocale(undefined, h.get('accept-language'));

  return (
    <section className="border-border bg-surface p-s8 w-full max-w-md rounded-lg border text-center shadow-lg">
      <h1 className="text-fg text-xl font-semibold">
        {t(locale, 'notFound.title')}
      </h1>
      <p className="mt-s3 text-fg-muted text-sm">
        {t(locale, 'notFound.subtitle')}
      </p>
      <Link
        href="/verify"
        className="mt-s6 bg-fg text-surface py-s3 block w-full rounded-md text-sm font-semibold transition hover:opacity-90"
      >
        {t(locale, 'notFound.cta')}
      </Link>
    </section>
  );
}
