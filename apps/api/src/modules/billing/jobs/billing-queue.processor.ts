import { Inject, Injectable, Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { PrismaClient } from '@prisma/client';
import { SubscriptionService } from '../subscription.service';
import { PaymentService } from '../payment.service';
import { DunningService } from '../dunning.service';

/**
 * Single consumer for the 'billing' queue — BullMQ (and @nestjs/bullmq)
 * runs one Worker per queue name per process, so every billing job type
 * dispatches through here by `job.name` rather than each having its own
 * `@Processor('billing')` class (which would register two competing
 * workers on the same queue).
 */
@Processor('billing', { concurrency: 1 })
@Injectable()
export class BillingQueueProcessor extends WorkerHost {
  private readonly logger = new Logger(BillingQueueProcessor.name);

  constructor(
    private readonly subscriptions: SubscriptionService,
    @Inject('PRISMA') private readonly prisma: PrismaClient,
    @Inject(PaymentService) private readonly payments: PaymentService,
    @Inject(DunningService) private readonly dunning: DunningService,
  ) {
    super();
  }

  async process(job: Job): Promise<void> {
    switch (job.name) {
      case 'period-roll':
        await this.subscriptions.runPeriodRoll();
        return;
      case 'process-webhook':
        await this.processWebhook(job.data.eventId as string);
        return;
      case 'dunning-charge':
        await this.dunning.runScheduledCharge(job.data.invoiceId as string);
        return;
      case 'dunning-reminder':
        await this.dunning.runReminder(job.data.invoiceId as string);
        return;
      default:
        this.logger.warn(`unknown billing job: ${job.name}`);
    }
  }

  private async processWebhook(eventId: string): Promise<void> {
    const event = await this.prisma.gatewayWebhookEvent.findUnique({
      where: { id: eventId },
    });
    if (!event) {
      this.logger.warn(
        `process-webhook: no GatewayWebhookEvent for ${eventId}`,
      );
      return;
    }
    // rawBody is the full original payload ({event, data}), not just the
    // `data` sub-object — see BillingWebhooksController's gatewayWebhookEvent.create.
    const body = event.rawBody as { data?: unknown };
    await this.payments.handleWebhookEvent({
      type: event.type,
      reference: event.reference ?? '',
      data: body?.data,
    });
    await this.prisma.gatewayWebhookEvent.update({
      where: { id: eventId },
      data: { processedAt: new Date() },
    });
  }
}
