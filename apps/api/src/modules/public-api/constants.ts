/** Date-based API version — see docs/public-api-deprecation-policy.md (T8). */
export const PUBLIC_API_VERSION = '2026-09-01';

/** QuotaService kind registered in main.ts; sub-partitioned per key via `opts.key`. */
export const PUBLIC_API_QUOTA_KIND = 'public_api_per_min';

/** Redis TTL for a completed idempotency record. */
export const IDEMPOTENCY_TTL_SECONDS = 24 * 60 * 60;

/** Redis TTL for the in-flight lock — long enough for any real request to finish. */
export const IDEMPOTENCY_LOCK_TTL_SECONDS = 30;
