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
import { DunningService } from './dunning.service';
import { SubscriptionService } from './subscription.service';
import { InvoiceService } from './invoice.service';
import { BillingClock } from './billing-clock.service';
import { EventsService } from '../../common/events.service';
import { UsageReadService } from '../metering/usage-read.service';
import type { TenantLifecycleService } from '../tenants/tenant-lifecycle.service';
import type { PaymentService } from './payment.service';
import type { NotificationService } from '../notifications/notifications.service';
import type { Queue } from 'bullmq';

describe('DunningService integration (real Postgres)', () => {
  let prisma: PrismaClient;
  let schemaName: string;
  let tenantLifecycle: { transition: ReturnType<typeof vi.fn> };
  let notifications: { send: ReturnType<typeof vi.fn> };
  let billingQueue: { add: ReturnType<typeof vi.fn> };
  let subscriptions: SubscriptionService;
  let invoices: InvoiceService;
  let dunning: DunningService;

  async function makeTenantWithOwnerSubAndInvoice(
    subStatus: 'active' | 'restricted' = 'active',
  ) {
    const tenant = await prisma.tenant.create({
      data: {
        slug: `dun-test-${Math.random().toString(36).slice(2)}`,
        name: 'Dun Test',
        status: 'active',
      },
    });
    const user = await prisma.user.create({
      data: {
        email: `owner-${Math.random().toString(36).slice(2)}@example.com`,
        displayName: 'Owner',
      },
    });
    await prisma.membership.create({
      data: { userId: user.id, tenantId: tenant.id, role: 'owner' },
    });
    const plan = await prisma.plan.findUniqueOrThrow({
      where: { code: 'starter' },
    });
    await prisma.subscription.create({
      data: {
        tenantId: tenant.id,
        planId: plan.id,
        status: subStatus,
        currency: 'NGN',
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(),
        restrictedAt: subStatus === 'restricted' ? new Date() : null,
      },
    });
    const invoice = await prisma.invoice.create({
      data: {
        tenantId: tenant.id,
        number: `INV-DUN-${Math.random().toString(36).slice(2)}`,
        status: 'issued',
        currency: 'NGN',
        periodStart: new Date(),
        periodEnd: new Date(),
        subtotalMinor: 4_500_000,
        taxMinor: 0,
        totalMinor: 4_500_000,
        attemptCount: 0,
        dueAt: new Date(),
        usageSnapshot: {},
      },
    });
    return { tenant, user, invoice };
  }

  beforeAll(async () => {
    const result = await createTestDatabase('dunning-service-integration');
    prisma = result.prisma;
    schemaName = result.schemaName;
    await seedPlans(prisma);
  }, 30000);

  beforeEach(() => {
    const emitter = new EventEmitter2();
    tenantLifecycle = { transition: vi.fn().mockResolvedValue(undefined) };
    notifications = {
      send: vi.fn().mockResolvedValue({ outboxId: 'x', status: 'queued' }),
    };
    billingQueue = { add: vi.fn().mockResolvedValue(undefined) };
    invoices = new InvoiceService(
      prisma,
      new EventsService(emitter),
      new UsageReadService(prisma),
      new BillingClock(),
    );
    subscriptions = new SubscriptionService(
      prisma,
      new EventsService(emitter),
      tenantLifecycle as unknown as TenantLifecycleService,
      invoices,
    );
    dunning = new DunningService(
      prisma,
      { chargeAuthorisation: vi.fn() } as unknown as PaymentService,
      subscriptions,
      invoices,
      new BillingClock(),
      notifications as unknown as NotificationService,
      billingQueue as unknown as Queue,
    );
  });

  afterAll(async () => {
    await dropTestSchema(schemaName, prisma);
    await disconnectTestHelper();
  });

  it('onInvoiceIssued sends the invoice.issued email and schedules a charge when a default PaymentMethod exists', async () => {
    const { tenant, invoice } = await makeTenantWithOwnerSubAndInvoice();
    await prisma.paymentMethod.create({
      data: {
        tenantId: tenant.id,
        provider: 'fake',
        authorizationCode: 'enc:whatever',
        isDefault: true,
      },
    });

    await dunning.onInvoiceIssued({
      tenantId: tenant.id,
      invoiceId: invoice.id,
      number: invoice.number,
      currency: 'NGN',
      totalMinor: invoice.totalMinor,
      dueAt: new Date().toISOString(),
    });

    expect(notifications.send).toHaveBeenCalledWith(
      'invoice.issued',
      expect.objectContaining({ email: expect.stringContaining('@') }),
      expect.objectContaining({ invoiceNumber: invoice.number }),
      expect.objectContaining({ tenantId: tenant.id }),
    );
    expect(billingQueue.add).toHaveBeenCalledWith(
      'dunning-charge',
      { invoiceId: invoice.id, attempt: 1 },
      expect.objectContaining({ jobId: `invoice-${invoice.id}-attempt-1` }),
    );
  });

  it('onInvoiceIssued does not schedule a charge without a default PaymentMethod', async () => {
    const { tenant, invoice } = await makeTenantWithOwnerSubAndInvoice();
    await dunning.onInvoiceIssued({
      tenantId: tenant.id,
      invoiceId: invoice.id,
      number: invoice.number,
      currency: 'NGN',
      totalMinor: invoice.totalMinor,
      dueAt: new Date().toISOString(),
    });
    expect(billingQueue.add).not.toHaveBeenCalledWith(
      'dunning-charge',
      expect.anything(),
      expect.anything(),
    );
  });

  it('onPaymentFailed schedules a retry before the 3rd attempt', async () => {
    const { tenant, invoice } = await makeTenantWithOwnerSubAndInvoice();
    await dunning.onPaymentFailed({
      tenantId: tenant.id,
      invoiceId: invoice.id,
      paymentId: 'p1',
      attempt: 1,
      reason: 'Declined',
    });

    expect(notifications.send).toHaveBeenCalledWith(
      'invoice.failed',
      expect.anything(),
      expect.objectContaining({ reason: 'Declined' }),
      expect.anything(),
    );
    expect(billingQueue.add).toHaveBeenCalledWith(
      'dunning-charge',
      { invoiceId: invoice.id, attempt: 2 },
      expect.objectContaining({ jobId: `invoice-${invoice.id}-attempt-2` }),
    );
    expect(tenantLifecycle.transition).not.toHaveBeenCalled();
  });

  it('onPaymentFailed restricts the tenant on the 3rd attempt (AC5)', async () => {
    const { tenant, invoice } = await makeTenantWithOwnerSubAndInvoice();
    await dunning.onPaymentFailed({
      tenantId: tenant.id,
      invoiceId: invoice.id,
      paymentId: 'p3',
      attempt: 3,
      reason: 'Declined',
    });

    expect(tenantLifecycle.transition).toHaveBeenCalledWith(
      tenant.id,
      'restricted',
      'system:billing',
      'dunning_exhausted',
    );
    const subscription = await subscriptions.getForTenant(tenant.id);
    expect(subscription?.status).toBe('restricted');
    expect(notifications.send).toHaveBeenCalledWith(
      'subscription.restricted',
      expect.anything(),
      expect.objectContaining({ reason: 'dunning_exhausted' }),
      expect.anything(),
    );
    // No 4th retry scheduled.
    expect(billingQueue.add).not.toHaveBeenCalledWith(
      'dunning-charge',
      { invoiceId: invoice.id, attempt: 4 },
      expect.anything(),
    );
  });

  it('onPaymentSucceeded reactivates a restricted tenant (AC6)', async () => {
    const { tenant, invoice } =
      await makeTenantWithOwnerSubAndInvoice('restricted');
    await dunning.onPaymentSucceeded({
      tenantId: tenant.id,
      invoiceId: invoice.id,
      amountMinor: invoice.totalMinor,
      currency: 'NGN',
    });

    expect(tenantLifecycle.transition).toHaveBeenCalledWith(
      tenant.id,
      'active',
      'system:billing',
    );
    const subscription = await subscriptions.getForTenant(tenant.id);
    expect(subscription?.status).toBe('active');
    expect(notifications.send).toHaveBeenCalledWith(
      'invoice.paid',
      expect.anything(),
      expect.anything(),
      expect.anything(),
    );
    expect(notifications.send).toHaveBeenCalledWith(
      'subscription.reactivated',
      expect.anything(),
      expect.anything(),
      expect.anything(),
    );
  });

  it('onPaymentSucceeded for an already-active tenant only sends invoice.paid (no reactivation)', async () => {
    const { tenant, invoice } =
      await makeTenantWithOwnerSubAndInvoice('active');
    await dunning.onPaymentSucceeded({
      tenantId: tenant.id,
      invoiceId: invoice.id,
      amountMinor: invoice.totalMinor,
      currency: 'NGN',
    });
    expect(tenantLifecycle.transition).not.toHaveBeenCalled();
    expect(notifications.send).not.toHaveBeenCalledWith(
      'subscription.reactivated',
      expect.anything(),
      expect.anything(),
      expect.anything(),
    );
  });
});
