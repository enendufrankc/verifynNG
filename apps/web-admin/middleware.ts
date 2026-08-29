import { NextRequest, NextResponse } from 'next/server';

const PUBLIC_PATHS = [
  '/login',
  '/mfa',
  '/forgot-password',
  '/reset-password',
  '/set-password',
  '/api/auth',
  '/api/health',
];

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p)))
    return NextResponse.next();
  if (pathname.startsWith('/_next') || pathname.startsWith('/favicon'))
    return NextResponse.next();
  if (!req.cookies.has('vg_refresh')) {
    const loginUrl = new URL('/login', req.url);
    loginUrl.searchParams.set('next', pathname);
    return NextResponse.redirect(loginUrl);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
