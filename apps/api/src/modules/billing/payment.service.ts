import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Payment, PaymentMethod, PrismaClient } from '@prisma/client';
import { loadEnv } from '@verifynng/config';
import { EventsService } from '../../common/events.service';
import { InvoiceService } from './invoice.service';
import {
  PAYMENT_GATEWAY_PORT,
  type PaymentGatewayPort,
} from './payment-gateway.port';
import { PaymentMethodCipher } from './payment-method.cipher';

interface WebhookAuthorization {
  authorization_code?: string;
  last4?: string;
  card_type?: string;
  brand?: string;
  reusable?: boolean;
}
interface WebhookTransactionData {
  id?: number | string;
  reference: string;
  status: string;
  amount: number;
  currency: string;
  gateway_response?: string;
  authorization?: WebhookAuthorization;
}

@Injectable()
export class PaymentService {
  private readonly logger = new Logger(PaymentService.name);

  constructor(
    @Inject('PRISMA') private readonly prisma: PrismaClient,
    @Inject(PAYMENT_GATEWAY_PORT) private readonly gateway: PaymentGatewayPort,
    @Inject(EventsService) private readonly events: EventsService,
    @Inject(InvoiceService) private readonly invoices: InvoiceService,
    @Inject(PaymentMethodCipher) private readonly cipher: PaymentMethodCipher,
  ) {}

