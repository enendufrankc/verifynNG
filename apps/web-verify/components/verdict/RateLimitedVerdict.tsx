import { Clock } from 'lucide-react';
import { VerdictFrame } from './VerdictFrame';
import type { VerdictComponentProps } from './types';

/** `rate-limited` — too many attempts; never a false verdict, just a wait. */
export function RateLimitedVerdict({ data }: VerdictComponentProps) {
  const retryMessage = data.retryAfterSec
    ? `Too many attempts — try again in ${data.retryAfterSec} second${data.retryAfterSec === 1 ? '' : 's'}.`
    : data.message;

  return (
    <VerdictFrame
      tone="util"
      icon={<Clock className="h-8 w-8" strokeWidth={2.5} />}
      title="Too many checks"
      message={retryMessage}
      tier={data.tier}
    />
  );
}
