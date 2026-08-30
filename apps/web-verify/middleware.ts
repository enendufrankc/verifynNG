import { NextResponse, type NextRequest } from 'next/server';
import { buildCsp, SECURITY_HEADERS, loadEnv } from '@verifynng/config';

/**
 * E09's security headers, layered on top of E13's shared set:
 * - `Referrer-Policy: no-referrer` (stricter than the shared default —
 *   this is the consumer surface, a code should never leak via Referer).
 * - `Permissions-Policy` re-allows `camera=(self)` for the QR scanner (T9);
 *   the shared default denies it entirely.
 * - HSTS, since this is the public-facing app.
 * - `Cache-Control: private, no-store` on `/v/**` — a verdict is never
 *   cached (T3/AC9).
 * - `X-Frame-Options: DENY` everywhere except `/p/**` (E10 embeds product
 *   pages in its page-builder preview).
 */
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const nonce = Buffer.from(crypto.randomUUID()).toString('base64');
  const env = loadEnv();

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nonce', nonce);

  const response = NextResponse.next({ request: { headers: requestHeaders } });

  const cspHeaders = buildCsp({
    nonce,
    apiOrigin: env.NEXT_PUBLIC_API_URL,
    reportOnly: env.CSP_REPORT_ONLY,
    defaultSrc: ["'self'"],
    imgSrc: [env.NEXT_PUBLIC_MINIO_PUBLIC_URL],
  });
  for (const [key, value] of Object.entries(cspHeaders)) {
    response.headers.set(key, value);
  }
  for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
    response.headers.set(key, value);
  }

  response.headers.set('Referrer-Policy', 'no-referrer');
  response.headers.set(
    'Strict-Transport-Security',
    'max-age=63072000; includeSubDomains',
  );
  response.headers.set(
    'Permissions-Policy',
    'camera=(self), microphone=(), geolocation=(), payment=()',
  );

  if (pathname.startsWith('/p/')) {
    // E10 embeds product pages in its page-builder preview iframe.
    response.headers.delete('X-Frame-Options');
  }

  if (pathname.startsWith('/v/')) {
    response.headers.set('Cache-Control', 'private, no-store');
  }

  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
