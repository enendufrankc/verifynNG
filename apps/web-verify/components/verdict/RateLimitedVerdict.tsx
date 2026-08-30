import { Clock } from 'lucide-react';
import { VerdictFrame } from './VerdictFrame';
import { t } from '@/lib/i18n';
import type { VerdictComponentProps } from './types';

/** `rate-limited` — too many attempts; never a false verdict, just a wait. */
export function RateLimitedVerdict({ data, locale }: VerdictComponentProps) {
  const retryMessage = data.retryAfterSec
    ? t(locale, 'verdict.rateLimited.retry', {
        seconds: data.retryAfterSec,
        plural: data.retryAfterSec === 1 ? '' : 's',
      })
    : data.message;

  return (
    <VerdictFrame
      tone="util"
      icon={<Clock className="h-8 w-8" strokeWidth={2.5} />}
      title={t(locale, 'verdict.rate-limited.title')}
      message={retryMessage}
      tier={data.tier}
      locale={locale}
    />
  );
}
