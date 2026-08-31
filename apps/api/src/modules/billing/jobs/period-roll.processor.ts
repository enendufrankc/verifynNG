import { Injectable } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { SubscriptionService } from '../subscription.service';

@Processor('billing', { concurrency: 1 })
@Injectable()
export class BillingPeriodRollProcessor extends WorkerHost {
  constructor(private readonly subscriptions: SubscriptionService) {
    super();
  }

  async process(job: Job): Promise<void> {
    if (job.name !== 'period-roll') return;
    await this.subscriptions.runPeriodRoll();
  }
}
