import { Module } from '@nestjs/common';
import { BullMQModule } from '../../jobs/bullmq.module.js';
import { EntitlementsModule } from '../entitlements/entitlements.module.js';
import { WebhookEndpointService } from './webhook-endpoint.service.js';
import { WebhookDeliveryService } from './webhook-delivery.service.js';
import { WebhookDispatcher } from './webhook-dispatcher.js';
import { WebhookDeliveryProcessor } from './webhook-delivery.processor.js';
import { WebhookSigner } from './webhook-signer.js';
import { WebhookUrlValidator } from './webhook-url-validator.js';
import { WebhookEndpointsController } from './webhook-endpoints.controller.js';
import { WebhookDeliveriesController } from './webhook-deliveries.controller.js';

@Module({
  imports: [BullMQModule, EntitlementsModule],
  controllers: [WebhookEndpointsController, WebhookDeliveriesController],
  providers: [
    WebhookEndpointService,
    WebhookDeliveryService,
    WebhookDispatcher,
    WebhookDeliveryProcessor,
    WebhookSigner,
    WebhookUrlValidator,
  ],
  exports: [WebhookEndpointService, WebhookSigner],
})
export class WebhooksModule {}
