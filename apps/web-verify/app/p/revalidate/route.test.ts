import { createHmac } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const revalidatePath = vi.fn();
const revalidateTag = vi.fn();
vi.mock('next/cache', () => ({ revalidatePath, revalidateTag }));

const SECRET = 'test-page-revalidate-secret';
vi.mock('@verifynng/config', () => ({
  loadEnv: () => ({ PAGE_REVALIDATE_SECRET: SECRET }),
}));

function sign(tenantSlug: string, productSlug: string, ts: number) {
  return createHmac('sha256', SECRET)
    .update(`${tenantSlug}.${productSlug}.${ts}`)
    .digest('hex');
}

function req(body: unknown) {
  return new Request('http://localhost/p/revalidate', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

describe('POST /p/revalidate', () => {
  beforeEach(() => {
    revalidatePath.mockClear();
    revalidateTag.mockClear();
  });

  it('revalidates the path (and tag, when ids are given) for a validly signed request', async () => {
    const { POST } = await import('./route');
    const ts = Date.now();
    const res = await POST(
      req({
        tenantSlug: 'ivoryglow',
        productSlug: 'turmeric-curcumin',
        ts,
        sig: sign('ivoryglow', 'turmeric-curcumin', ts),
        tenantId: 't1',
        productId: 'p1',
      }),
    );

    expect(res.status).toBe(200);
    expect(revalidatePath).toHaveBeenCalledWith(
      '/p/ivoryglow/turmeric-curcumin',
    );
    expect(revalidateTag).toHaveBeenCalledWith('tier1:t1:p1');
  });

  it('skips the tag revalidation when ids are omitted', async () => {
    const { POST } = await import('./route');
    const ts = Date.now();
    const res = await POST(
      req({
        tenantSlug: 'ivoryglow',
        productSlug: 'turmeric-curcumin',
        ts,
        sig: sign('ivoryglow', 'turmeric-curcumin', ts),
      }),
    );

    expect(res.status).toBe(200);
    expect(revalidatePath).toHaveBeenCalled();
    expect(revalidateTag).not.toHaveBeenCalled();
  });

  it('rejects a request with an invalid signature', async () => {
    const { POST } = await import('./route');
    const ts = Date.now();
    const res = await POST(
      req({
        tenantSlug: 'ivoryglow',
        productSlug: 'turmeric-curcumin',
        ts,
        sig: 'not-a-real-signature',
      }),
    );

    expect(res.status).toBe(401);
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it('rejects a malformed body', async () => {
    const { POST } = await import('./route');
    const res = await POST(req({ tenantSlug: 'ivoryglow' }));
    expect(res.status).toBe(400);
  });
});
