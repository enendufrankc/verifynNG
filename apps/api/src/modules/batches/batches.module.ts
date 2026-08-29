import { Module } from '@nestjs/common';
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

@Module({
  imports: [BullMQModule],
  controllers: [BatchesController, JobsController],
  providers: [
    BatchesService,
    MintService,
    ManifestService,
    ExportsService,
    MintProcessor,
    BatchExportsProcessor,
    {
      provide: ENTITLEMENT_POLICY,
      useClass: AllowAllEntitlementPolicy,
    },
  ],
  exports: [BatchesService, MintService, ManifestService, ExportsService],
})
export class BatchesModule {}
