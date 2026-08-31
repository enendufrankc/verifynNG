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
import { ConflictException } from '@nestjs/common';
import type { PrismaClient } from '@prisma/client';
import {
  createTestDatabase,
  dropTestSchema,
  disconnectTestHelper,
  seedPlans,
} from '@verifynng/db';
import { SubscriptionService } from './subscription.service';
import { InvoiceService } from './invoice.service';
import { IllegalSubscriptionTransition } from './errors';
import { EventsService } from '../../common/events.service';
import { UsageReadService } from '../metering/usage-read.service';
import { BillingClock } from './billing-clock.service';
import type { TenantLifecycleService } from '../tenants/tenant-lifecycle.service';

describe('SubscriptionService integration (real Postgres)', () => {
  let prisma: PrismaClient;
  let schemaName: string;
  let emitter: EventEmitter2;
  let tenantLifecycle: { transition: ReturnType<typeof vi.fn> };
  let subscriptions: SubscriptionService;

  async function makeTenant(country: string | null = null) {
    const t = await prisma.tenant.create({
      data: {
        slug: `sub-test-${Math.random().toString(36).slice(2)}`,
        name: 'Sub Test',
        status: 'active',
        country,
      },
    });
    return t.id;
  }

  /** Real Unit rows (via a throwaway Batch) so a downgrade cap check exercises the actual `prisma.unit.count` query, not a stub. */
  async function makeUnits(tenantId: string, count: number): Promise<void> {
    const product = await prisma.product.create({
      data: { tenantId, sku: `sku-${Math.random()}`, name: 'P' },
    });
    const batch = await prisma.batch.create({
      data: {
        tenantId,
        productId: product.id,
        count,
        idempotencyKey: `idem-${Math.random()}`,
        requestedBy: 'test',
        watermark: 'w',
        kid: 'k1',
      },
    });
    for (let i = 0; i < count; i++) {
      const suffix = `${batch.id}-${i}`;
      await prisma.unit.create({
        data: {
          tenantId,
          batchId: batch.id,
          tier1Code: `t1-${suffix}`,
          tier2Hash: `t2-${suffix}`,
          serial: i,
          productId: product.id,
        },
      });
    }
  }

  beforeAll(async () => {
    const result = await createTestDatabase('subscription-service-integration');
    prisma = result.prisma;
    schemaName = result.schemaName;
    await seedPlans(prisma);
  }, 30000);

  beforeEach(() => {
    emitter = new EventEmitter2();
    tenantLifecycle = { transition: vi.fn().mockResolvedValue(undefined) };
    const events = new EventsService(emitter);
    const invoices = new InvoiceService(
      prisma,
      events,
      new UsageReadService(prisma),
      new BillingClock(),
    );
    subscriptions = new SubscriptionService(
      prisma,
      events,
      tenantLifecycle as unknown as TenantLifecycleService,
      invoices,
    );
  });

  afterAll(async () => {
    await dropTestSchema(schemaName, prisma);
    await disconnectTestHelper();
  });

  it('startTrial creates a trialing subscription on free-trial, NGN by default', async () => {
    const tenantId = await makeTenant(null);
    const sub = await subscriptions.startTrial(tenantId);
    expect(sub.status).toBe('trialing');
    expect(sub.currency).toBe('NGN');
    expect(sub.trialEndsAt).not.toBeNull();
  });

  it('startTrial picks GBP for a GB tenant', async () => {
    const tenantId = await makeTenant('GB');
    const sub = await subscriptions.startTrial(tenantId);
    expect(sub.currency).toBe('GBP');
  });

  it('startTrial is idempotent', async () => {
    const tenantId = await makeTenant();
    const first = await subscriptions.startTrial(tenantId);
    const second = await subscriptions.startTrial(tenantId);
    expect(second.id).toBe(first.id);
  });

  it('onTenantVerified starts a trial for the event payload tenantId', async () => {
    const tenantId = await makeTenant();
    await subscriptions.onTenantVerified({ tenantId });
    const sub = await subscriptions.getForTenant(tenantId);
    expect(sub?.status).toBe('trialing');
  });

  it('allows trialing -> active and emits subscription.changed', async () => {
    const tenantId = await makeTenant();
    await subscriptions.startTrial(tenantId);
    const spy = vi.fn();
    emitter.on('subscription.changed', spy);

    const updated = await subscriptions.transition(tenantId, 'active');
    expect(updated.status).toBe('active');
    expect(spy).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId,
        fromStatus: 'trialing',
        toStatus: 'active',
      }),
    );
  });

  it('rejects an illegal transition (trialing -> past_due)', async () => {
    const tenantId = await makeTenant();
    await subscriptions.startTrial(tenantId);
    await expect(
      subscriptions.transition(tenantId, 'past_due'),
    ).rejects.toThrow(IllegalSubscriptionTransition);
  });

  it('restricting calls TenantLifecycleService.transition and emits subscription.restricted', async () => {
    const tenantId = await makeTenant();
    await subscriptions.startTrial(tenantId);
    await subscriptions.transition(tenantId, 'active');
    const spy = vi.fn();
    emitter.on('subscription.restricted', spy);

    const updated = await subscriptions.transition(
      tenantId,
      'restricted',
      'dunning_exhausted',
    );
    expect(updated.status).toBe('restricted');
    expect(updated.restrictedAt).not.toBeNull();
    expect(tenantLifecycle.transition).toHaveBeenCalledWith(
      tenantId,
      'restricted',
      'system:billing',
      'dunning_exhausted',
    );
    expect(spy).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId, reason: 'dunning_exhausted' }),
    );
  });

  it('reactivating from restricted calls TenantLifecycleService.transition(active) and emits subscription.reactivated', async () => {
    const tenantId = await makeTenant();
    await subscriptions.startTrial(tenantId);
    await subscriptions.transition(tenantId, 'active');
    await subscriptions.transition(tenantId, 'restricted');
    const spy = vi.fn();
    emitter.on('subscription.reactivated', spy);

    const updated = await subscriptions.transition(tenantId, 'active');
    expect(updated.status).toBe('active');
    expect(tenantLifecycle.transition).toHaveBeenLastCalledWith(
      tenantId,
      'active',
      'system:billing',
    );
    expect(spy).toHaveBeenCalledWith(expect.objectContaining({ tenantId }));
  });

  it('runPeriodRoll expires a past-due trial to restricted with reason trial_expired', async () => {
    const tenantId = await makeTenant();
    const sub = await subscriptions.startTrial(tenantId);
    await prisma.subscription.update({
      where: { id: sub.id },
      data: { trialEndsAt: new Date(Date.now() - 1000) },
    });

    const result = await subscriptions.runPeriodRoll();
    expect(result.trialsExpired).toBeGreaterThanOrEqual(1);
    const updated = await subscriptions.getForTenant(tenantId);
    expect(updated?.status).toBe('restricted');
    expect(tenantLifecycle.transition).toHaveBeenCalledWith(
      tenantId,
      'restricted',
      'system:billing',
      'trial_expired',
    );
  });

  it('runPeriodRoll rolls an active subscription to the next month and applies a pending downgrade', async () => {
    const tenantId = await makeTenant();
    await subscriptions.startTrial(tenantId);
    await subscriptions.transition(tenantId, 'active');
    const starter = await prisma.plan.findUniqueOrThrow({
      where: { code: 'starter' },
    });
    const freeTrial = await prisma.plan.findUniqueOrThrow({
      where: { code: 'free-trial' },
    });
    const before = await subscriptions.getForTenant(tenantId);
    await prisma.subscription.update({
      where: { id: before!.id },
      data: {
        planId: starter.id,
        pendingPlanId: freeTrial.id,
        currentPeriodEnd: new Date(Date.now() - 1000),
      },
    });

    const result = await subscriptions.runPeriodRoll();
    expect(result.periodsRolled).toBeGreaterThanOrEqual(1);
    const after = await subscriptions.getForTenant(tenantId);
    expect(after?.planId).toBe(freeTrial.id);
    expect(after?.pendingPlanId).toBeNull();
    expect(after!.currentPeriodEnd.getTime()).toBeGreaterThan(
      before!.currentPeriodEnd.getTime(),
    );
  });

  describe('changePlan (T10 proration)', () => {
    // Anchors the period so "remaining fraction" is a round, hand-checkable
    // number: 15 of a 30-day period left = exactly 0.5.
    async function makeMidPeriodTenant(planCode: 'starter' | 'growth') {
      const tenantId = await makeTenant();
      await subscriptions.startTrial(tenantId);
      await subscriptions.transition(tenantId, 'active');
      const plan = await prisma.plan.findUniqueOrThrow({
        where: { code: planCode },
      });
      const periodStart = new Date('2026-08-01T00:00:00.000Z');
      const periodEnd = new Date('2026-08-31T00:00:00.000Z'); // 30 days
      await prisma.subscription.update({
        where: { tenantId },
        data: {
          planId: plan.id,
          currentPeriodStart: periodStart,
          currentPeriodEnd: periodEnd,
        },
      });
      return { tenantId, periodStart, periodEnd };
    }

    it('upgrade (starter -> growth) issues a proration invoice for the net of charge minus credit, halfway through the period', async () => {
      const { tenantId } = await makeMidPeriodTenant('starter');
      const now = new Date('2026-08-16T00:00:00.000Z'); // exactly 15/30 days remain

      const { subscription, prorationInvoice } = await subscriptions.changePlan(
        tenantId,
        'growth',
        { now },
      );

      const growth = await prisma.plan.findUniqueOrThrow({
        where: { code: 'growth' },
      });
      expect(subscription.planId).toBe(growth.id);
      expect(subscription.status).toBe('active');
      expect(prorationInvoice).not.toBeNull();
      // starter ₦45,000/mo credit half = ₦22,500; growth ₦180,000/mo charge
      // half = ₦90,000; net = ₦67,500 = 6,750,000 kobo (tax rate 0 by default).
      expect(prorationInvoice!.totalMinor).toBe(6_750_000);
      expect(prorationInvoice!.status).toBe('issued');
      const lines = await prisma.invoiceLine.findMany({
        where: { invoiceId: prorationInvoice!.id },
      });
      expect(lines.map((l) => l.kind).sort()).toEqual([
        'proration_charge',
        'proration_credit',
      ]);
    });

    it('upgrade from trialing moves status to active even with a zero-fee credit (free trial has no monthly charge)', async () => {
      const tenantId = await makeTenant();
      const sub = await subscriptions.startTrial(tenantId);
      const now = new Date(sub.currentPeriodStart.getTime() + 1000);

      const { subscription, prorationInvoice } = await subscriptions.changePlan(
        tenantId,
        'starter',
        { now },
      );
      expect(subscription.status).toBe('active');
      expect(prorationInvoice).not.toBeNull();
      expect(prorationInvoice!.totalMinor).toBeGreaterThan(0);
    });

    it('downgrade (growth -> starter) schedules pendingPlanId at period end and issues no invoice', async () => {
      const { tenantId } = await makeMidPeriodTenant('growth');

      const { subscription, prorationInvoice } = await subscriptions.changePlan(
        tenantId,
        'starter',
      );
      const starter = await prisma.plan.findUniqueOrThrow({
        where: { code: 'starter' },
      });
      const growth = await prisma.plan.findUniqueOrThrow({
        where: { code: 'growth' },
      });
      expect(subscription.planId).toBe(growth.id); // unchanged until period roll
      expect(subscription.pendingPlanId).toBe(starter.id);
      expect(prorationInvoice).toBeNull();
    });

    it('downgrade is blocked when current units already exceed the target plan cap, unless forced', async () => {
      const { tenantId } = await makeMidPeriodTenant('growth');
      // A tiny target cap so 3 real Unit rows are enough to exceed it,
      // without minting 10,001 rows against starter's real 10,000 cap.
      const tinyPlan = await prisma.plan.create({
        data: {
          code: `tiny-${Math.random().toString(36).slice(2)}`,
          name: 'Tiny',
          monthlyPriceNgnMinor: 100,
          monthlyPriceGbpMinor: 100,
          includedUnitsPerYear: 2,
          includedScansPerMonth: 100,
          overageUnitPriceNgnMinor: 0,
          overageUnitPriceGbpMinor: 0,
          overageScanPriceNgnMinor: 0,
          overageScanPriceGbpMinor: 0,
          features: {},
          sortOrder: -1,
        },
      });
      await makeUnits(tenantId, 3);

      await expect(
        subscriptions.changePlan(tenantId, tinyPlan.code),
      ).rejects.toThrow(ConflictException);

      const { subscription } = await subscriptions.changePlan(
        tenantId,
        tinyPlan.code,
        { force: true },
      );
      expect(subscription.pendingPlanId).toBe(tinyPlan.id);
    });

    it('rejects a plan change touching the custom-priced enterprise plan', async () => {
      const { tenantId } = await makeMidPeriodTenant('growth');
      await expect(
        subscriptions.changePlan(tenantId, 'enterprise'),
      ).rejects.toThrow(ConflictException);
    });

    it('is a no-op when the target plan is already current', async () => {
      const { tenantId } = await makeMidPeriodTenant('starter');
      const { subscription, prorationInvoice } = await subscriptions.changePlan(
        tenantId,
        'starter',
      );
      expect(prorationInvoice).toBeNull();
      const starter = await prisma.plan.findUniqueOrThrow({
        where: { code: 'starter' },
      });
      expect(subscription.planId).toBe(starter.id);
    });
  });

  describe('previewChangePlan', () => {
    it("matches changePlan's upgrade math without persisting anything", async () => {
      const tenantId = await makeTenant();
      await subscriptions.startTrial(tenantId);
      await subscriptions.transition(tenantId, 'active');
      const starter = await prisma.plan.findUniqueOrThrow({
        where: { code: 'starter' },
      });
      const periodStart = new Date('2026-08-01T00:00:00.000Z');
      const periodEnd = new Date('2026-08-31T00:00:00.000Z');
      await prisma.subscription.update({
        where: { tenantId },
        data: {
          planId: starter.id,
          currentPeriodStart: periodStart,
          currentPeriodEnd: periodEnd,
        },
      });
      const now = new Date('2026-08-16T00:00:00.000Z');

      const preview = await subscriptions.previewChangePlan(
        tenantId,
        'growth',
        now,
      );
      expect(preview.direction).toBe('upgrade');
      expect(preview.netMinor).toBe(6_750_000);

      const before = await subscriptions.getForTenant(tenantId);
      expect(before?.planId).toBe(starter.id); // preview never persists
    });

    it('reports blockedByUnitsCap for an over-cap downgrade without throwing', async () => {
      const tenantId = await makeTenant();
      await subscriptions.startTrial(tenantId);
      await subscriptions.transition(tenantId, 'active');
      const growth = await prisma.plan.findUniqueOrThrow({
        where: { code: 'growth' },
      });
      await prisma.subscription.update({
        where: { tenantId },
        data: { planId: growth.id },
      });
      const tinyPlan = await prisma.plan.create({
        data: {
          code: `tiny-${Math.random().toString(36).slice(2)}`,
          name: 'Tiny',
          monthlyPriceNgnMinor: 100,
          monthlyPriceGbpMinor: 100,
          includedUnitsPerYear: 0,
          includedScansPerMonth: 100,
          overageUnitPriceNgnMinor: 0,
          overageUnitPriceGbpMinor: 0,
          overageScanPriceNgnMinor: 0,
          overageScanPriceGbpMinor: 0,
          features: {},
          sortOrder: -1,
        },
      });
      await makeUnits(tenantId, 1);

      const preview = await subscriptions.previewChangePlan(
        tenantId,
        tinyPlan.code,
      );
      expect(preview.direction).toBe('downgrade');
      expect(preview.blockedByUnitsCap).toEqual({ used: 1, limit: 0 });
    });
  });
});
