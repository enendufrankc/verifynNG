/**
 * Production runs `prisma db seed` on every deploy, so this fixture decides
 * what a tenant created between deploys ends up on. It has to agree with
 * `SubscriptionService.startTrial`, or a brand awaiting KYC approval would be
 * handed a 30-day trial that the nightly period roll later restricts.
 *
 * Set before any `loadEnv()` call — vitest isolates the module registry per
 * file, so this file's cached env is its own.
 */
process.env.BILLING_SIGNUP_PLAN = 'free';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import {
  createTestDatabase,
  disconnectTestHelper,
  dropTestSchema,
} from './test-helpers';
import { seedPlans } from './plan-catalogue';
import { seedSubscriptions } from '../prisma/seed/plans';

describe('seedSubscriptions on a free signup plan', () => {
  let prisma: PrismaClient;
  let schemaName: string;

  beforeAll(async () => {
    const result = await createTestDatabase('seed-subscriptions');
    prisma = result.prisma;
    schemaName = result.schemaName;
    await seedPlans(prisma);
  }, 30000);

  afterAll(async () => {
    await dropTestSchema(schemaName, prisma);
    await disconnectTestHelper();
  });

  it('opens an uncovered tenant on free, active and with no expiry', async () => {
    const tenant = await prisma.tenant.create({
      data: { slug: 'seed-free', name: 'Seed Free', status: 'pending' },
    });

    await seedSubscriptions(prisma);

    const subscription = await prisma.subscription.findUniqueOrThrow({
      where: { tenantId: tenant.id },
      include: { plan: true },
    });
    expect(subscription.plan.code).toBe('free');
    expect(subscription.status).toBe('active');
    expect(subscription.trialEndsAt).toBeNull();
  });

  it('leaves a tenant that already has a subscription alone', async () => {
    const tenant = await prisma.tenant.create({
      data: { slug: 'seed-covered', name: 'Seed Covered', status: 'active' },
    });
    const starter = await prisma.plan.findUniqueOrThrow({
      where: { code: 'starter' },
    });
    const now = new Date();
    await prisma.subscription.create({
      data: {
        tenantId: tenant.id,
        planId: starter.id,
        status: 'active',
        currency: 'NGN',
        currentPeriodStart: now,
        currentPeriodEnd: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000),
      },
    });

    await seedSubscriptions(prisma);

    const subscription = await prisma.subscription.findUniqueOrThrow({
      where: { tenantId: tenant.id },
      include: { plan: true },
    });
    expect(subscription.plan.code).toBe('starter');
  });
});
