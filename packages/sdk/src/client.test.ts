import { describe, it, expect, vi } from 'vitest';
import { createClient } from './client.js';
import { VerifyNGApiError } from './errors.js';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('createClient', () => {
  it('sends Authorization: Bearer <apiKey> on every request', async () => {
    const fetch = vi.fn(async (req: Request) => {
      expect(req.headers.get('Authorization')).toBe('Bearer vk_live_test');
      return jsonResponse({ data: [], nextCursor: null });
    });
    const client = createClient({
      apiKey: 'vk_live_test',
      baseUrl: 'http://localhost:4000',
      fetch,
    });
    await client.batches.list();
    expect(fetch).toHaveBeenCalledOnce();
  });

  it('sends a client-generated Idempotency-Key on batches.create when none is given', async () => {
    let seenKey: string | null = null;
    const fetch = vi.fn(async (req: Request) => {
      seenKey = req.headers.get('Idempotency-Key');
      return jsonResponse({ batch: { id: 'batch_1' }, exportUrl: null }, 202);
    });
    const client = createClient({
      apiKey: 'vk_live_test',
      baseUrl: 'http://localhost:4000',
      fetch,
    });
    await client.batches.create({ productId: 'p1', oemId: 'o1', count: 10 });
    expect(seenKey).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
  });

  it('uses a caller-supplied Idempotency-Key when given', async () => {
    let seenKey: string | null = null;
    const fetch = vi.fn(async (req: Request) => {
      seenKey = req.headers.get('Idempotency-Key');
      return jsonResponse({ batch: { id: 'batch_1' }, exportUrl: null }, 202);
    });
    const client = createClient({
      apiKey: 'vk_live_test',
      baseUrl: 'http://localhost:4000',
      fetch,
    });
    await client.batches.create(
      { productId: 'p1', oemId: 'o1', count: 10 },
      'my-fixed-key',
    );
    expect(seenKey).toBe('my-fixed-key');
  });

  it('throws VerifyNGApiError with the parsed envelope on a non-2xx response', async () => {
    const fetch = vi.fn(async () =>
      jsonResponse(
        {
          error: {
            type: 'not_found',
            message: 'Batch not found',
            docs: 'http://localhost:4000/api/docs#errors',
          },
        },
        404,
      ),
    );
    const client = createClient({
      apiKey: 'vk_live_test',
      baseUrl: 'http://localhost:4000',
      fetch,
    });
    await expect(client.batches.get('missing')).rejects.toMatchObject({
      status: 404,
      body: { type: 'not_found' },
    });
    await expect(client.batches.get('missing')).rejects.toBeInstanceOf(
      VerifyNGApiError,
    );
  });

  it('batches.listAll() walks every page via nextCursor', async () => {
    const pages = [
      { data: [{ id: 'b1' }, { id: 'b2' }], nextCursor: 'cursor-1' },
      { data: [{ id: 'b3' }], nextCursor: null },
    ];
    let call = 0;
    const fetch = vi.fn(async () => jsonResponse(pages[call++]));
    const client = createClient({
      apiKey: 'vk_live_test',
      baseUrl: 'http://localhost:4000',
      fetch,
    });

    const ids: string[] = [];
    for await (const batch of client.batches.listAll()) {
      ids.push((batch as { id: string }).id);
    }
    expect(ids).toEqual(['b1', 'b2', 'b3']);
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});
