import { Inject, Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { loadEnv } from '@verifynng/config';
import { PrismaClient } from '@prisma/client';
import { PaymentService } from './payment.service';
import { SubscriptionService } from './subscription.service';
import { InvoiceService } from './invoice.service';
import { BillingClock } from './billing-clock.service';
import { IllegalSubscriptionTransition } from './errors';
import { NotificationService } from '../notifications/notifications.service';
import { formatMinor } from './currency.util';

/**
 * Reads BILLING_DUNNING_SCHEDULE_DAYS ("1,3,7") as the delay-in-days
 * between successive retry attempts after the first charge fails.
 * AC5 expects exactly 3 payment.failed events before restriction, so only
 * the first two schedule entries are ever used as *retry* delays — the
 * third scheduled attempt is the one whose failure exhausts the schedule.
 */
function retrySchedule(): number[] {
  return loadEnv()
    .BILLING_DUNNING_SCHEDULE_DAYS.split(',')
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isFinite(n) && n > 0);
}

const MAX_ATTEMPTS = 3;

@Injectable()
export class DunningService {
  private readonly logger = new Logger(DunningService.name);

  constructor(
    @Inject('PRISMA') private readonly prisma: PrismaClient,
    @Inject(PaymentService) private readonly payments: PaymentService,
    @Inject(SubscriptionService)
    private readonly subscriptions: SubscriptionService,
    @Inject(InvoiceService) private readonly invoices: InvoiceService,
    @Inject(BillingClock) private readonly clock: BillingClock,
    @Inject(NotificationService)
    private readonly notifications: NotificationService,
    @InjectQueue('billing') private readonly billingQueue: Queue,
  ) {}

  private async ownerRecipient(
    tenantId: string,
  ): Promise<{ email: string; userId: string } | null> {
    const owner = await this.prisma.membership.findFirst({
      where: { tenantId, role: 'owner' },
      include: { user: true },
    });
    return owner ? { email: owner.user.email, userId: owner.user.id } : null;
  }

  @OnEvent('invoice.issued')
  async onInvoiceIssued(payload: {
    tenantId: string;
    invoiceId: string;
    number: string;
    currency: 'NGN' | 'GBP';
    totalMinor: number;
    dueAt: string;
  }): Promise<void> {
    const owner = await this.ownerRecipient(payload.tenantId);
    const dashboardUrl = `${loadEnv().APP_BASE_URL}/billing/invoices/${payload.invoiceId}`;
    if (owner) {
      await this.notifications.send(
        'invoice.issued',
        { email: owner.email, userId: owner.userId },
        {
          invoiceNumber: payload.number,
          amount: formatMinor(payload.totalMinor, payload.currency),
          dueDate: payload.dueAt.slice(0, 10),
          dashboardUrl,
        },
        { tenantId: payload.tenantId },
      );
    }

    const method = await this.prisma.paymentMethod.findFirst({
      where: { tenantId: payload.tenantId, isDefault: true, revokedAt: null },
    });
    const dueAt = new Date(payload.dueAt);
    if (method) {
      await this.scheduleCharge(payload.invoiceId, dueAt, 1);
    }
    const reminderAt = new Date(dueAt.getTime() - this.clock.daysToMs(2));
    if (reminderAt.getTime() > this.clock.now().getTime()) {
      await this.billingQueue.add(
        'dunning-reminder',
        { invoiceId: payload.invoiceId },
        {
          delay: reminderAt.getTime() - this.clock.now().getTime(),
          jobId: `invoice-${payload.invoiceId}-reminder`,
        },
      );
    }
  }

  private async scheduleCharge(
    invoiceId: string,
    at: Date,
    attempt: number,
  ): Promise<void> {
    const delay = Math.max(0, at.getTime() - this.clock.now().getTime());
    await this.billingQueue.add(
      'dunning-charge',
      { invoiceId, attempt },
      { delay, jobId: `invoice-${invoiceId}-attempt-${attempt}` },
    );
  }

