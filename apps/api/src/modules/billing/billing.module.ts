import { Module } from '@nestjs/common';
import { PlansController } from './plans.controller';
import { PlanService } from './plan.service';

@Module({
  controllers: [PlansController],
  providers: [PlanService],
  exports: [PlanService],
})
export class BillingModule {}
