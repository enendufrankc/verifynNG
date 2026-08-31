import { Module } from '@nestjs/common';
import { loadEnv } from '@verifynng/config';
import { PlansController } from './plans.controller';
import { PlanService } from './plan.service';
import { SubscriptionService } from './subscription.service';
import { EntitlementService } from './entitlement.service';
import { BillingPeriodRollProcessor } from './jobs/period-roll.processor';
import { BillingPeriodRollScheduler } from './jobs/period-roll.scheduler';
import { BullMQModule } from '../../jobs/bullmq.module';
import { TenantsModule } from '../tenants/tenants.module';

// See BatchesModule for the WORKER_INLINE convention this mirrors: true in
// dev (`pnpm dev`, single process) runs job processors inline here; false
// in compose, where the dedicated `api-worker` process is meant to run
// them instead (not yet wired there for billing — see docs/epics/E15
// PR notes; the nightly cron still registers either way, it just has no
// consumer in compose until that follow-up lands).
const workerInline = loadEnv().WORKER_INLINE === 'true';

@Module({
  imports: [BullMQModule, TenantsModule],
  controllers: [PlansController],
  providers: [
    PlanService,
    SubscriptionService,
    EntitlementService,
    BillingPeriodRollScheduler,
    ...(workerInline ? [BillingPeriodRollProcessor] : []),
  ],
  exports: [PlanService, SubscriptionService, EntitlementService],
})
export class BillingModule {}
