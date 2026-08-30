import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { loadEnv } from '@verifynng/config';

/**
 * Registers the two repeatable sweep jobs on boot. BullMQ repeatable jobs
 * are keyed by name + repeat options, so re-registering the same pattern on
 * every restart is idempotent — it does not create duplicates.
 */
@Injectable()
export class SweepSchedulerService implements OnModuleInit {
  private readonly logger = new Logger(SweepSchedulerService.name);

  constructor(@InjectQueue('anomaly') private readonly anomalyQueue: Queue) {}

  async onModuleInit(): Promise<void> {
    const pattern = loadEnv().ANOMALY_SWEEP_CRON;
    for (const name of ['sweep:geo_dispersion', 'sweep:dead_code']) {
      // BullMQ v6's job schedulers (not the deprecated `add(..., {repeat})`)
      // are keyed by `jobSchedulerId` — re-registering the same id+pattern on
      // every boot updates the existing scheduler rather than duplicating it.
      await this.anomalyQueue.upsertJobScheduler(
        name,
        { pattern },
        { name, opts: { removeOnComplete: 5, removeOnFail: 5 } },
      );
    }
    this.logger.log(`registered anomaly sweeps on cron '${pattern}'`);
  }
}
