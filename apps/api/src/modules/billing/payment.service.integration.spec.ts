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
import { PaymentService } from './payment.service';
import { InvoiceService } from './invoice.service';
import { PaymentMethodCipher } from './payment-method.cipher';
import { EventsService } from '../../common/events.service';
import { UsageReadService } from '../metering/usage-read.service';
import type { PaymentGatewayPort } from './payment-gateway.port';

describe('PaymentService integration (real Postgres)', () => {
  let prisma: PrismaClient;
  let schemaName: string;
  let emitter: EventEmitter2;
  let gateway: {
    initialiseTransaction: ReturnType<typeof vi.fn>;
    verifyTransaction: ReturnType<typeof vi.fn>;
    chargeAuthorisation: ReturnType<typeof vi.fn>;
  };
  let payments: PaymentService;
  let invoices: InvoiceService;

  async function makeTenantWithOwnerAndInvoice() {
    const tenant = await prisma.tenant.create({
      data: {
        slug: `pay-test-${Math.random().toString(36).slice(2)}`,
        name: 'Payment Test',
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
    const invoice = await prisma.invoice.create({
      data: {
        tenantId: tenant.id,
        number: `INV-TEST-${Math.random().toString(36).slice(2)}`,
        status: 'issued',
        currency: 'NGN',
        periodStart: new Date(),
        periodEnd: new Date(),
        subtotalMinor: 450_000_0,
        taxMinor: 0,
        totalMinor: 450_000_0,
        attemptCount: 0,
        usageSnapshot: {},
      },
    });
    return { tenant, user, invoice };
  }

  beforeAll(async () => {
    const result = await createTestDatabase('payment-service-integration');
    prisma = result.prisma;
    schemaName = result.schemaName;
    await seedPlans(prisma);
  }, 30000);

  beforeEach(() => {
    emitter = new EventEmitter2();
    gateway = {
      initialiseTransaction: vi.fn().mockResolvedValue({
        checkoutUrl: 'http://fake-pay.local/checkout/ref',
        providerRef: 'ref',
      }),
      verifyTransaction: vi.fn(),
      chargeAuthorisation: vi.fn(),
    };
    invoices = new InvoiceService(
      prisma,
      new EventsService(emitter),
      new UsageReadService(prisma),
    );
    payments = new PaymentService(
      prisma,
      gateway as unknown as PaymentGatewayPort,
      new EventsService(emitter),
      invoices,
      new PaymentMethodCipher(),
    );
  });

  afterAll(async () => {
    await dropTestSchema(schemaName, prisma);
    await disconnectTestHelper();
  });

  it('initialise() creates a pending Payment and returns the checkout URL', async () => {
    const { invoice } = await makeTenantWithOwnerAndInvoice();
    const result = await payments.initialise(invoice.id);
    expect(result.checkoutUrl).toBe('http://fake-pay.local/checkout/ref');

    const payment = await prisma.payment.findFirst({
      where: { invoiceId: invoice.id },
    });
    expect(payment?.status).toBe('pending');
    expect(payment?.amountMinor).toBe(invoice.totalMinor);
    expect(gateway.initialiseTransaction).toHaveBeenCalledWith(
      expect.objectContaining({
        amountMinor: invoice.totalMinor,
        currency: 'NGN',
      }),
    );
  });

  it('handleWebhookEvent(charge.success) marks the payment succeeded, the invoice paid, and stores a reusable PaymentMethod', async () => {
    const { tenant, invoice } = await makeTenantWithOwnerAndInvoice();
    await payments.initialise(invoice.id);
    const payment = await prisma.payment.findFirstOrThrow({
      where: { invoiceId: invoice.id },
    });

    const spy = vi.fn();
    emitter.on('payment.succeeded', spy);

    await payments.handleWebhookEvent({
      type: 'charge.success',
      reference: payment.reference,
      data: {
        id: 1,
        reference: payment.reference,
        status: 'success',
        amount: invoice.totalMinor,
        currency: 'NGN',
        authorization: {
          authorization_code: 'AUTH_test1',
          last4: '4081',
          card_type: 'visa',
          reusable: true,
        },
      },
    });

    const updatedPayment = await prisma.payment.findUniqueOrThrow({
      where: { id: payment.id },
    });
    expect(updatedPayment.status).toBe('succeeded');
    expect(updatedPayment.paymentMethodId).not.toBeNull();

    const updatedInvoice = await prisma.invoice.findUniqueOrThrow({
      where: { id: invoice.id },
    });
    expect(updatedInvoice.status).toBe('paid');

    const method = await prisma.paymentMethod.findFirstOrThrow({
      where: { tenantId: tenant.id },
    });
    expect(method.isDefault).toBe(true); // first method for the tenant
    expect(method.authorizationCode).not.toBe('AUTH_test1'); // encrypted at rest

    expect(spy).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: tenant.id, invoiceId: invoice.id }),
    );
  });

  it('is idempotent: a second charge.success for the same reference is a no-op', async () => {
    const { invoice } = await makeTenantWithOwnerAndInvoice();
    await payments.initialise(invoice.id);
    const payment = await prisma.payment.findFirstOrThrow({
      where: { invoiceId: invoice.id },
    });
    const webhook = {
      type: 'charge.success',
      reference: payment.reference,
      data: {
        id: 1,
        reference: payment.reference,
        status: 'success',
        amount: invoice.totalMinor,
        currency: 'NGN',
      },
    };

    await payments.handleWebhookEvent(webhook);
    const spy = vi.fn();
    emitter.on('payment.succeeded', spy);
    await payments.handleWebhookEvent(webhook); // replay

    expect(spy).not.toHaveBeenCalled(); // no-op: no second event, no re-processing
    const count = await prisma.payment.count({
      where: { reference: payment.reference },
    });
    expect(count).toBe(1); // no duplicate Payment row (AC7)
  });

  it('handleWebhookEvent(charge.failed) increments the invoice attemptCount and emits payment.failed', async () => {
    const { invoice } = await makeTenantWithOwnerAndInvoice();
    await payments.initialise(invoice.id);
    const payment = await prisma.payment.findFirstOrThrow({
      where: { invoiceId: invoice.id },
    });

    const spy = vi.fn();
    emitter.on('payment.failed', spy);
    await payments.handleWebhookEvent({
      type: 'charge.failed',
      reference: payment.reference,
      data: {
        reference: payment.reference,
        status: 'failed',
        amount: invoice.totalMinor,
        currency: 'NGN',
        gateway_response: 'Declined',
      },
    });

    const updated = await prisma.payment.findUniqueOrThrow({
      where: { id: payment.id },
    });
    expect(updated.status).toBe('failed');
    expect(updated.failureReason).toBe('Declined');

    const updatedInvoice = await prisma.invoice.findUniqueOrThrow({
      where: { id: invoice.id },
    });
    expect(updatedInvoice.attemptCount).toBe(1);
    expect(spy).toHaveBeenCalledWith(
      expect.objectContaining({ attempt: 1, reason: 'Declined' }),
    );
  });

  it('chargeAuthorisation() decrypts the stored authorization code and charges the default method', async () => {
    const { tenant, invoice } = await makeTenantWithOwnerAndInvoice();
    await payments.initialise(invoice.id);
    const initialPayment = await prisma.payment.findFirstOrThrow({
      where: { invoiceId: invoice.id },
    });
    await payments.handleWebhookEvent({
      type: 'charge.success',
      reference: initialPayment.reference,
      data: {
        id: 1,
        reference: initialPayment.reference,
        status: 'success',
        amount: invoice.totalMinor,
        currency: 'NGN',
        authorization: {
          authorization_code: 'AUTH_recurring1',
          last4: '4081',
          card_type: 'visa',
          reusable: true,
        },
      },
    });

    gateway.chargeAuthorisation.mockResolvedValue({
      status: 'success',
      providerRef: 'rec-1',
    });
    const secondInvoice = await prisma.invoice.create({
      data: {
        tenantId: tenant.id,
        number: `INV-TEST2-${Math.random().toString(36).slice(2)}`,
        status: 'issued',
        currency: 'NGN',
        periodStart: new Date(),
        periodEnd: new Date(),
        subtotalMinor: 100_000,
        taxMinor: 0,
        totalMinor: 100_000,
        attemptCount: 0,
        usageSnapshot: {},
      },
    });

    await payments.chargeAuthorisation(secondInvoice.id);

    expect(gateway.chargeAuthorisation).toHaveBeenCalledWith(
      expect.objectContaining({ authorizationCode: 'AUTH_recurring1' }), // decrypted
    );
    const updatedSecondInvoice = await prisma.invoice.findUniqueOrThrow({
      where: { id: secondInvoice.id },
    });
    expect(updatedSecondInvoice.status).toBe('paid');
  });
});
