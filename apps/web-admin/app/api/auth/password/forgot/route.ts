import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

// Stub forgot-password — always returns 202 (no user enumeration).
// When E02 ships, proxy to POST /auth/password/forgot.
export async function POST(_req: NextRequest) {
  return NextResponse.json({ ok: true }, { status: 202 });
}
