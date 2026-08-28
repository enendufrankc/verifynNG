/**
 * Code generation, parsing, and checksum verification.
 *
 * Format (v2): <tenant>.<tier>.<kid>.<payload>.<checksum>
 * Format (v1/legacy): <tenant>.<tier>.<payload>.<checksum>
 *
 * payload := 4-char batch watermark + 16-char crypto-random (20 chars ≈ 100 bits)
 * checksum := HMAC-SHA256(`${tenant}|${tier}|${kid}|${payload}`, key) → 8 base32 chars
 */

import crypto from 'node:crypto';
import { ALPHABET, encodeBase32, normalizeCode } from './alphabet.js';
import { hmacSha256 } from './keys.js';
import type { KeyRing } from './keys.js';
import { UnknownKeyError } from './errors.js';

export type Tier = 1 | 2;

export interface ParsedCode {
  tenant: string;
  tier: Tier;
  kid: string;
  payload: string;
  checksum: string;
  /** True if this was parsed from the legacy 4-segment format */
  legacy: boolean;
}

/**
 * Generate crypto-random base32 characters of the given length.
 */
function randomBase32(len: number): string {
  const bytes = crypto.randomBytes(len);
  return encodeBase32(bytes);
}

/**
 * Compute the HMAC checksum for a code's components.
 * Returns 8 Crockford base32 characters.
 */
export function computeChecksum(
  ring: KeyRing,
  tenant: string,
  tier: Tier,
  kid: string,
  payload: string,
): string {
  const key = ring.get(kid);
  if (!key) throw new UnknownKeyError(kid);
  const mac = hmacSha256(key, `${tenant}|${tier}|${kid}|${payload}`);
  return encodeBase32(mac.subarray(0, 8));
}

/**
 * Compute the legacy checksum (no kid in HMAC message).
 * Returns 8 Crockford base32 characters.
 */
export function computeLegacyChecksum(
  secret: Uint8Array,
  tenant: string,
  tier: Tier,
  payload: string,
): string {
  const mac = hmacSha256(secret, `${tenant}|${tier}|${payload}`);
  return encodeBase32(mac.subarray(0, 8));
}

/**
 * Constant-time string comparison to prevent timing attacks.
 */
export function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

/**
 * Check if a character is a valid Crockford base32 character.
 */
function isBase32(char: string): boolean {
  return ALPHABET.includes(char as (typeof ALPHABET)[number]);
}

/**
 * Validate that all characters in a string are valid Crockford base32.
 */
function validateBase32(s: string): boolean {
  for (let i = 0; i < s.length; i++) {
    if (!isBase32(s[i])) return false;
  }
  return true;
}

/**
 * Generate a new code in the 5-segment format.
 *
 * @param ring - Key ring providing the signing key
 * @param options - tenant slug, tier, and optional payload length (default 20)
 * @returns The generated code string and the kid used
 */
export function generateCode(
  ring: KeyRing,
  {
    tenant,
    tier,
    payloadLength = 20,
  }: { tenant: string; tier: Tier; payloadLength?: number },
): { code: string; kid: string } {
  const { kid } = ring.active();
  const t = tenant.toLowerCase();
  const payload = randomBase32(payloadLength);
  const checksum = computeChecksum(ring, t, tier, kid, payload);
  const code = `${t}.${tier}.${kid}.${payload}.${checksum}`;
  return { code, kid };
}

/**
 * Parse a code string into its components.
 * Accepts both 5-segment (v2) and 4-segment (legacy) formats.
 * Never throws — returns null for malformed codes.
 */
export function parseCode(code: string): ParsedCode | null {
  const normalized = normalizeCode(code);
  const parts = normalized.split('.');

  // Try 5-segment (v2) format first
  if (parts.length === 5) {
    const [tenantRaw, tierStr, kid, payload, checksum] = parts;
    const tenant = tenantRaw.toLowerCase();
    const tier = tierStr === '1' ? 1 : tierStr === '2' ? 2 : null;
    if (
      !tenant ||
      tier === null ||
      !kid ||
      payload.length < 4 ||
      checksum.length !== 8
    ) {
      return null;
    }
    if (!validateBase32(payload + checksum)) return null;
    return {
      tenant,
      tier,
      kid: kid.toLowerCase(),
      payload,
      checksum,
      legacy: false,
    };
  }

  // Try 4-segment (legacy) format
  if (parts.length === 4) {
    const [tenantRaw, tierStr, payload, checksum] = parts;
    const tenant = tenantRaw.toLowerCase();
    const tier = tierStr === '1' ? 1 : tierStr === '2' ? 2 : null;
    if (
      !tenant ||
      tier === null ||
      payload.length < 12 ||
      checksum.length !== 8
    ) {
      return null;
    }
    if (!validateBase32(payload + checksum)) return null;
    return { tenant, tier, kid: 'legacy', payload, checksum, legacy: true };
  }

  return null;
}

/**
 * Verify a code's checksum against the key ring.
 *
 * For v2 codes, looks up the key by kid.
 * For legacy codes, uses the key with kid "legacy".
 */
export function verifyChecksum(
  ring: KeyRing,
  code: string,
): { ok: true; parsed: ParsedCode } | { ok: false; reason: string } {
  const parsed = parseCode(code);
  if (!parsed) {
    return { ok: false, reason: 'malformed code' };
  }

  const key = ring.get(parsed.kid);
  if (!key) {
    return { ok: false, reason: `unknown key id: ${parsed.kid}` };
  }

  let expected: string;
  if (parsed.legacy) {
    expected = computeLegacyChecksum(
      key,
      parsed.tenant,
      parsed.tier,
      parsed.payload,
    );
  } else {
    expected = computeChecksum(
      ring,
      parsed.tenant,
      parsed.tier,
      parsed.kid,
      parsed.payload,
    );
  }

  if (!constantTimeEqual(parsed.checksum, expected)) {
    return { ok: false, reason: 'checksum mismatch' };
  }

  return { ok: true, parsed };
}

/**
 * Redact a code for display in responses and logs.
 * Shows first 4 chars of payload then "…".
 * Example: "ivoryglow.2.k1.ABCD…"
 */
export function redactCode(code: string): string {
  const parsed = parseCode(code);
  if (!parsed) return '***';
  const payloadPreview = parsed.payload.slice(0, 4);
  if (parsed.legacy) {
    return `${parsed.tenant}.${parsed.tier}.${payloadPreview}…`;
  }
  return `${parsed.tenant}.${parsed.tier}.${parsed.kid}.${payloadPreview}…`;
}
