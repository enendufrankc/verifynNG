import { WifiOff } from 'lucide-react';
import { VerdictFrame } from './VerdictFrame';

/**
 * Client-side-only state — E06 was unreachable or timed out (never a
 * server verdict; see AC6). Always paired with a Retry link that
 * re-requests the same `/v/[code]` route.
 */
export function ErrorVerdict({ retryHref }: { retryHref: string }) {
  return (
    <VerdictFrame
      tone="util"
      icon={<WifiOff className="h-8 w-8" strokeWidth={2.5} />}
      title="Could not check"
      message="We couldn't reach the verification service. Check your connection and try again."
    >
      <a
        href={retryHref}
        className="mt-s6 bg-fg py-s3 text-surface block w-full rounded-md text-center text-sm font-semibold transition hover:opacity-90"
      >
        Retry
      </a>
    </VerdictFrame>
  );
}
