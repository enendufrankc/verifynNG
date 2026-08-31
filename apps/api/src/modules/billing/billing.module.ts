import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { loadEnv } from '@verifynng/config';
import { PlansController } from './plans.controller';
import { PlanService } from './plan.service';
import { SubscriptionService } from './subscription.service';
import { EntitlementService } from './entitlement.service';
import { InvoiceService } from './invoice.service';
import { TenantBillingController } from './tenant-billing.controller';
import { BillingWebhooksController } from './billing-webhooks.controller';
import { PaystackGateway } from './paystack.gateway';
import { PAYMENT_GATEWAY_PORT } from './payment-gateway.port';
import { BillingQueueProcessor } from './jobs/billing-queue.processor';
import { BillingPeriodRollScheduler } from './jobs/period-roll.scheduler';
import { BullMQModule } from '../../jobs/bullmq.module';
import { TenantsModule } from '../tenants/tenants.module';
import { MeteringModule } from '../metering/metering.module';

// See BatchesModule for the WORKER_INLINE convention this mirrors: true in
// dev (`pnpm dev`, single process) runs job processors inline here; false
// in compose, where the dedicated `api-worker` process is meant to run
// them instead (not yet wired there for billing — see docs/epics/E15
// PR notes; the nightly cron still registers either way, it just has no
// consumer in compose until that follow-up lands).
const workerInline = loadEnv().WORKER_INLINE === 'true';

@Module({
  imports: [BullMQModule, TenantsModule, MeteringModule],
  controllers: [
    PlansController,
    TenantBillingController,
    BillingWebhooksController,
  ],
  providers: [
    PlanService,
    SubscriptionService,
    EntitlementService,
    InvoiceService,
    BillingPeriodRollScheduler,
    ...(workerInline ? [BillingQueueProcessor] : []),
    {
      // One PaystackGateway class, two possible base URLs — see
      // paystack.gateway.ts's docstring. PAYMENT_GATEWAY=fake points it at
      // tools/fakes/pay (T7), which speaks the same wire format.
      provide: PAYMENT_GATEWAY_PORT,
      useFactory: (config: ConfigService) => {
        const fake = config.get<string>('PAYMENT_GATEWAY') === 'fake';
        return new PaystackGateway(
          fake
            ? config.get<string>('FAKE_PAY_URL')!
            : config.get<string>('PAYSTACK_BASE_URL')!,
          fake
            ? config.get<string>('FAKE_PAY_SECRET')!
            : config.get<string>('PAYSTACK_SECRET_KEY')!,
        );
      },
      inject: [ConfigService],
    },
  ],
  exports: [
    PlanService,
    SubscriptionService,
    EntitlementService,
    InvoiceService,
    PAYMENT_GATEWAY_PORT,
  ],
})
export class BillingModule {}
