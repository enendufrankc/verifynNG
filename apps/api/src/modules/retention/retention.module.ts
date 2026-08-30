import { Module } from '@nestjs/common';
import { RetentionController } from './retention.controller';
import { RetentionRunnerService } from './retention-runner.service';
import { TenantsModule } from '../tenants/tenants.module';
import { DsarModule } from '../dsar/dsar.module';
import { RetentionScheduler } from '../../jobs/retention.scheduler';

@Module({
  imports: [TenantsModule, DsarModule],
  controllers: [RetentionController],
  providers: [RetentionRunnerService, RetentionScheduler],
  exports: [RetentionRunnerService],
})
export class RetentionModule {}
