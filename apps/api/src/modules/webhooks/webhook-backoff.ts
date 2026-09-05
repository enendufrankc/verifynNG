/**
 * `min(24h, base × 2^attempts) + equal jitter (50–100% of the capped value)`
 * — see docs/epics/E16-public-api-webhooks.md T10. `attempts` is the number
 * of attempts made so far (the one that just failed), so the delay is for
 * the *next* attempt.
 */
export function computeBackoffMs(
  attempts: number,
  baseMs: number,
  maxMs = 24 * 60 * 60 * 1000,
): number {
  const exponential = baseMs * Math.pow(2, attempts);
  const capped = Math.min(maxMs, exponential);
  const jittered = capped * (0.5 + Math.random() * 0.5);
  return Math.round(jittered);
}
