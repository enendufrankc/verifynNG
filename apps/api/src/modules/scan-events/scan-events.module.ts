import { Module } from '@nestjs/common';
import { ScanEventsService } from './scan-events.service';

@Module({
  providers: [ScanEventsService],
  exports: [ScanEventsService],
})
export class ScanEventsModule {}
