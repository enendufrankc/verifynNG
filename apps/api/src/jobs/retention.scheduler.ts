import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue, Worker } from 'bullmq';
import { RetentionRunnerService } from '../modules/retention/retention-runner.service';

export const RETENTION_QUEUE_NAME = 'retention';

/**
 * First repeatable/cron-style BullMQ job in this codebase — every other
 * queue here is one-shot (mint, batch-exports, tenant-offboarding, dsar).
 * Uses the standard BullMQ `repeat: { pattern }` API; no other precedent to
 * match against.
 */
@Injectable()
export class RetentionScheduler implements OnModuleInit, OnModuleDestroy {
  private readonly queue: Queue;
  private readonly worker?: Worker;

  constructor(
    config: ConfigService,
    private readonly runner: RetentionRunnerService,
  ) {
    const connection = {
      url: config.get<string>('REDIS_URL'),
      maxRetriesPerRequest: null,
    };
    this.queue = new Queue(RETENTION_QUEUE_NAME, { connection });
    if (config.get<boolean>('WORKER_INLINE', true)) {
      this.worker = new Worker(
        RETENTION_QUEUE_NAME,
        async () => {
          const dryRun = config.get<boolean>(
            'RETENTION_DRY_RUN_DEFAULT',
            false,
          );
          await this.runner.run({ dryRun, triggeredBy: 'schedule' });
        },
        { connection },
      );
    }
  }

  async onModuleInit(): Promise<void> {
    await this.queue.upsertJobScheduler('retention-nightly', {
      pattern: this.cronPattern(),
    });
  }

  private cronPattern(): string {
    return process.env.RETENTION_CRON || '0 2 * * *';
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker?.close();
    await this.queue.close();
  }
}
