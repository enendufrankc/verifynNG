import { describe, expect, it, vi } from 'vitest';
import { PageEventsService } from './page-events.service';

/** Minimal in-memory stand-in for the ioredis calls this service makes. */
class FakeRedis {
  private store = new Map<string, string>();
  private sets = new Map<string, Set<string>>();

  async get(key: string): Promise<string | null> {
    return this.store.get(key) ?? null;
  }

  multi() {
    const ops: Array<() => void> = [];
    const chain = {
      incr: (key: string) => {
        ops.push(() =>
          this.store.set(key, String((Number(this.store.get(key)) || 0) + 1)),
        );
        return chain;
      },
      sadd: (setKey: string, member: string) => {
        ops.push(() => {
          const s = this.sets.get(setKey) ?? new Set();
          s.add(member);
          this.sets.set(setKey, s);
        });
        return chain;
      },
      del: (key: string) => {
        ops.push(() => this.store.delete(key));
        return chain;
      },
      srem: (setKey: string, member: string) => {
        ops.push(() => this.sets.get(setKey)?.delete(member));
        return chain;
      },
      exec: async () => {
        for (const op of ops) op();
      },
    };
    return chain;
  }

  async smembers(setKey: string): Promise<string[]> {
    return [...(this.sets.get(setKey) ?? [])];
  }
}

describe('PageEventsService', () => {
  it('buffers repeated beacons for the same bucket into one counter', async () => {
    const upsert = vi.fn(async (_args: Record<string, unknown>) => ({}));
    const service = new PageEventsService(
      new FakeRedis() as never,
      {
        pageViewRollupDaily: { upsert },
      } as never,
    );

    const at = new Date('2026-08-30T12:00:00.000Z');
    await service.record('tenant-1', '/v', 'qr', 'en', at);
    await service.record('tenant-1', '/v', 'qr', 'en', at);
    await service.record('tenant-1', '/v', 'qr', 'en', at);

    const result = await service.flush();
    expect(result.bucketsFlushed).toBe(1);
    expect(upsert).toHaveBeenCalledOnce();
    expect(upsert.mock.calls[0][0]).toMatchObject({
      where: {
        tenantId_date_route_referrerType_locale: {
          tenantId: 'tenant-1',
          route: '/v',
          referrerType: 'qr',
          locale: 'en',
        },
      },
      create: expect.objectContaining({ count: 3 }),
    });
  });

  it('a second flush with no new beacons writes nothing', async () => {
    const upsert = vi.fn(async (_args: Record<string, unknown>) => ({}));
    const service = new PageEventsService(
      new FakeRedis() as never,
      {
        pageViewRollupDaily: { upsert },
      } as never,
    );

    await service.record('tenant-1', '/v', 'qr', 'en');
    await service.flush();
    upsert.mockClear();

    const second = await service.flush();
    expect(second.bucketsFlushed).toBe(0);
    expect(upsert).not.toHaveBeenCalled();
  });

  it('keeps distinct buckets (different route/locale) separate', async () => {
    const upsert = vi.fn(async (_args: Record<string, unknown>) => ({}));
    const service = new PageEventsService(
      new FakeRedis() as never,
      {
        pageViewRollupDaily: { upsert },
      } as never,
    );

    await service.record('tenant-1', '/v', 'qr', 'en');
    await service.record('tenant-1', '/verify', 'manual', 'fr');

    const result = await service.flush();
    expect(result.bucketsFlushed).toBe(2);
  });
});
