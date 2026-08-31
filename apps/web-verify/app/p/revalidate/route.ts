import { NextResponse } from 'next/server';
import { revalidatePath, revalidateTag } from 'next/cache';
import { loadEnv } from '@verifynng/config';
import { verifyRevalidateSignature } from '@/lib/product-page/revalidate-signature';

export const dynamic = 'force-dynamic';

interface RevalidateBody {
  tenantSlug: string;
  productSlug: string;
  ts: number;
  sig: string;
  tenantId?: string;
  productId?: string;
}

function isRevalidateBody(value: unknown): value is RevalidateBody {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.tenantSlug === 'string' &&
    typeof v.productSlug === 'string' &&
    typeof v.ts === 'number' &&
    typeof v.sig === 'string'
  );
}

/**
 * E10's revalidate-on-publish webhook (T5) — the API calls this after every
 * publish/rollback so the change is live within seconds, not the 300s ISR
 * fallback (AC4/AC5).
 */
export async function POST(request: Request) {
  const body: unknown = await request.json().catch(() => null);
  if (!isRevalidateBody(body)) {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
  }

  const env = loadEnv();
  if (!verifyRevalidateSignature(body, env.PAGE_REVALIDATE_SECRET)) {
    return NextResponse.json({ error: 'invalid_signature' }, { status: 401 });
  }

  revalidatePath(`/p/${body.tenantSlug}/${body.productSlug}`);
  if (body.tenantId && body.productId) {
    revalidateTag(`tier1:${body.tenantId}:${body.productId}`);
  }

  return NextResponse.json({ revalidated: true });
}
