import { Module } from '@nestjs/common';
import { METER_PORT } from './meter.port';
import { MeteringService } from './metering.service';
import { MeteringSubscribers } from './subscribers/metering.subscribers';
import { UsageReadService } from './usage-read.service';
import { UsageController } from './usage.controller';
import { MeteringMonthCloseService } from './jobs/month-close.service';

@Module({
  controllers: [UsageController],
  providers: [
    MeteringService,
    { provide: METER_PORT, useExisting: MeteringService },
    MeteringSubscribers,
    UsageReadService,
    MeteringMonthCloseService,
  ],
  exports: [METER_PORT, UsageReadService, MeteringMonthCloseService],
})
export class MeteringModule {}
