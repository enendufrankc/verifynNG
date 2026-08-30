import { Module } from '@nestjs/common';
import { DsarController, LegalHoldController } from './dsar.controller';
import { DsarService } from './dsar.service';
import { LegalHoldService } from './legal-hold.service';
import { DsarStorageService } from './dsar-storage.service';
import { DsarEmailCache } from './dsar-email-cache.service';
import {
  REPORT_LOOKUP_PORT,
  NullReportLookupAdapter,
} from './report-lookup.port';
import { DsarQueue } from '../../jobs/dsar.queue';
import { DsarProcessor } from '../../jobs/dsar.processor';
import { TenantsModule } from '../tenants/tenants.module';

@Module({
  imports: [TenantsModule],
  controllers: [DsarController, LegalHoldController],
  providers: [
    DsarService,
    LegalHoldService,
    DsarStorageService,
    DsarEmailCache,
    DsarQueue,
    DsarProcessor,
    { provide: REPORT_LOOKUP_PORT, useClass: NullReportLookupAdapter },
  ],
  exports: [LegalHoldService],
})
export class DsarModule {}
