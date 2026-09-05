import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import {
  createTestDatabase,
  dropTestSchema,
  disconnectTestHelper,
} from '@verifynng/db';
import { PlanService } from './plan.service';

describe('PlanService integration (real Postgres)', () => {
  let prisma: PrismaClient;
  let schemaName: string;
  let plans: PlanService;

  beforeAll(async () => {
    const result = await createTestDatabase('plan-service-integration');
    prisma = result.prisma;
    schemaName = result.schemaName;
    plans = new PlanService(prisma);
  }, 30000);

  afterAll(async () => {
    await dropTestSchema(schemaName, prisma);
    await disconnectTestHelper();
  });

  it('seeds the four-plan catalogue', async () => {
    await plans.seed();
    const list = await plans.list();
    expect(list.map((p) => p.code).sort()).toEqual([
      'enterprise',
      'free-trial',
      'growth',
      'starter',
    ]);
  });

  it('lists plans ordered by sortOrder', async () => {
    await plans.seed();
    const list = await plans.list();
    expect(list.map((p) => p.code)).toEqual([
      'free-trial',
      'starter',
      'growth',
      'enterprise',
    ]);
  });

  it('prices are in minor units (integers) for both currencies', async () => {
    const starter = await plans.getByCode('starter');
    expect(starter?.monthlyPriceNgnMinor).toBe(4_500_000);
    expect(starter?.monthlyPriceGbpMinor).toBe(2_500);
    expect(Number.isInteger(starter!.monthlyPriceNgnMinor)).toBe(true);
  });

  it('getByCode returns null for an unknown code', async () => {
    expect(await plans.getByCode('nope')).toBeNull();
  });

  it('seed() is idempotent', async () => {
    await plans.seed();
    await plans.seed();
    const list = await plans.list();
    expect(list).toHaveLength(4);
  });
});
