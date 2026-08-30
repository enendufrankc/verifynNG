import { Module } from '@nestjs/common';
import { AnomalyQueryService } from './anomaly-query.service';

@Module({
  providers: [AnomalyQueryService],
  exports: [AnomalyQueryService],
})
export class AnomalyQueryModule {}
