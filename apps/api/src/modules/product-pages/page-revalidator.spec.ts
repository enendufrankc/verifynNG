import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ConfigService } from '@nestjs/config';
import { PageRevalidator } from './page-revalidator';

const SECRET = 'test-secret';

function newRevalidator(): PageRevalidator {
  return new PageRevalidator(
    new ConfigService({
      PAGE_REVALIDATE_SECRET: SECRET,
      PAGES_PUBLIC_BASE_URL: 'http://web-verify.test',
    }),
  );
}

describe('PageRevalidator', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, 'fetch');
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it('POSTs a signed, timestamped body to the revalidate endpoint', async () => {
    fetchSpy.mockResolvedValue(new Response(null, { status: 200 }));

    await newRevalidator().revalidate({
      tenantSlug: 'ivoryglow',
      productSlug: 'turmeric-curcumin',
      tenantId: 't1',
      productId: 'p1',
    });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://web-verify.test/p/revalidate');
    const body = JSON.parse(init.body as string);
    expect(body).toMatchObject({
      tenantSlug: 'ivoryglow',
      productSlug: 'turmeric-curcumin',
      tenantId: 't1',
      productId: 'p1',
    });
    expect(typeof body.ts).toBe('number');
    expect(typeof body.sig).toBe('string');
  });

  it('never throws when the request fails', async () => {
    fetchSpy.mockRejectedValue(new Error('network down'));
    await expect(
      newRevalidator().revalidate({
        tenantSlug: 'ivoryglow',
        productSlug: 'turmeric-curcumin',
      }),
    ).resolves.toBeUndefined();
  });

  it('never throws on a non-2xx response', async () => {
    fetchSpy.mockResolvedValue(new Response(null, { status: 500 }));
    await expect(
      newRevalidator().revalidate({
        tenantSlug: 'ivoryglow',
        productSlug: 'turmeric-curcumin',
      }),
    ).resolves.toBeUndefined();
  });
});
