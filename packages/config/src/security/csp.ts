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
  /**
   * Optional `default-src` origins (E09: consumer surface locks this down
   * to 'self' explicitly rather than relying on the browser's no-default-src
   * fallback). Omitted by existing callers to avoid changing their policy.
   */
  defaultSrc?: string[];
  /** Optional extra `img-src` origins beyond 'self' (E09: MinIO-hosted logos/OG images). */
  imgSrc?: string[];
}

/**
 * Build CSP header key-value pair.
 *
 * Directives:
 * - default-src 'self'                 (only when `defaultSrc` is passed)
 * - script-src 'nonce-…' 'strict-dynamic'
 * - style-src 'self' 'unsafe-inline'   (Tailwind needs inline styles)
 * - img-src 'self' data: [imgSrc…]     (only when `imgSrc` is passed)
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
    ...(opts.defaultSrc ? [`default-src ${opts.defaultSrc.join(' ')}`] : []),
    `script-src 'nonce-${opts.nonce}' 'strict-dynamic'`,
    `style-src 'self' 'unsafe-inline'`,
    ...(opts.imgSrc ? [`img-src 'self' data: ${opts.imgSrc.join(' ')}`] : []),
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
