/**
 * Manifest canonicalisation, signing, verification, and receipt hashing.
 *
 * Canonicalisation uses RFC 8785-style stable JSON (sorted keys, no whitespace).
 * Signing uses HMAC-SHA256 with the active key.
 * Receipt hash is SHA-256 of sorted concatenated code hashes (order-independent).
 */

import crypto from 'node:crypto';
import { hmacSha256 } from './keys.js';
import type { KeyRing } from './keys.js';
import { hashForStorage } from './hash.js';

export interface SignedManifest {
  /** The original manifest object with signature fields added */
  [key: string]: unknown;
  kid: string;
  alg: 'HS256';
  signature: string;
}

/**
 * Canonicalise an object to stable JSON (RFC 8785-style).
 * Keys are sorted recursively. No whitespace.
 */
export function canonicalize(obj: unknown): string {
  return JSON.stringify(obj, (_, value) => {
    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      // Sort keys for deterministic output
      const sorted: Record<string, unknown> = {};
      for (const key of Object.keys(value).sort()) {
        sorted[key] = value[key];
      }
      return sorted;
    }
    return value;
  });
}

/**
 * Sign a manifest object using the active key from the ring.
 * Returns a new object with kid, alg, and signature fields added.
 */
export function signManifest(
  ring: KeyRing,
  manifest: Record<string, unknown>,
): SignedManifest {
  const { kid, secret } = ring.active();
  // Remove any existing signature fields before computing
  const { kid: _k, alg: _a, signature: _s, ...clean } = manifest;
  void _k;
  void _a;
  void _s;
  const canonical = canonicalize(clean);
  const mac = hmacSha256(secret, canonical);
  const signature = mac.toString('hex');

  return {
    ...clean,
    kid,
    alg: 'HS256',
    signature,
  };
}

/**
 * Verify a signed manifest's signature against the key ring.
 * Returns true if the signature is valid, false otherwise.
 * Uses constant-time comparison.
 */
export function verifyManifest(ring: KeyRing, signed: SignedManifest): boolean {
  const { kid, signature } = signed;
  const key = ring.get(kid);
  if (!key) return false;

  // Reconstruct the unsigned payload by removing signature fields
  const { kid: _k, alg: _a, signature: _s, ...payload } = signed;
  void _k;
  void _a;
  void _s;
  const canonical = canonicalize(payload);
  const expected = hmacSha256(key, canonical).toString('hex');

  // Constant-time comparison
  if (signature.length !== expected.length) return false;
  let result = 0;
  for (let i = 0; i < signature.length; i++) {
    result |= signature.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return result === 0;
}

/**
 * Compute a receipt hash from a list of printed codes.
 * Order-independent: hashes each code, sorts the hashes, then SHA-256 of the concatenation.
 */
export function receiptHash(printedCodes: string[]): string {
  const hashes = printedCodes.map(hashForStorage).sort();
  return crypto.createHash('sha256').update(hashes.join('')).digest('hex');
}
