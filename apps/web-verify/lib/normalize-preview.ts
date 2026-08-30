/**
 * Client-safe mirror of @verifynng/core's `normalizeCode` (alphabet.ts).
 * Not imported directly: `code.ts` (re-exported from the package's single
 * entrypoint) pulls in `node:crypto` for `generateCode`, so importing
 * `@verifynng/core` from a `'use client'` component would drag that into
 * the browser bundle — same reason web-admin's `lib/redact-code.ts`
 * reimplements redaction locally instead of importing the package.
 * lib/api.test.ts's `redact.test.ts` equivalent guard: verdict.test.ts
 * doesn't cover this file, so normalize-preview.test.ts asserts parity
 * against the real function directly.
 */
function crockfordSubstitute(s: string): string {
  return s.replace(/[IL]/g, '1').replace(/O/g, '0');
}

export function normalizeCodePreview(input: string): string {
  const trimmed = input.trim().toUpperCase().replace(/[-\s]/g, '');
  const dotIndex = trimmed.indexOf('.');
  if (dotIndex === -1) return crockfordSubstitute(trimmed);
  const tenant = trimmed.slice(0, dotIndex);
  const rest = trimmed.slice(dotIndex + 1);
  return tenant + '.' + crockfordSubstitute(rest);
}

/**
 * Format-only shape check (segment count, non-empty) — never a checksum
 * check, which needs the signing key and can only happen server-side.
 * Used purely for an inline "doesn't look right" hint; the real validation
 * is `/v/[code]`'s server-side `parseCode`/`verifyChecksum`.
 */
export function looksWellFormed(normalized: string): boolean {
  const parts = normalized.split('.');
  if (parts.length !== 4 && parts.length !== 5) return false;
  return parts.every((part) => part.length > 0);
}
