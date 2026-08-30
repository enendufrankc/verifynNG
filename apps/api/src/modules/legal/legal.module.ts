import { Module } from '@nestjs/common';
import { LegalController } from './legal.controller';
import { LegalDocumentService } from './legal-document.service';
import { LegalReacceptListener } from './legal-reaccept.listener';
import { TenantsModule } from '../tenants/tenants.module';
import { ConsentModule } from '../consent/consent.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [TenantsModule, ConsentModule, NotificationsModule],
  controllers: [LegalController],
  providers: [LegalDocumentService, LegalReacceptListener],
  exports: [LegalDocumentService],
})
export class LegalModule {}
