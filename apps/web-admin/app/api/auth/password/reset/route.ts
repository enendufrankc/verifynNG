import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

// Stub reset-password. When E02 ships, proxy to POST /auth/password/reset.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  if (!body?.token || !body?.newPassword) {
    return NextResponse.json(
      { code: 'BAD_REQUEST', message: 'token and newPassword required' },
      { status: 400 },
    );
  }
  return NextResponse.json({ ok: true });
}
