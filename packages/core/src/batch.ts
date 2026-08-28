/**
 * Batch watermarking — cryptographic attribution of code clusters to batches.
 *
 * The first 4 characters of a code's payload are the batch watermark,
 * derived from HMAC-SHA256(tenant|batchId, key) → 4 base32 chars.
 * The remaining 16 characters are crypto-random (≈80 bits entropy).
 *
 * Total payload: 4 watermark + 16 random = 20 chars ≈ 100 bits.
 * Entropy budget: 80 bits random + HMAC checksum on the full code.
 * A leaked cluster of codes is attributable to a batch without a DB lookup.
 */

import { encodeBase32 } from './alphabet.js';
import { hmacSha256 } from './keys.js';
import type { KeyRing } from './keys.js';

/**
 * Derive a 4-character batch watermark from the key ring.
 * This is embedded in the payload of every code in the batch.
 */
export function deriveBatchWatermark(
  ring: KeyRing,
  { tenant, batchId }: { tenant: string; batchId: string },
): string {
  const { kid, secret } = ring.active();
  // We include kid in the HMAC message so watermarks are key-version-specific
  const mac = hmacSha256(secret, `watermark|${tenant}|${kid}|${batchId}`);
  return encodeBase32(mac.subarray(0, 4));
}

/**
 * Extract the watermark (first 4 chars) from a parsed code's payload.
 */
export function watermarkOf(parsed: { payload: string }): string {
  return parsed.payload.slice(0, 4);
}
