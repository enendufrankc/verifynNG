import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const refreshToken = req.cookies.get('vg_refresh')?.value;
  const apiUrl =
    process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
  try {
    await fetch(`${apiUrl}/auth/logout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    });
  } catch {
    /* stub */
  }
  const response = NextResponse.json({ ok: true });
  response.cookies.delete('vg_refresh');
  return response;
}
