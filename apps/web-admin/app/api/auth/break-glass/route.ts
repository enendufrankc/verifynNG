import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

interface BreakGlassBody {
  tenant?: string;
  email?: string;
  password?: string;
  totp?: string;
}

/** BFF wrapper so the httpOnly `vg_refresh` cookie is set the same way every
 * other session-creating flow sets it (see /api/auth/session, /api/auth/sso/complete). */
export async function POST(req: NextRequest) {
  const body: BreakGlassBody = await req.json();
  if (!body.tenant || !body.email || !body.password || !body.totp) {
    return NextResponse.json(
      {
        code: 'BAD_REQUEST',
        message: 'tenant, email, password and totp are required',
      },
      { status: 400 },
    );
  }

  const apiUrl = process.env.API_INTERNAL_URL || 'http://localhost:4000';
  const apiRes = await fetch(
    `${apiUrl}/auth/break-glass/${encodeURIComponent(body.tenant)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: body.email,
        password: body.password,
        totp: body.totp,
      }),
    },
  );

  const data = await apiRes.json().catch(() => ({}));
  if (!apiRes.ok) {
    return NextResponse.json(
      {
        code: data.code ?? 'BREAK_GLASS_FAILED',
        message: data.message ?? 'Emergency access denied',
      },
      { status: apiRes.status },
    );
  }

  // Same as /api/auth/session's login handler: the API's login-shaped
  // responses only carry tokens, not the memberships list the console needs.
  let memberships: unknown[] = [];
  try {
    const meRes = await fetch(`${apiUrl}/auth/me`, {
      headers: { Authorization: `Bearer ${data.accessToken}` },
    });
    if (meRes.ok) {
      const me = await meRes.json();
      memberships = me.memberships ?? [];
    }
  } catch {
    /* tolerate: client can still call /auth/me itself */
  }

  const response = NextResponse.json({
    accessToken: data.accessToken,
    expiresIn: data.expiresIn,
    user: data.user,
    activeTenantId: data.activeTenantId,
    activeRole: data.activeRole,
    memberships,
  });
  response.cookies.set('vg_refresh', data.refreshToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/',
    maxAge: 60 * 60, // matches the 1-hour break-glass session
  });
  return response;
}
