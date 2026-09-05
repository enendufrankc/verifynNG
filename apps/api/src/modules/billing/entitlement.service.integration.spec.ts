import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import {
  createTestDatabase,
  dropTestSchema,
  disconnectTestHelper,
  seedPlans,
} from '@verifynng/db';
import { EntitlementService } from './entitlement.service';

describe('EntitlementService integration (real Postgres)', () => {
  let prisma: PrismaClient;
  let schemaName: string;
  let entitlements: EntitlementService;

  async function makeTenantOnPlan(planCode: string) {
    const tenant = await prisma.tenant.create({
      data: {
        slug: `ent-test-${Math.random().toString(36).slice(2)}`,
        name: 'Entitlement Test',
        status: 'active',
      },
    });
    const plan = await prisma.plan.findUniqueOrThrow({
      where: { code: planCode },
    });
    const now = new Date();
    await prisma.subscription.create({
      data: {
        tenantId: tenant.id,
        planId: plan.id,
        status: planCode === 'free-trial' ? 'trialing' : 'active',
        currency: 'NGN',
        currentPeriodStart: now,
        currentPeriodEnd: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000),
      },
    });
    return tenant.id;
  }

  beforeAll(async () => {
    const result = await createTestDatabase('entitlement-service-integration');
    prisma = result.prisma;
    schemaName = result.schemaName;
    await seedPlans(prisma);
    entitlements = new EntitlementService(prisma);
  }, 30000);

  afterAll(async () => {
    await dropTestSchema(schemaName, prisma);
    await disconnectTestHelper();
  });

  it('allows minting up to the trial cap of 500', async () => {
    const tenantId = await makeTenantOnPlan('free-trial');
    const result = await entitlements.canMint({
      tenantId,
      count: 1,
      existingUnitsThisYear: 499,
    });
    expect(result.allowed).toBe(true);
  });

  it('denies the 501st unit on the trial cap with the plan_limit shape', async () => {
    const tenantId = await makeTenantOnPlan('free-trial');
    const result = await entitlements.canMint({
      tenantId,
      count: 1,
      existingUnitsThisYear: 500,
    });
    expect(result).toMatchObject({
      allowed: false,
      code: 'plan_limit',
      limit: 500,
      used: 500,
    });
  });

  it('does not cap starter (no hardCap feature — overage allowed)', async () => {
    const tenantId = await makeTenantOnPlan('starter');
    const result = await entitlements.canMint({
      tenantId,
      count: 1,
      existingUnitsThisYear: 999_999,
    });
    expect(result.allowed).toBe(true);
  });

  it('never caps enterprise (customPricing)', async () => {
    const tenantId = await makeTenantOnPlan('enterprise');
    const result = await entitlements.canMint({
      tenantId,
      count: 1_000_000,
      existingUnitsThisYear: 0,
    });
    expect(result.allowed).toBe(true);
  });

  it('fails open when the tenant has no subscription yet', async () => {
    const tenant = await prisma.tenant.create({
      data: {
        slug: `ent-nosub-${Math.random().toString(36).slice(2)}`,
        name: 'No Sub',
      },
    });
    const result = await entitlements.canMint({
      tenantId: tenant.id,
      count: 1,
      existingUnitsThisYear: 0,
    });
    expect(result.allowed).toBe(true);
  });

  it('hasFeature reads Plan.features', async () => {
    const growthTenant = await makeTenantOnPlan('growth');
    const starterTenant = await makeTenantOnPlan('starter');
    expect(await entitlements.hasFeature(growthTenant, 'publicApi')).toBe(true);
    expect(await entitlements.hasFeature(starterTenant, 'publicApi')).toBe(
      false,
    );
  });

  it('limitsFor returns the plan API limits, or defaults with no subscription', async () => {
    const growthTenant = await makeTenantOnPlan('growth');
    expect(await entitlements.limitsFor(growthTenant)).toEqual({
      apiRateLimitPerMin: 600,
      maxApiKeys: 10,
    });

    const tenant = await prisma.tenant.create({
      data: {
        slug: `ent-limits-${Math.random().toString(36).slice(2)}`,
        name: 'No Sub Limits',
      },
    });
    expect(await entitlements.limitsFor(tenant.id)).toEqual({
      apiRateLimitPerMin: 60,
      maxApiKeys: 1,
    });
  });
});
