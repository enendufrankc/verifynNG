import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { loadEnv } from '@verifynng/config';
import { PlansController } from './plans.controller';
import { PlanService } from './plan.service';
import { SubscriptionService } from './subscription.service';
import { EntitlementService } from './entitlement.service';
import { InvoiceService } from './invoice.service';
import { PaymentService } from './payment.service';
import { PaymentMethodCipher } from './payment-method.cipher';
import { DunningService } from './dunning.service';
import { BillingClock } from './billing-clock.service';
import { TenantBillingController } from './tenant-billing.controller';
import { BillingWebhooksController } from './billing-webhooks.controller';
import { PaystackGateway } from './paystack.gateway';
import { PAYMENT_GATEWAY_PORT } from './payment-gateway.port';
import { BillingQueueProcessor } from './jobs/billing-queue.processor';
import { BillingPeriodRollScheduler } from './jobs/period-roll.scheduler';
import { BullMQModule } from '../../jobs/bullmq.module';
import { TenantsModule } from '../tenants/tenants.module';
import { MeteringModule } from '../metering/metering.module';
import { NotificationsModule } from '../notifications/notifications.module';

// See BatchesModule for the WORKER_INLINE convention this mirrors: true in
// dev (`pnpm dev`, single process) runs job processors inline here; false
// in compose, where the dedicated `api-worker` process runs them instead —
// wired into apps/api/src/worker.module.ts (T8), same pattern as
// MintProcessor/BatchExportsProcessor bypassing BatchesModule's own gate.
const workerInline = loadEnv().WORKER_INLINE === 'true';

@Module({
  imports: [BullMQModule, TenantsModule, MeteringModule, NotificationsModule],
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
    PaymentService,
    PaymentMethodCipher,
    DunningService,
    BillingClock,
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
    PaymentService,
    DunningService,
    PAYMENT_GATEWAY_PORT,
  ],
})
export class BillingModule {}
