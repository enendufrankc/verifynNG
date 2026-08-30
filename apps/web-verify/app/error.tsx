'use client';

import { useLocale, t } from '@/lib/i18n';

export default function Error({ reset }: { error: Error; reset: () => void }) {
  const locale = useLocale();

  return (
    <section className="border-border bg-surface p-s8 w-full max-w-md rounded-lg border text-center shadow-lg">
      <h1 className="text-fg text-xl font-semibold">
        {t(locale, 'error.title')}
      </h1>
      <p className="mt-s3 text-fg-muted text-sm">
        {t(locale, 'error.subtitle')}
      </p>
      <button
        onClick={reset}
        className="mt-s6 bg-fg text-surface py-s3 w-full rounded-md text-sm font-semibold transition hover:opacity-90"
      >
        {t(locale, 'error.retry')}
      </button>
    </section>
  );
}
