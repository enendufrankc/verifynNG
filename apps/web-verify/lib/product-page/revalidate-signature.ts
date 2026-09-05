import { createHmac, timingSafeEqual } from 'node:crypto';

// Wide enough to absorb clock drift and network latency between the API
// container and this app, tight enough that a captured request can't be
// replayed hours later.
export const REVALIDATE_REPLAY_WINDOW_MS = 60_000;

export interface RevalidateSignaturePayload {
  tenantSlug: string;
  productSlug: string;
  ts: number;
  sig: string;
}

export function verifyRevalidateSignature(
  payload: RevalidateSignaturePayload,
  secret: string,
  now: number = Date.now(),
): boolean {
  if (
    !Number.isFinite(payload.ts) ||
    Math.abs(now - payload.ts) > REVALIDATE_REPLAY_WINDOW_MS
  ) {
    return false;
  }

  const signed = `${payload.tenantSlug}.${payload.productSlug}.${payload.ts}`;
  const expected = Buffer.from(
    createHmac('sha256', secret).update(signed).digest('hex'),
    'hex',
  );
  const actual = Buffer.from(payload.sig, 'hex');
  if (expected.length !== actual.length) return false;
  return timingSafeEqual(expected, actual);
}
