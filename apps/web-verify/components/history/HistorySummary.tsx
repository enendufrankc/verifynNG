import type { VerifyResponse } from '@/lib/api';

/**
 * Never renders coordinates, IP, or individual later-scan timestamps —
 * only the first-verified date, a count, and country/city chips (T5).
 */
export function HistorySummary({
  history,
}: {
  history: NonNullable<VerifyResponse['history']>;
}) {
  const firstVerified = history.firstVerifiedAt
    ? new Date(history.firstVerifiedAt).toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      })
    : null;

  return (
    <div className="mt-s6 space-y-s3 border-border pt-s6 border-t text-sm">
      {firstVerified && (
        <p className="text-fg-muted">
          First verified{' '}
          <span className="text-fg font-medium">{firstVerified}</span>
        </p>
      )}
      <p className="text-fg-muted">
        Verified{' '}
        <span className="text-fg font-medium">{history.scanCount}</span> time
        {history.scanCount === 1 ? '' : 's'}
      </p>
      {history.distinctRegions.length > 0 && (
        <div className="gap-s2 flex flex-wrap">
          {history.distinctRegions.map((region) => (
            <span
              key={region}
              className="bg-surface-sunken px-s3 py-s1 text-fg-muted rounded-full text-xs font-medium"
            >
              {region}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
