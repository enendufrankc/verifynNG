import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

interface SsoCompleteBody {
  code?: string;
}

interface ApiMembership {
  tenantId: string;
  tenantName: string;
  tenantSlug: string;
  role: string;
}

interface ApiUser {
  id: string;
  email: string;
  displayName: string;
  platformRole: string | null;
  mfaEnabled: boolean;
}

interface SsoCompleteApiResponse {
  mfaRequired?: boolean;
  mfaToken?: string;
  accessToken?: string;
  refreshToken?: string;
  expiresIn?: number;
  user?: ApiUser;
  memberships?: ApiMembership[];
  activeTenantId?: string | null;
  activeRole?: string | null;
}

/**
 * BFF exchange for the SSO callback's one-time code, mirroring how
 * `/api/auth/session`'s `login` action handles the equivalent password-login
 * response — the NestJS API never sets `vg_refresh` itself (see the routing
 * note in E20-sso.md's T3 checklist entry), only this route does.
 */
export async function POST(req: NextRequest) {
  const body: SsoCompleteBody = await req.json();
  if (!body.code) {
    return NextResponse.json(
      { code: 'BAD_REQUEST', message: 'code is required' },
      { status: 400 },
    );
  }

  const apiUrl = process.env.API_INTERNAL_URL || 'http://localhost:4000';
  const apiRes = await fetch(`${apiUrl}/auth/sso/complete`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code: body.code }),
  });

  if (!apiRes.ok) {
    const err = await apiRes.json().catch(() => ({}));
    return NextResponse.json(
      {
        code: 'SSO_EXCHANGE_FAILED',
        message: err.message ?? 'Code expired or already used',
      },
      { status: apiRes.status },
    );
  }

  const data: SsoCompleteApiResponse = await apiRes.json();

  if (data.mfaRequired) {
    return NextResponse.json({
      mfaRequired: true,
      mfaToken: data.mfaToken,
    });
  }

  const response = NextResponse.json({
    accessToken: data.accessToken,
    expiresIn: data.expiresIn,
    user: data.user,
    memberships: data.memberships ?? [],
    activeTenantId: data.activeTenantId ?? null,
    activeRole: data.activeRole ?? null,
  });
  response.cookies.set('vg_refresh', data.refreshToken!, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/',
    maxAge: 30 * 24 * 60 * 60,
  });
  return response;
}
