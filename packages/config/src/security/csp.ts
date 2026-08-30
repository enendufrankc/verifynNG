/**
 * CSP builder for the Verify Platform.
 *
 * Generates a Content-Security-Policy header value with nonce-based script-src.
 * Used by both the API (helmet) and Next.js middleware.
 */

export interface CspOptions {
  /** Per-request nonce (base64-encoded random bytes) */
  nonce: string;
  /** Origin of the API server (e.g. http://localhost:4000) */
  apiOrigin: string;
  /** Additional connect-src origins */
  extraConnect?: string[];
  /** If true, emit Content-Security-Policy-Report-Only instead */
  reportOnly?: boolean;
}

/**
 * Build CSP header key-value pair.
 *
 * Directives:
 * - script-src 'nonce-…' 'strict-dynamic'
 * - style-src 'self' 'unsafe-inline'   (Tailwind needs inline styles)
 * - connect-src 'self' <apiOrigin> [extraConnect…]
 * - frame-ancestors 'none'
 * - object-src 'none'
 * - base-uri 'self'
 * - form-action 'self'
 */
export function buildCsp(opts: CspOptions): Record<string, string> {
  const connectSrc = [
    "'self'",
    opts.apiOrigin,
    ...(opts.extraConnect ?? []),
  ].join(' ');

  const directives = [
    `script-src 'nonce-${opts.nonce}' 'strict-dynamic'`,
    `style-src 'self' 'unsafe-inline'`,
    `connect-src ${connectSrc}`,
    `frame-ancestors 'none'`,
    `object-src 'none'`,
    `base-uri 'self'`,
    `form-action 'self'`,
  ].join('; ');

  const headerName = opts.reportOnly
    ? 'Content-Security-Policy-Report-Only'
    : 'Content-Security-Policy';

  return { [headerName]: directives };
}
