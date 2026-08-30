import { Module } from '@nestjs/common';
import { LegalController } from './legal.controller';
import { LegalDocumentService } from './legal-document.service';
import { TenantsModule } from '../tenants/tenants.module';
import { ConsentModule } from '../consent/consent.module';

@Module({
  imports: [TenantsModule, ConsentModule],
  controllers: [LegalController],
  providers: [LegalDocumentService],
  exports: [LegalDocumentService],
})
export class LegalModule {}
