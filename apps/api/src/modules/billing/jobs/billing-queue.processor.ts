import { Inject, Injectable, Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { PrismaClient } from '@prisma/client';
import { SubscriptionService } from '../subscription.service';

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
      default:
        this.logger.warn(`unknown billing job: ${job.name}`);
    }
  }

  // T6 scope: marks the event processed so idempotency/observability work
  // end-to-end (BillingWebhooksController dedupes on this row existing).
  // T8's PaymentService.handleWebhook takes over the actual charge.success/
  // charge.failed -> Payment/Invoice side effects.
  private async processWebhook(eventId: string): Promise<void> {
    await this.prisma.gatewayWebhookEvent.update({
      where: { id: eventId },
      data: { processedAt: new Date() },
    });
  }
}