  private async ownerEmail(tenantId: string): Promise<string> {
    const owner = await this.prisma.membership.findFirst({
      where: { tenantId, role: 'owner' },
      include: { user: true },
    });
    if (owner) return owner.user.email;
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
    });
    if (tenant?.supportEmail) return tenant.supportEmail;
    throw new NotFoundException('no_billable_email_for_tenant');
  }

  async initialise(invoiceId: string): Promise<{ checkoutUrl: string }> {
    const invoice = await this.prisma.invoice.findUniqueOrThrow({
      where: { id: invoiceId },
    });
    const email = await this.ownerEmail(invoice.tenantId);
    const reference = `pay_${invoice.id}_${Date.now()}`;
    const provider = loadEnv().PAYMENT_GATEWAY === 'fake' ? 'fake' : 'paystack';

    const payment = await this.prisma.payment.create({
      data: {
        tenantId: invoice.tenantId,
        invoiceId: invoice.id,
        provider,
        reference,
        status: 'pending',
        amountMinor: invoice.totalMinor,
        currency: invoice.currency,
      },
    });

    const session = await this.gateway.initialiseTransaction({
      reference,
      amountMinor: invoice.totalMinor,
      currency: invoice.currency,
      email,
      callbackUrl: `${loadEnv().APP_BASE_URL}/billing`,
      metadata: { tenantId: invoice.tenantId, invoiceId: invoice.id },
    });

    await this.prisma.payment.update({
      where: { id: payment.id },
      data: { providerRef: session.providerRef },
    });

    return { checkoutUrl: session.checkoutUrl };
  }

  /** Polls the gateway directly (used by the web-admin return-from-checkout page as a fallback to the webhook). */
  async verify(reference: string): Promise<Payment> {
    const result = await this.gateway.verifyTransaction(reference);
    if (result.status === 'success') {
      return this.markSucceeded(reference, {
        amountMinor: result.amountMinor,
        authorizationCode: result.authorizationCode,
        cardLast4: result.cardLast4,
        cardBrand: result.cardBrand,
        reusable: true,
      });
    }
    if (result.status === 'failed') {
      return this.markFailed(reference, 'gateway_reported_failed');
    }
    return this.prisma.payment.findUniqueOrThrow({ where: { reference } });
  }

  /**
   * Called by BillingQueueProcessor's `process-webhook` job with the
   * already-verified, already-stored GatewayWebhookEvent — not the raw
   * `(rawBody, signature)` pair the epic doc's "Exposes" section sketches.
   * Signature verification and GatewayWebhookEvent dedup both happen once,
   * synchronously, in BillingWebhooksController (T6) before this job is
   * even enqueued; re-deriving `{type, reference, data}` from a DB-stored
   * JSON copy of the raw body a second time here would just repeat work
   * the controller already did, not add a real signature check (the
   * original signature header isn't persisted).
   */
  async handleWebhookEvent(event: {
    type: string;
    reference: string;
    data: unknown;
  }): Promise<void> {
    const data = event.data as WebhookTransactionData;
    if (event.type === 'charge.success') {
      await this.markSucceeded(event.reference, {
        amountMinor: data.amount,
        authorizationCode: data.authorization?.authorization_code,
        cardLast4: data.authorization?.last4,
        cardBrand: data.authorization?.card_type ?? data.authorization?.brand,
        reusable: data.authorization?.reusable ?? false,
      });
    } else if (event.type === 'charge.failed') {
      await this.markFailed(
        event.reference,
        data.gateway_response ?? 'charge_failed',
      );
    } else {
      this.logger.log(`ignoring webhook event type ${event.type}`);
    }
  }

  async chargeAuthorisation(invoiceId: string): Promise<Payment> {
    const invoice = await this.prisma.invoice.findUniqueOrThrow({
      where: { id: invoiceId },
    });
    const method = await this.prisma.paymentMethod.findFirst({
      where: { tenantId: invoice.tenantId, isDefault: true, revokedAt: null },
    });
    if (!method) {
      throw new NotFoundException('no_default_payment_method');
    }
    const email = await this.ownerEmail(invoice.tenantId);
    const reference = `pay_${invoice.id}_${Date.now()}`;

    const payment = await this.prisma.payment.create({
      data: {
        tenantId: invoice.tenantId,
        invoiceId: invoice.id,
        provider: method.provider,
        reference,
        status: 'pending',
        amountMinor: invoice.totalMinor,
        currency: invoice.currency,
        paymentMethodId: method.id,
      },
    });

    const result = await this.gateway.chargeAuthorisation({
      authorizationCode: this.cipher.decrypt(method.authorizationCode),
      email,
      amountMinor: invoice.totalMinor,
      currency: invoice.currency,
      reference,
    });

    if (result.status === 'success') {
      return this.markSucceeded(reference, {
        amountMinor: invoice.totalMinor,
      });
    }
    return this.markFailed(
      reference,
      result.failureReason ?? 'charge_failed',
      payment.id,
    );
  }

  private async markSucceeded(
    reference: string,
    info: {
      amountMinor?: number;
      authorizationCode?: string;
      cardLast4?: string;
      cardBrand?: string;
      reusable?: boolean;
    },
  ): Promise<Payment> {
    const payment = await this.prisma.payment.findUnique({
      where: { reference },
    });
    if (!payment) {
      this.logger.warn(`payment.succeeded for unknown reference ${reference}`);
      throw new NotFoundException('payment_not_found_for_reference');
    }
    // Idempotent: a second charge.success for the same reference is a no-op.
    if (payment.status === 'succeeded') return payment;

    let paymentMethodId = payment.paymentMethodId ?? undefined;
    if (info.authorizationCode && info.reusable) {
      paymentMethodId = await this.storePaymentMethod(
        payment.tenantId,
        payment.provider,
        {
          authorizationCode: info.authorizationCode,
          cardBrand: info.cardBrand,
          cardLast4: info.cardLast4,
        },
      );
    }

    const updated = await this.prisma.payment.update({
      where: { id: payment.id },
      data: { status: 'succeeded', paymentMethodId },
    });

    await this.invoices.markPaid(payment.invoiceId, payment.id);
    await this.events.emit('payment.succeeded', {
      tenantId: payment.tenantId,
      invoiceId: payment.invoiceId,
      paymentId: payment.id,
      amountMinor: info.amountMinor ?? payment.amountMinor,
      currency: payment.currency,
      provider: payment.provider,
    });
    return updated;
  }

  private async markFailed(
    reference: string,
    reason: string,
    knownPaymentId?: string,
  ): Promise<Payment> {
    const payment =
      (knownPaymentId
        ? await this.prisma.payment.findUnique({
            where: { id: knownPaymentId },
          })
        : await this.prisma.payment.findUnique({ where: { reference } })) ??
      (() => {
        throw new NotFoundException('payment_not_found_for_reference');
      })();
    if (payment.status === 'failed') return payment; // idempotent
    const updated = await this.prisma.payment.update({
      where: { id: payment.id },
      data: { status: 'failed', failureReason: reason },
    });

    const invoice = await this.prisma.invoice.findUniqueOrThrow({
      where: { id: payment.invoiceId },
    });
    const attemptCount = invoice.attemptCount + 1;
    await this.prisma.invoice.update({
      where: { id: invoice.id },
      data: { attemptCount },
    });

    await this.events.emit('payment.failed', {
      tenantId: payment.tenantId,
      invoiceId: payment.invoiceId,
      paymentId: payment.id,
      attempt: attemptCount,
      reason,
    });
    return updated;
  }

  private async storePaymentMethod(
    tenantId: string,
    provider: Payment['provider'],
    info: { authorizationCode: string; cardBrand?: string; cardLast4?: string },
  ): Promise<string> {
    // authorizationCode is encrypted at rest, so dedup can't be a direct
    // WHERE match — decrypt the (few, per-tenant) existing rows and compare.
    const candidates = await this.prisma.paymentMethod.findMany({
      where: { tenantId, revokedAt: null },
    });
    const existing = candidates.find(
      (c) =>
        this.cipher.decrypt(c.authorizationCode) === info.authorizationCode,
    );
    if (existing) return existing.id;

    const hasDefault = candidates.some((c) => c.isDefault);
    const method: PaymentMethod = await this.prisma.paymentMethod.create({
      data: {
        tenantId,
        provider,
        authorizationCode: this.cipher.encrypt(info.authorizationCode),
        cardBrand: info.cardBrand,
        cardLast4: info.cardLast4,
        isDefault: !hasDefault,
      },
    });
    return method.id;
  }
}
