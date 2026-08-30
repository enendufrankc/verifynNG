import { Module } from '@nestjs/common';
import { loadEnv } from '@verifynng/config';
import { BullMQModule } from '../../jobs/bullmq.module';
import { AnomalyQueryModule } from '../anomaly/anomaly-query.module';
import { UnitLifecycleService } from './unit-lifecycle.service';
import { UnitsController } from './units.controller';
import { BatchesUnitsController } from './batches-units.controller';
import { RecallProcessor } from './recall.processor';

// See BatchesModule for why this is gated: the dedicated api-worker
// container (WORKER_INLINE=false) consumes the 'units' queue instead.
const workerInline = loadEnv().WORKER_INLINE === 'true';

@Module({
  imports: [BullMQModule, AnomalyQueryModule],
  controllers: [UnitsController, BatchesUnitsController],
  providers: [UnitLifecycleService, ...(workerInline ? [RecallProcessor] : [])],
  exports: [UnitLifecycleService],
})
export class UnitsModule {}
