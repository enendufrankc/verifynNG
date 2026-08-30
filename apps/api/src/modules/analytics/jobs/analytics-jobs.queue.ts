import {
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Job, Queue, Worker } from 'bullmq';
import { ScanRollupJobService } from './scan-rollup.service';
import { ReconcileService } from './reconcile.service';
import { MeteringMonthCloseService } from '../../metering/jobs/month-close.service';
import { PageEventsService } from '../page-events/page-events.service';

export const ANALYTICS_QUEUE_NAME = 'analytics';

const JOB_NAMES = {
  rollupIncremental: 'rollup.incremental',
  rollupReconcile: 'rollup.reconcile',
  meteringUpsertMonth: 'metering.upsert-month',
  meteringMonthClose: 'metering.month-close',
  pageviewsFlush: 'pageviews.flush',
} as const;

/**
 * Schedules E12's repeatable jobs on BullMQ and, when WORKER_INLINE (the same
 * flag every other module's inline-worker gate uses), runs a worker for them
 * in this process. Raw bullmq Queue+Worker — same shape as
 * jobs/tenant-offboarding.queue.ts — rather than adding queues to the shared
 * jobs/bullmq.module.ts registry, to keep this self-contained inside E12's
 * owned paths.
 */
@Injectable()
export class AnalyticsJobsQueue implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AnalyticsJobsQueue.name);
  private readonly queue: Queue;
  private readonly worker?: Worker;

  constructor(
    // All explicit @Inject(...) — see RollupCountersSubscriber's constructor
    // comment: esbuild (jobs:run's tsx) doesn't reliably emit
    // design:paramtypes for a 5+ parameter constructor with none decorated;
    // nest build (tsc) has no such issue.
    @Inject(ConfigService) private readonly config: ConfigService,
    @Inject(ScanRollupJobService)
    private readonly scanRollup: ScanRollupJobService,
    @Inject(ReconcileService) private readonly reconcile: ReconcileService,
    @Inject(MeteringMonthCloseService)
    private readonly monthClose: MeteringMonthCloseService,
    @Inject(PageEventsService) private readonly pageEvents: PageEventsService,
  ) {
    const connection = {
      url: this.config.get<string>('REDIS_URL'),
      maxRetriesPerRequest: null,
    };
    this.queue = new Queue(ANALYTICS_QUEUE_NAME, { connection });
    if (this.config.get<boolean>('WORKER_INLINE', true)) {
      this.worker = new Worker(
        ANALYTICS_QUEUE_NAME,
        (job: Job) => this.process(job.name),
        { connection },
      );
      this.worker.on('failed', (job, err) => {
        this.logger.error(`analytics job ${job?.name} failed: ${err.message}`);
      });
    }
  }

  async onModuleInit(): Promise<void> {
    // bullmq v6 schedules repeatable jobs via job schedulers, not
    // `queue.add(..., { repeat })` (removed). `upsertJobScheduler` is
    // idempotent on the scheduler id, so re-running this on every boot
    // doesn't create duplicate schedules.
    await this.queue.upsertJobScheduler(
      JOB_NAMES.rollupIncremental,
      { pattern: this.config.get<string>('ANALYTICS_ROLLUP_CRON')! },
      { name: JOB_NAMES.rollupIncremental },
    );
    await this.queue.upsertJobScheduler(
      JOB_NAMES.rollupReconcile,
      { pattern: this.config.get<string>('ANALYTICS_RECONCILE_CRON')! },
      { name: JOB_NAMES.rollupReconcile },
    );
    await this.queue.upsertJobScheduler(
      JOB_NAMES.meteringUpsertMonth,
      { pattern: '0 * * * *' }, // hourly
      { name: JOB_NAMES.meteringUpsertMonth },
    );
    await this.queue.upsertJobScheduler(
      JOB_NAMES.meteringMonthClose,
      { pattern: this.config.get<string>('METERING_MONTH_CLOSE_CRON')! },
      { name: JOB_NAMES.meteringMonthClose },
    );
    await this.queue.upsertJobScheduler(
      JOB_NAMES.pageviewsFlush,
      { every: 60_000 },
      { name: JOB_NAMES.pageviewsFlush },
    );
  }

  private async process(jobName: string): Promise<void> {
    switch (jobName) {
      case JOB_NAMES.rollupIncremental:
        await this.scanRollup.runIncremental();
        return;
      case JOB_NAMES.rollupReconcile:
        await this.reconcile.run();
        return;
      case JOB_NAMES.meteringUpsertMonth:
        await this.monthClose.upsertMonth();
        return;
      case JOB_NAMES.meteringMonthClose:
        await this.monthClose.finaliseMonth();
        return;
      case JOB_NAMES.pageviewsFlush:
        await this.pageEvents.flush();
        return;
      default:
        this.logger.warn(`unknown analytics job name: ${jobName}`);
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker?.close();
    await this.queue.close();
  }
}
