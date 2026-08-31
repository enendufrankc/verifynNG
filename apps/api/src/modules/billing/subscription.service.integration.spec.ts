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
import { IllegalSubscriptionTransition } from './errors';
import { EventsService } from '../../common/events.service';
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

  beforeAll(async () => {
    const result = await createTestDatabase('subscription-service-integration');
    prisma = result.prisma;
    schemaName = result.schemaName;
    await seedPlans(prisma);
  }, 30000);

  beforeEach(() => {
    emitter = new EventEmitter2();
    tenantLifecycle = { transition: vi.fn().mockResolvedValue(undefined) };
    subscriptions = new SubscriptionService(
      prisma,
      new EventsService(emitter),
      tenantLifecycle as unknown as TenantLifecycleService,
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
});
