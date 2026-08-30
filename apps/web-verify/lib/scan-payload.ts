/**
 * Extracts a code from a decoded QR payload: either a `/v/<code>` URL (any
 * host — the scanner doesn't gatekeep on host, only shape; `/v/[code]`
 * itself is the source of truth for validity) or a bare code string.
 * Never throws; returns null for anything else.
 */
export function extractCodeFromPayload(payload: string): string | null {
  const trimmed = payload.trim();
  if (!trimmed) return null;

  const urlMatch = trimmed.match(/\/v\/([^/?#]+)/);
  if (urlMatch) {
    try {
      return decodeURIComponent(urlMatch[1]);
    } catch {
      return null;
    }
  }

  // Bare code: tenant.tier[.kid].payload.checksum — Crockford base32 plus
  // dots only, at least one dot (never a bare word with no structure).
  if (/^[A-Za-z0-9.]+$/.test(trimmed) && trimmed.includes('.')) {
    return trimmed;
  }

  return null;
}
