import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';

const NIGHTLY_CRON = '0 2 * * *';

/**
 * Registers the repeatable `period-roll` job on boot. BullMQ job schedulers
 * are keyed by id + pattern (see AnomalyModule's SweepSchedulerService for
 * the same pattern) — re-registering on every restart updates rather than
 * duplicates.
 */
@Injectable()
export class BillingPeriodRollScheduler implements OnModuleInit {
  private readonly logger = new Logger(BillingPeriodRollScheduler.name);

  constructor(@InjectQueue('billing') private readonly billingQueue: Queue) {}

  async onModuleInit(): Promise<void> {
    await this.billingQueue.upsertJobScheduler(
      'period-roll',
      { pattern: NIGHTLY_CRON },
      { name: 'period-roll', opts: { removeOnComplete: 5, removeOnFail: 5 } },
    );
    this.logger.log(`registered billing.period-roll on cron '${NIGHTLY_CRON}'`);
  }
}
