import { Module } from '@nestjs/common';
import { loadEnv } from '@verifynng/config';
import { BatchesController } from './batches.controller';
import { JobsController } from './jobs.controller';
import { BatchesService } from './batches.service';
import { MintService } from './mint.service';
import { ManifestService } from './manifest.service';
import { ExportsService } from './exports.service';
import {
  ENTITLEMENT_POLICY,
  AllowAllEntitlementPolicy,
} from './entitlement.policy';
import { BullMQModule } from '../../jobs/bullmq.module';
import { MintProcessor } from '../../jobs/mint.processor';
import { BatchExportsProcessor } from '../../jobs/batch-exports.processor';

// WORKER_INLINE gates whether the HTTP process also consumes the mint /
// batch-exports queues. It's true by default (`pnpm dev`, single process);
// compose sets it false on `api` because the dedicated `api-worker` service
// (see WorkerModule) consumes them instead — registering the processors in
// both would race two BullMQ workers over the same jobs.
const workerInline = loadEnv().WORKER_INLINE === 'true';

@Module({
  imports: [BullMQModule],
  controllers: [BatchesController, JobsController],
  providers: [
    BatchesService,
    MintService,
    ManifestService,
    ExportsService,
    ...(workerInline ? [MintProcessor, BatchExportsProcessor] : []),
    {
      provide: ENTITLEMENT_POLICY,
      useClass: AllowAllEntitlementPolicy,
    },
  ],
  exports: [BatchesService, MintService, ManifestService, ExportsService],
})
export class BatchesModule {}
