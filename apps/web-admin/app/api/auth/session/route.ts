import { NextRequest, NextResponse } from 'next/server';
import {
  createStubSession,
  validateStubRefresh,
  findUserByEmail,
  findUserById,
} from '@/lib/api-stubs';

export const dynamic = 'force-dynamic';

interface SessionRequestBody {
  action?: 'login' | 'mfa' | 'refresh' | 'switch-tenant';
  email?: string;
  password?: string;
  mfaToken?: string;
  tenantId?: string;
}

interface LoginApiResponse {
  accessToken: string;
  expiresIn: number;
  refreshToken: string;
  mfaRequired?: boolean;
  mfaToken?: string;
}

interface RefreshApiResponse {
  accessToken: string;
  expiresIn: number;
  refreshToken: string;
}

export async function POST(req: NextRequest) {
  const body: SessionRequestBody = await req.json();

  // ── Login ─────────────────────────────────────────────────
  if (body.action === 'login' || body.email) {
    const { email, password } = body;
    if (!email || !password)
      return NextResponse.json(
        { code: 'BAD_REQUEST', message: 'Email and password are required' },
        { status: 400 },
      );
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
    try {
      const apiRes = await fetch(`${apiUrl}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      if (apiRes.ok) {
        const data: LoginApiResponse = await apiRes.json();
        if (data.mfaRequired)
          return NextResponse.json({
            mfaRequired: true,
            mfaToken: data.mfaToken,
          });
        // E02's login returns tokens only; the principal, memberships and active tenant
        // come from /auth/me. Without this the console has no tenant context (Team,
        // Settings render empty) — found by browser E2E on 2026-08-30.
        let me: {
          user?: unknown;
          activeTenantId?: string | null;
          memberships?: Array<{
            tenantId: string;
            role: string;
            tenant?: unknown;
          }>;
        } = {};
        try {
          const meRes = await fetch(`${apiUrl}/auth/me`, {
            headers: { Authorization: `Bearer ${data.accessToken}` },
          });
          if (meRes.ok) me = await meRes.json();
        } catch {
          /* tolerate: client can still call /auth/me itself */
        }
        const active =
          me.memberships?.find((m) => m.tenantId === me.activeTenantId) ??
          me.memberships?.[0];
        const response = NextResponse.json({
          accessToken: data.accessToken,
          expiresIn: data.expiresIn,
          user: me.user,
          memberships: me.memberships ?? [],
          activeTenantId: active?.tenantId ?? me.activeTenantId ?? null,
          activeRole: active?.role ?? null,
        });
        response.cookies.set('vg_refresh', data.refreshToken, {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'strict',
          path: '/',
          maxAge: 30 * 24 * 60 * 60,
        });
        return response;
      }
    } catch {
      /* fall through to stubs */
    }

    // Stub login
    const user = findUserByEmail(email);
    if (!user || user.password !== password)
      return NextResponse.json(
        { code: 'INVALID_CREDENTIALS', message: 'Invalid email or password' },
        { status: 401 },
      );
    const session = createStubSession(user.id);
    const response = NextResponse.json({
      accessToken: session.accessToken,
      expiresIn: 900,
      user: {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        platformRole: user.platformRole,
        mfaEnabled: user.mfaEnabled,
      },
      memberships: user.memberships,
      activeTenantId: user.memberships[0]?.tenantId,
      activeRole: user.memberships[0]?.role,
    });
    response.cookies.set('vg_refresh', session.refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/',
      maxAge: 30 * 24 * 60 * 60,
    });
    return response;
  }

  // ── MFA challenge ──────────────────────────────────────────
  if (body.action === 'mfa' || body.mfaToken) {
    return NextResponse.json(
      { code: 'NOT_IMPLEMENTED', message: 'MFA not yet available' },
      { status: 501 },
    );
  }

  // ── Refresh ───────────────────────────────────────────────
  if (body.action === 'refresh') {
    const refreshToken = req.cookies.get('vg_refresh')?.value;
    if (!refreshToken)
      return NextResponse.json(
        { code: 'NO_REFRESH_TOKEN', message: 'No refresh token' },
        { status: 401 },
      );
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
    try {
      const apiRes = await fetch(`${apiUrl}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      });
      if (apiRes.ok) {
        const data: RefreshApiResponse = await apiRes.json();
        // Same as login: repopulate principal/tenant context from /auth/me so a page
        // reload doesn't leave the console without a tenant.
        let me: {
          user?: unknown;
          activeTenantId?: string | null;
          memberships?: Array<{
            tenantId: string;
            role: string;
            tenant?: unknown;
          }>;
        } = {};
        try {
          const meRes = await fetch(`${apiUrl}/auth/me`, {
            headers: { Authorization: `Bearer ${data.accessToken}` },
          });
          if (meRes.ok) me = await meRes.json();
        } catch {
          /* tolerate */
        }
        const active =
          me.memberships?.find((m) => m.tenantId === me.activeTenantId) ??
          me.memberships?.[0];
        const response = NextResponse.json({
          accessToken: data.accessToken,
          expiresIn: data.expiresIn,
          user: me.user,
          memberships: me.memberships ?? [],
          activeTenantId: active?.tenantId ?? me.activeTenantId ?? null,
          activeRole: active?.role ?? null,
        });
        response.cookies.set('vg_refresh', data.refreshToken, {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'strict',
          path: '/',
          maxAge: 30 * 24 * 60 * 60,
        });
        return response;
      }
    } catch {
      /* fall through to stubs */
    }
    const session = validateStubRefresh(refreshToken);
    if (!session) {
      const response = NextResponse.json(
        {
          code: 'INVALID_REFRESH_TOKEN',
          message: 'Refresh token invalid',
        },
        { status: 401 },
      );
      response.cookies.delete('vg_refresh');
      return response;
    }
    const newSession = createStubSession(session.userId);
    // Look up the stub user so a page reload repopulates the auth store.
    const user = findUserById(session.userId);
    const response = NextResponse.json({
      accessToken: newSession.accessToken,
      expiresIn: 900,
      ...(user
        ? {
            user: {
              id: user.id,
              email: user.email,
              displayName: user.displayName,
              platformRole: user.platformRole,
              mfaEnabled: user.mfaEnabled,
            },
            memberships: user.memberships,
            activeTenantId: user.memberships[0]?.tenantId,
            activeRole: user.memberships[0]?.role,
          }
        : {}),
    });
    response.cookies.set('vg_refresh', newSession.refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/',
      maxAge: 30 * 24 * 60 * 60,
    });
    return response;
  }

  // ── Switch tenant ─────────────────────────────────────────
  if (body.action === 'switch-tenant' && body.tenantId) {
    const refreshToken = req.cookies.get('vg_refresh')?.value;
    const currentSession = refreshToken
      ? validateStubRefresh(refreshToken)
      : null;
    const user = currentSession
      ? findUserById(currentSession.userId)
      : undefined;
    const membership = user?.memberships.find(
      (m) => m.tenantId === body.tenantId,
    );
    if (!user || !membership)
      return NextResponse.json(
        { code: 'FORBIDDEN', message: 'Not a member of that tenant' },
        { status: 403 },
      );
    const session = createStubSession(user.id);
    const response = NextResponse.json({
      accessToken: session.accessToken,
      expiresIn: 900,
      activeTenantId: membership.tenantId,
      activeRole: membership.role,
    });
    response.cookies.set('vg_refresh', session.refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/',
      maxAge: 30 * 24 * 60 * 60,
    });
    return response;
  }

  return NextResponse.json(
    { code: 'BAD_REQUEST', message: 'Unknown action' },
    { status: 400 },
  );
}
