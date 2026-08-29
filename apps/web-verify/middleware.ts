import { NextResponse, type NextRequest } from 'next/server';
import { buildCsp, SECURITY_HEADERS, loadEnv } from '@verifynng/config';

/**
 * Sets a per-request CSP nonce and the shared security header set on every
 * response. The nonce is also forwarded as `x-nonce` on the request so
 * Server Components can read it (via `headers()`) for `<Script nonce>`.
 */
export function middleware(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString('base64');
  const env = loadEnv();

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nonce', nonce);

  const response = NextResponse.next({ request: { headers: requestHeaders } });

  const cspHeaders = buildCsp({
    nonce,
    apiOrigin: env.NEXT_PUBLIC_API_URL,
    reportOnly: env.CSP_REPORT_ONLY,
  });
  for (const [key, value] of Object.entries(cspHeaders)) {
    response.headers.set(key, value);
  }
  for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
    response.headers.set(key, value);
  }

  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
