import { Module } from '@nestjs/common';
import { BullMQModule } from '../../jobs/bullmq.module.js';
import { EntitlementsModule } from '../entitlements/entitlements.module.js';
import { WebhookEndpointService } from './webhook-endpoint.service.js';
import { WebhookSigner } from './webhook-signer.js';
import { WebhookUrlValidator } from './webhook-url-validator.js';
import { WebhookEndpointsController } from './webhook-endpoints.controller.js';

@Module({
  imports: [BullMQModule, EntitlementsModule],
  controllers: [WebhookEndpointsController],
  providers: [WebhookEndpointService, WebhookSigner, WebhookUrlValidator],
  exports: [WebhookEndpointService, WebhookSigner],
})
export class WebhooksModule {}
