import { createHmac, timingSafeEqual } from 'node:crypto';

const STALE_WINDOW_SECONDS = 5 * 60;

export interface VerifyWebhookSignatureOptions {
  /** Reject signatures whose timestamp is more than this many seconds old/skewed. Default 300 (5 min). */
  toleranceSeconds?: number;
  /** Clock override for tests. */
  now?: () => number;
}

/**
 * Verifies a `verifynNG` webhook delivery — see
 * docs/webhooks-consumer-guide.md and the wire format in
 * docs/epics/E16-public-api-webhooks.md. Matches WebhookSigner
 * (apps/api/src/modules/webhooks/webhook-signer.ts) byte for byte:
 * `HMAC-SHA256(secret, "${timestamp}.${rawBody}")`, hex-encoded, prefixed
 * `v1=`. `rawBody` MUST be the exact bytes received on the wire — a
 * re-serialized/parsed-then-stringified body will not match.
 */
export function verifyWebhookSignature(
  secret: string,
  headers: Headers | Record<string, string | string[] | undefined>,
  rawBody: string,
  options: VerifyWebhookSignatureOptions = {},
): boolean {
  const tolerance = options.toleranceSeconds ?? STALE_WINDOW_SECONDS;
  const now = options.now ?? (() => Date.now());

  const timestampHeader = getHeader(headers, 'x-verifyng-timestamp');
  const signatureHeader = getHeader(headers, 'x-verifyng-signature');
  if (!timestampHeader || !signatureHeader) return false;

  const timestamp = Number(timestampHeader);
  if (!Number.isFinite(timestamp)) return false;

  const ageSeconds = Math.abs(now() / 1000 - timestamp);
  if (ageSeconds > tolerance) return false;

  const match = /^v1=([0-9a-f]+)$/.exec(signatureHeader.trim());
  if (!match) return false;
  const providedHex = match[1];

  const expected = createHmac('sha256', secret)
    .update(`${timestamp}.${rawBody}`)
    .digest('hex');

  const providedBuf = Buffer.from(providedHex, 'hex');
  const expectedBuf = Buffer.from(expected, 'hex');
  if (providedBuf.length !== expectedBuf.length) return false;
  return timingSafeEqual(providedBuf, expectedBuf);
}

function getHeader(
  headers: Headers | Record<string, string | string[] | undefined>,
  name: string,
): string | undefined {
  if (headers instanceof Headers) return headers.get(name) ?? undefined;
  const key = Object.keys(headers).find((k) => k.toLowerCase() === name);
  const value = key ? headers[key] : undefined;
  return Array.isArray(value) ? value[0] : value;
}
