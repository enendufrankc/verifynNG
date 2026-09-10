/**
 * The platform's free launch posture: `BILLING_SIGNUP_PLAN=free` opens every
 * new tenant's first subscription on an ordinary active plan that never
 * expires, instead of the 30-day trial the nightly period roll restricts.
 *
 * Set before any `loadEnv()` call — vitest isolates the module registry per
 * file, so this file's cached env is its own.
 */
process.env.BILLING_SIGNUP_PLAN = 'free';

import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { PrismaClient } from '@prisma/client';
import {
  createTestDatabase,
  dropTestSchema,
  disconnectTestHelper,
  seedPlans,
} from '@verifynng/db';
import { SubscriptionService } from './subscription.service';
import { InvoiceService } from './invoice.service';
import { EntitlementService } from './entitlement.service';
import { EventsService } from '../../common/events.service';
import { UsageReadService } from '../metering/usage-read.service';
import { BillingClock } from './billing-clock.service';
import type { TenantLifecycleService } from '../tenants/tenant-lifecycle.service';

const A_YEAR_FROM_NOW = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);

describe('signup plan = free (real Postgres)', () => {
  let prisma: PrismaClient;
  let schemaName: string;
  let tenantLifecycle: { transition: ReturnType<typeof vi.fn> };
  let subscriptions: SubscriptionService;
  let entitlements: EntitlementService;

  async function makeTenant(country: string | null = null) {
    const t = await prisma.tenant.create({
      data: {
        slug: `free-test-${Math.random().toString(36).slice(2)}`,
        name: 'Free Test',
        status: 'active',
        country,
      },
    });
    return t.id;
  }

  beforeAll(async () => {
    const result = await createTestDatabase('subscription-signup-plan');
    prisma = result.prisma;
    schemaName = result.schemaName;
    await seedPlans(prisma);
  }, 30000);

  beforeEach(() => {
    const events = new EventsService(new EventEmitter2());
    tenantLifecycle = { transition: vi.fn().mockResolvedValue(undefined) };
    subscriptions = new SubscriptionService(
      prisma,
      events,
      tenantLifecycle as unknown as TenantLifecycleService,
      new InvoiceService(
        prisma,
        events,
        new UsageReadService(prisma),
        new BillingClock(),
      ),
    );
    entitlements = new EntitlementService(prisma);
  });

  afterAll(async () => {
    await dropTestSchema(schemaName, prisma);
    await disconnectTestHelper();
  });

  it('opens the first subscription active on the free plan, with no trial end', async () => {
    const tenantId = await makeTenant();
    const sub = await subscriptions.startTrial(tenantId);

    const plan = await prisma.plan.findUniqueOrThrow({
      where: { id: sub.planId },
    });
    expect(plan.code).toBe('free');
    expect(sub.status).toBe('active');
    expect(sub.trialEndsAt).toBeNull();
  });

  it('still picks the tenant currency', async () => {
    const tenantId = await makeTenant('GB');
    const sub = await subscriptions.startTrial(tenantId);
    expect(sub.currency).toBe('GBP');
  });

  it('is never restricted by the nightly period roll', async () => {
    const tenantId = await makeTenant();
    await subscriptions.startTrial(tenantId);

    const { trialsExpired } =
      await subscriptions.runPeriodRoll(A_YEAR_FROM_NOW);

    expect(trialsExpired).toBe(0);
    expect(tenantLifecycle.transition).not.toHaveBeenCalled();
    const after = await subscriptions.getForTenant(tenantId);
    expect(after?.status).toBe('active');
  });

  it('unlocks every paid feature and leaves minting uncapped', async () => {
    const tenantId = await makeTenant();
    await subscriptions.startTrial(tenantId);

    for (const feature of [
      'publicApi',
      'webhooks',
      'sso',
      'customPages',
    ] as const) {
      expect(await entitlements.hasFeature(tenantId, feature)).toBe(true);
    }
    const check = await entitlements.canMint({
      tenantId,
      count: 100_000,
      existingUnitsThisYear: 500_000,
    });
    expect(check.allowed).toBe(true);
  });
});
