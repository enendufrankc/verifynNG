import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { BadRequestException, ConflictException } from '@nestjs/common';
import type { PrismaClient } from '@prisma/client';
import {
  createTestDatabase,
  dropTestSchema,
  disconnectTestHelper,
  seedPlans,
} from '@verifynng/db';
import { PlatformSubscriptionsController } from './platform-subscriptions.controller';
import { InvoiceService } from './invoice.service';
import { PaymentService } from './payment.service';
import { PaymentMethodCipher } from './payment-method.cipher';
import { EventsService } from '../../common/events.service';
import { UsageReadService } from '../metering/usage-read.service';
import { BillingClock } from './billing-clock.service';
import type { PaymentGatewayPort } from './payment-gateway.port';

describe('PlatformSubscriptionsController integration (real Postgres, T12)', () => {
  let prisma: PrismaClient;
  let schemaName: string;
  let emitter: EventEmitter2;
  let invoices: InvoiceService;
  let payments: PaymentService;
  let controller: PlatformSubscriptionsController;

  async function makeTenantWithPlan(
    slug: string,
    planCode: string,
    status: 'trialing' | 'active' | 'restricted' = 'active',
  ) {
    const tenant = await prisma.tenant.create({
      data: { slug, name: `Tenant ${slug}`, status: 'active' },
    });
    const plan = await prisma.plan.findUniqueOrThrow({
      where: { code: planCode },
    });
    await prisma.subscription.create({
      data: {
        tenantId: tenant.id,
        planId: plan.id,
        status,
        currency: 'NGN',
        currentPeriodStart: new Date(Date.UTC(2026, 7, 1)),
        currentPeriodEnd: new Date(Date.UTC(2026, 8, 1)),
      },
    });
    return tenant.id;
  }

  beforeAll(async () => {
    const result = await createTestDatabase(
      'platform-subscriptions-controller',
    );
    prisma = result.prisma;
    schemaName = result.schemaName;
    await seedPlans(prisma);
    emitter = new EventEmitter2();
    const events = new EventsService(emitter);
    invoices = new InvoiceService(
      prisma,
      events,
      new UsageReadService(prisma),
      new BillingClock(),
    );
    const gateway: PaymentGatewayPort = {
      initialiseTransaction: async () => ({
        checkoutUrl: 'unused',
        providerRef: 'unused',
      }),
      verifyTransaction: async () => ({
        status: 'pending',
        amountMinor: 0,
        currency: 'NGN',
      }),
      chargeAuthorisation: async () => ({
        status: 'failed',
        providerRef: 'unused',
      }),
      verifyWebhookSignature: () => true,
      parseWebhook: () => ({ type: 'unused', reference: 'unused', data: {} }),
    };
    payments = new PaymentService(
      prisma,
      gateway,
      events,
      invoices,
      new PaymentMethodCipher(),
    );
    controller = new PlatformSubscriptionsController(
      prisma,
      invoices,
      payments,
    );
  }, 30000);

  afterAll(async () => {
    await dropTestSchema(schemaName, prisma);
    await disconnectTestHelper();
  });

  it('lists subscriptions across tenants with tenant name/slug, MRR, and overdue amount', async () => {
    const starterTenantId = await makeTenantWithPlan('platform-t1', 'starter');
    await makeTenantWithPlan('platform-t2', 'growth', 'restricted');

    const overdueInvoice = await prisma.invoice.create({
      data: {
        tenantId: starterTenantId,
        number: `INV-OVERDUE-${Math.random().toString(36).slice(2)}`,
        status: 'issued',
        currency: 'NGN',
        periodStart: new Date(Date.UTC(2026, 6, 1)),
        periodEnd: new Date(Date.UTC(2026, 7, 1)),
        subtotalMinor: 4_500_000,
        taxMinor: 0,
        totalMinor: 4_500_000,
        issuedAt: new Date(Date.UTC(2026, 6, 1)),
        dueAt: new Date(Date.UTC(2026, 6, 8)), // long past
        attemptCount: 0,
        usageSnapshot: {},
      },
    });

    const rows = await controller.list();
    const starterRow = rows.find((r) => r.tenantId === starterTenantId);
    expect(starterRow).toBeDefined();
    expect(starterRow!.tenantSlug).toBe('platform-t1');
    expect(starterRow!.planCode).toBe('starter');
    expect(starterRow!.mrrMinor).toBe(4_500_000); // starter's monthly NGN fee
    expect(starterRow!.overdueMinor).toBe(4_500_000);
    expect(starterRow!.overdueInvoiceId).toBe(overdueInvoice.id);

    const restrictedRow = rows.find((r) => r.status === 'restricted');
    expect(restrictedRow).toBeDefined();
    expect(restrictedRow!.planCode).toBe('growth');
  });

  it('filters by status', async () => {
    await makeTenantWithPlan('platform-t3', 'starter', 'trialing');
    const rows = await controller.list('trialing');
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.status === 'trialing')).toBe(true);
  });

  it('mark-paid requires a non-empty reason', async () => {
    const tenantId = await makeTenantWithPlan('platform-t4', 'starter');
    const invoice = await prisma.invoice.create({
      data: {
        tenantId,
        number: `INV-MP-${Math.random().toString(36).slice(2)}`,
        status: 'issued',
        currency: 'NGN',
        periodStart: new Date(),
        periodEnd: new Date(),
        subtotalMinor: 100,
        taxMinor: 0,
        totalMinor: 100,
        attemptCount: 0,
        usageSnapshot: {},
      },
    });
    expect(() => controller.markPaid(invoice.id, {})).toThrow(
      BadRequestException,
    );
    expect(() => controller.markPaid(invoice.id, { reason: '   ' })).toThrow(
      BadRequestException,
    );
  });

  it('mark-paid settles the invoice with a reason, reactivating a restricted subscription', async () => {
    const tenantId = await makeTenantWithPlan(
      'platform-t5',
      'starter',
      'restricted',
    );
    const invoice = await prisma.invoice.create({
      data: {
        tenantId,
        number: `INV-MP2-${Math.random().toString(36).slice(2)}`,
        status: 'issued',
        currency: 'NGN',
        periodStart: new Date(),
        periodEnd: new Date(),
        subtotalMinor: 4_500_000,
        taxMinor: 0,
        totalMinor: 4_500_000,
        attemptCount: 0,
        usageSnapshot: {},
      },
    });

    const updated = await controller.markPaid(invoice.id, {
      reason: 'Bank transfer confirmed by finance',
    });
    expect(updated.status).toBe('paid');

    const payment = await prisma.payment.findFirstOrThrow({
      where: { invoiceId: invoice.id },
    });
    expect(payment.provider).toBe('manual');
    expect(payment.status).toBe('succeeded');
    expect((payment.rawResponse as { reason: string }).reason).toBe(
      'Bank transfer confirmed by finance',
    );
  });

  it('mark-paid rejects an invoice that is not issued (e.g. still draft)', async () => {
    const tenantId = await makeTenantWithPlan('platform-t6', 'starter');
    const draft = await prisma.invoice.create({
      data: {
        tenantId,
        number: `INV-DRAFT-${Math.random().toString(36).slice(2)}`,
        status: 'draft',
        currency: 'NGN',
        periodStart: new Date(),
        periodEnd: new Date(),
        subtotalMinor: 100,
        taxMinor: 0,
        totalMinor: 100,
        attemptCount: 0,
        usageSnapshot: {},
      },
    });
    await expect(
      controller.markPaid(draft.id, { reason: 'test' }),
    ).rejects.toThrow(ConflictException);
  });

  it("invoicesForTenant returns that tenant's invoices", async () => {
    const tenantId = await makeTenantWithPlan('platform-t7', 'starter');
    await prisma.invoice.create({
      data: {
        tenantId,
        number: `INV-T7-${Math.random().toString(36).slice(2)}`,
        status: 'issued',
        currency: 'NGN',
        periodStart: new Date(),
        periodEnd: new Date(),
        subtotalMinor: 100,
        taxMinor: 0,
        totalMinor: 100,
        attemptCount: 0,
        usageSnapshot: {},
      },
    });
    const result = await controller.invoicesForTenant(tenantId);
    expect(result.invoices).toHaveLength(1);
  });
});
