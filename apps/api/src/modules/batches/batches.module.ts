import { Module } from '@nestjs/common';
import { BatchesController } from './batches.controller';
import { BatchesService } from './batches.service';
import { MintService } from './mint.service';
import { ManifestService } from './manifest.service';
import { ExportsService } from './exports.service';
import {
  ENTITLEMENT_POLICY,
  AllowAllEntitlementPolicy,
} from './entitlement.policy';

@Module({
  controllers: [BatchesController],
  providers: [
    BatchesService,
    MintService,
    ManifestService,
    ExportsService,
    {
      provide: ENTITLEMENT_POLICY,
      useClass: AllowAllEntitlementPolicy,
    },
  ],
  exports: [BatchesService, MintService, ManifestService, ExportsService],
})
export class BatchesModule {}
