import { NextResponse, type NextRequest } from 'next/server';
import { buildCsp, SECURITY_HEADERS, loadEnv } from '@verifynng/config';

const PUBLIC_PATHS = [
  '/login',
  '/login/mfa',
  '/forgot-password',
  '/reset-password',
  '/set-password',
  '/api/auth',
  '/api/health',
];

/**
 * E11 auth gate + E13 security headers. Every response (including the login
 * redirect) carries the per-request CSP nonce and the shared header set; the
 * nonce is forwarded as `x-nonce` so Server Components can read it.
 */
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const nonce = Buffer.from(crypto.randomUUID()).toString('base64');
  const env = loadEnv();

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nonce', nonce);

  let response: NextResponse;
  const isPublic =
    PUBLIC_PATHS.some((p) => pathname.startsWith(p)) ||
    pathname.startsWith('/_next') ||
    pathname.startsWith('/favicon');
  if (!isPublic && !request.cookies.has('vg_refresh')) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('next', pathname);
    response = NextResponse.redirect(loginUrl);
  } else {
    response = NextResponse.next({ request: { headers: requestHeaders } });
  }

  const cspHeaders = buildCsp({
    nonce,
    apiOrigin: env.NEXT_PUBLIC_API_URL,
    reportOnly: env.CSP_REPORT_ONLY,
  });
  for (const [key, value] of Object.entries(cspHeaders)) response.headers.set(key, value);
  for (const [key, value] of Object.entries(SECURITY_HEADERS)) response.headers.set(key, value);
  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
