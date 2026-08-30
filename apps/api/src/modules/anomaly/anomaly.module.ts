import { Module } from '@nestjs/common';
import { loadEnv } from '@verifynng/config';
import { BullMQModule } from '../../jobs/bullmq.module';
import { UnitsModule } from '../units/units.module';
import { AnomalyQueryModule } from './anomaly-query.module';
import { RulesService } from './rules/rules.service';
import { AnomalyEngine } from './anomaly-engine.service';
import { AnomaliesController } from './anomalies.controller';
import { AnomalyRulesController } from './anomaly-rules.controller';
import { DevAnomalyController } from './dev-anomaly.controller';
import { ScanRecordedListener } from './consumers/scan-recorded.listener';
import { EnumerationDetectedListener } from './consumers/enumeration-detected.listener';
import { AnomalyQueueProcessor } from './consumers/anomaly-queue.processor';
import { SweepSchedulerService } from './consumers/sweep-scheduler.service';

// See BatchesModule for why this is gated: the dedicated api-worker
// container (WORKER_INLINE=false) consumes the 'anomaly' queue instead.
const workerInline = loadEnv().WORKER_INLINE === 'true';
const devControllers =
  process.env.NODE_ENV === 'production' ? [] : [DevAnomalyController];

@Module({
  imports: [BullMQModule, UnitsModule, AnomalyQueryModule],
  controllers: [AnomaliesController, AnomalyRulesController, ...devControllers],
  providers: [
    RulesService,
    AnomalyEngine,
    ScanRecordedListener,
    EnumerationDetectedListener,
    ...(workerInline ? [AnomalyQueueProcessor, SweepSchedulerService] : []),
  ],
  exports: [RulesService, AnomalyEngine],
})
export class AnomalyModule {}
