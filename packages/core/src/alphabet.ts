/**
 * Crockford base32 alphabet and encode/decode.
 *
 * Alphabet: 0-9 A-V (excludes I, L, O, U to avoid transcription errors).
 * Normalization accepts lowercase, hyphens, spaces, and maps I→1, L→1, O→0
 * in base32 segments only (not in the tenant slug).
 */

export const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ' as const;

const DECODE_MAP: Record<string, number> = {};
for (let i = 0; i < ALPHABET.length; i++) {
  DECODE_MAP[ALPHABET[i]] = i;
}

/**
 * Encode a Uint8Array to Crockford base32 string.
 * Each byte maps to one base32 character (byte % 32).
 * This matches the legacy system's approach and provides ~5 bits per char.
 */
export function encodeBase32(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i++) {
    out += ALPHABET[bytes[i] % 32];
  }
  return out;
}

/**
 * Decode a Crockford base32 string to Uint8Array.
 * Returns null if the string contains invalid characters.
 */
export function decodeBase32(str: string): Uint8Array | null {
  const bytes = new Uint8Array(str.length);
  for (let i = 0; i < str.length; i++) {
    const val = DECODE_MAP[str[i]];
    if (val === undefined) return null;
    bytes[i] = val;
  }
  return bytes;
}

/**
 * Apply Crockford base32 substitutions: I→1, L→1, O→0.
 */
function crockfordSubstitute(s: string): string {
  return s.replace(/[IL]/g, '1').replace(/O/g, '0');
}

/**
 * Normalize a code string for parsing:
 * - Trim whitespace
 * - Uppercase
 * - Remove hyphens and spaces (human transcription separators)
 * - Map I→1, L→1, O→0 in base32 segments only (not in tenant slug)
 *
 * If the string contains dots (indicating a full code), Crockford substitution
 * is applied only to the segments after the tenant (kid, payload, checksum).
 * If no dots are present, substitution is applied to the entire string.
 */
export function normalizeCode(input: string): string {
  const trimmed = input.trim().toUpperCase().replace(/[-\s]/g, '');
  // Check if this looks like a full code (contains dots)
  const dotIndex = trimmed.indexOf('.');
  if (dotIndex === -1) {
    // No dots — treat entire string as base32 (e.g., a payload or checksum alone)
    return crockfordSubstitute(trimmed);
  }
  // Has dots — only apply Crockford substitution to base32 segments
  // Segments: tenant | tier | [kid] | payload | checksum
  // Tenant is NOT base32; tier is just "1" or "2"; kid/payload/checksum are base32
  const tenant = trimmed.slice(0, dotIndex);
  const rest = trimmed.slice(dotIndex + 1);
  // Apply Crockford substitution to everything after the tenant
  return tenant + '.' + crockfordSubstitute(rest);
}
