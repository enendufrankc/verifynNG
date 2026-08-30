import { Module } from '@nestjs/common';
import { BullMQModule } from '../../jobs/bullmq.module';

@Module({
  imports: [BullMQModule],
  providers: [],
  controllers: [],
})
export class ReportsModule {}