  /** Called by BillingQueueProcessor for the 'dunning-charge' job. */
  async runScheduledCharge(invoiceId: string): Promise<void> {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id: invoiceId },
    });
    if (!invoice || invoice.status === 'paid' || invoice.status === 'void')
      return;
    try {
      await this.payments.chargeAuthorisation(invoiceId);
    } catch (err) {
      this.logger.warn(
        `dunning charge attempt failed to even run for invoice ${invoiceId}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }

  /** Called by BillingQueueProcessor for the 'dunning-reminder' job. */
  async runReminder(invoiceId: string): Promise<void> {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id: invoiceId },
    });
    if (!invoice || invoice.status === 'paid' || invoice.status === 'void')
      return;
    const owner = await this.ownerRecipient(invoice.tenantId);
    if (!owner) return;
    await this.notifications.send(
      'invoice.due',
      { email: owner.email, userId: owner.userId },
      {
        invoiceNumber: invoice.number,
        amount: formatMinor(invoice.totalMinor, invoice.currency),
        dueDate: (invoice.dueAt ?? invoice.createdAt)
          .toISOString()
          .slice(0, 10),
        dashboardUrl: `${loadEnv().APP_BASE_URL}/billing/invoices/${invoice.id}`,
      },
      { tenantId: invoice.tenantId },
    );
  }

  @OnEvent('payment.failed')
  async onPaymentFailed(payload: {
    tenantId: string;
    invoiceId: string;
    paymentId: string;
    attempt: number;
    reason: string;
  }): Promise<void> {
    const invoice = await this.prisma.invoice.findUniqueOrThrow({
      where: { id: payload.invoiceId },
    });
    const owner = await this.ownerRecipient(payload.tenantId);
    if (owner) {
      await this.notifications.send(
        'invoice.failed',
        { email: owner.email, userId: owner.userId },
        {
          invoiceNumber: invoice.number,
          amount: formatMinor(invoice.totalMinor, invoice.currency),
          reason: payload.reason,
          retryUrl: `${loadEnv().APP_BASE_URL}/billing/invoices/${invoice.id}`,
        },
        {
          tenantId: payload.tenantId,
          // OutboxService's default idempotency key is derived from
          // (templateId, recipient, data) — three genuine dunning attempts
          // send the same template to the same owner with the same
          // {invoiceNumber, amount, reason} (nothing in the data payload
          // varies between attempts), so without an explicit key here the
          // 2nd and 3rd `invoice.failed` emails were silently deduped as
          // "the same notification" and never sent. Found live: AC5's
          // "three invoice.failed emails in Mailpit" produced only one.
          idempotencyKey: `invoice.failed:${invoice.id}:attempt:${payload.attempt}`,
        },
      );
    }

    if (payload.attempt >= MAX_ATTEMPTS) {
      try {
        await this.subscriptions.transition(
          payload.tenantId,
          'restricted',
          'dunning_exhausted',
        );
      } catch (err) {
        if (!(err instanceof IllegalSubscriptionTransition)) throw err;
        this.logger.warn(
          `dunning exhausted for tenant ${payload.tenantId} but subscription couldn't move to restricted: ${err.message}`,
        );
      }
      if (owner) {
        await this.notifications.send(
          'subscription.restricted',
          { email: owner.email, userId: owner.userId },
          {
            reason: 'dunning_exhausted',
            dashboardUrl: `${loadEnv().APP_BASE_URL}/billing`,
          },
          {
            tenantId: payload.tenantId,
            // Same dedup gotcha as invoice.failed above — a tenant
            // restricted more than once over its lifetime (different
            // billing cycles) would send this identical payload every
            // time and only the first would ever go out.
            idempotencyKey: `subscription.restricted:${payload.tenantId}:${payload.invoiceId}`,
          },
        );
      }
      return;
    }

    const schedule = retrySchedule();
    const delayDays =
      schedule[payload.attempt - 1] ?? schedule[schedule.length - 1] ?? 1;
    await this.scheduleCharge(
      payload.invoiceId,
      this.clock.addDays(this.clock.now(), delayDays),
      payload.attempt + 1,
    );
  }

  @OnEvent('payment.succeeded')
  async onPaymentSucceeded(payload: {
    tenantId: string;
    invoiceId: string;
    amountMinor: number;
    currency: 'NGN' | 'GBP';
  }): Promise<void> {
    const invoice = await this.prisma.invoice.findUniqueOrThrow({
      where: { id: payload.invoiceId },
    });
    const owner = await this.ownerRecipient(payload.tenantId);
    if (owner) {
      await this.notifications.send(
        'invoice.paid',
        { email: owner.email, userId: owner.userId },
        {
          invoiceNumber: invoice.number,
          amount: formatMinor(payload.amountMinor, payload.currency),
          paidAt: this.clock.now().toISOString(),
        },
        { tenantId: payload.tenantId },
      );
    }

    const subscription = await this.subscriptions.getForTenant(
      payload.tenantId,
    );
    if (subscription?.status === 'restricted') {
      await this.subscriptions.transition(payload.tenantId, 'active');
      if (owner) {
        await this.notifications.send(
          'subscription.reactivated',
          { email: owner.email, userId: owner.userId },
          { at: this.clock.now().toISOString() },
          { tenantId: payload.tenantId },
        );
      }
    }
  }
}
