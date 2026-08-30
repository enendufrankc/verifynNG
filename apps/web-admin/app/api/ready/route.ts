import { NextResponse } from 'next/server';

export async function GET() {
  const apiHostUrl = process.env.API_INTERNAL_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
  let apiReady = false;
  let apiDetails = null;

  try {
    const res = await fetch(`${apiHostUrl}/ready`, {
      signal: AbortSignal.timeout(3000),
    });
    apiReady = res.ok;
    apiDetails = await res.json().catch(() => null);
  } catch {
    apiReady = false;
  }

  const buildId = process.env.BUILD_ID || 'dev';
  const status = apiReady ? 200 : 503;

  return NextResponse.json(
    {
      status: apiReady ? 'ready' : 'degraded',
      service: 'web-admin',
      buildId,
      api: { ready: apiReady, details: apiDetails },
    },
    { status },
  );
}
