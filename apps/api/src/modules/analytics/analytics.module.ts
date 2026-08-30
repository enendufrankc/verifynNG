import { Module } from '@nestjs/common';
import { MeteringModule } from '../metering/metering.module';
import { analyticsRedisProvider } from './redis-client.provider';
import {
  AnalyticsController,
  AnalyticsRollupsController,
} from './analytics.controller';
import { AnalyticsReadService } from './read/analytics-read.service';
import { ScanRollupJobService } from './jobs/scan-rollup.service';
import { ReconcileService } from './jobs/reconcile.service';
import { RollupCountersSubscriber } from './rollup/rollup-counters.subscriber';
import { ScanRollupRowRepository } from './rollup/scan-rollup-row.repository';
import { PageEventsService } from './page-events/page-events.service';
import { PageEventsController } from './page-events/page-events.controller';
import { AnalyticsJobsQueue } from './jobs/analytics-jobs.queue';

@Module({
  imports: [MeteringModule],
  controllers: [
    AnalyticsController,
    AnalyticsRollupsController,
    PageEventsController,
  ],
  providers: [
    analyticsRedisProvider,
    AnalyticsReadService,
    ScanRollupRowRepository,
    ScanRollupJobService,
    ReconcileService,
    RollupCountersSubscriber,
    PageEventsService,
    AnalyticsJobsQueue,
  ],
  exports: [AnalyticsReadService, ScanRollupJobService, ReconcileService],
})
export class AnalyticsModule {}
