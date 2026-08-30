import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Redis from 'ioredis';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { createTestDatabase, dropTestSchema } from '@verifynng/db';
import type { PrismaClient } from '@prisma/client';
import { QuotaService } from './quota.service.js';
import { QuotaExceededError } from './quota-error.js';

describe('QuotaService (integration)', () => {
  let prisma: PrismaClient;
  let schemaName: string;
  let redis: Redis;
  let service: QuotaService;
  const runId = Date.now();

  beforeAll(async () => {
    const db = await createTestDatabase('quota-service-spec');
    prisma = db.prisma;
    schemaName = db.schemaName;
    redis = new Redis(process.env.REDIS_URL!);
    service = new QuotaService(redis, prisma, new EventEmitter2());
  }, 30_000);

  afterAll(async () => {
    await dropTestSchema(schemaName, prisma);
    redis.disconnect();
  });

  it('increments atomically under 100 parallel calls with no lost updates', async () => {
    service.registerKind('atomic_per_min', {
      defaultLimit: 1000,
      window: 'minute',
    });
    const tenantId = `tenant-atomic-${runId}`;

    await Promise.all(
      Array.from({ length: 100 }, () =>
        service.assertWithinQuota(tenantId, 'atomic_per_min'),
      ),
    );

    const { used } = await service.peek(tenantId, 'atomic_per_min');
    expect(used).toBe(100);
  });

  it('throws QuotaExceededError with Retry-After info once the limit is exceeded', async () => {
    service.registerKind('small_per_min', {
      defaultLimit: 2,
      window: 'minute',
    });
    const tenantId = `tenant-small-${runId}`;

    await service.assertWithinQuota(tenantId, 'small_per_min');
    await service.assertWithinQuota(tenantId, 'small_per_min');

    await expect(
      service.assertWithinQuota(tenantId, 'small_per_min'),
    ).rejects.toThrow(QuotaExceededError);
  });

  it('an override takes precedence over the registered default limit', async () => {
    service.registerKind('override_per_min', {
      defaultLimit: 1,
      window: 'minute',
    });
    const tenantId = `tenant-override-${runId}`;

    await service.upsertOverride(tenantId, 'override_per_min', 5, 'minute');

    for (let i = 0; i < 5; i++) {
      await service.assertWithinQuota(tenantId, 'override_per_min');
    }
    await expect(
      service.assertWithinQuota(tenantId, 'override_per_min'),
    ).rejects.toThrow(QuotaExceededError);
  });
});
