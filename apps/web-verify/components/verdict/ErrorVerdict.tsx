import { WifiOff } from 'lucide-react';
import { VerdictFrame } from './VerdictFrame';
import { t, type Locale } from '@/lib/i18n';

/**
 * Client-side-only state — E06 was unreachable or timed out (never a
 * server verdict; see AC6). Always paired with a Retry link that
 * re-requests the same `/v/[code]` route.
 */
export function ErrorVerdict({
  retryHref,
  locale,
}: {
  retryHref: string;
  locale: Locale;
}) {
  return (
    <VerdictFrame
      tone="util"
      icon={<WifiOff className="h-8 w-8" strokeWidth={2.5} />}
      title={t(locale, 'verdict.error.title')}
      message={t(locale, 'verdict.error.message')}
      locale={locale}
    >
      <a
        href={retryHref}
        className="mt-s6 bg-fg py-s3 text-surface block w-full rounded-md text-center text-sm font-semibold transition hover:opacity-90"
      >
        {t(locale, 'verdict.error.retry')}
      </a>
    </VerdictFrame>
  );
}
