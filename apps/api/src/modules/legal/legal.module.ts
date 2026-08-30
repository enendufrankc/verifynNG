import { Module } from '@nestjs/common';
import { LegalController } from './legal.controller';
import { LegalDocumentService } from './legal-document.service';

@Module({
  controllers: [LegalController],
  providers: [LegalDocumentService],
  exports: [LegalDocumentService],
})
export class LegalModule {}
