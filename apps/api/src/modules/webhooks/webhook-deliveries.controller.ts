import { Controller, Get, Param, Post, Query } from '@nestjs/common';
import { WebhookDeliveryStatus } from '@prisma/client';
import { TenantId } from '../auth/decorators/tenant-id.decorator.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { Audited } from '../audit/audited.decorator.js';
import type { AuthenticatedRequest } from '../../common/authenticated-request.js';
import { WebhookDeliveryService } from './webhook-delivery.service.js';

const deliveryAuditTarget = (req: AuthenticatedRequest) => ({
  type: 'webhook-delivery',
  id: (req.params?.id as string) ?? 'unknown',
});

@Controller('tenants/:tenantId/webhook-deliveries')
export class WebhookDeliveriesController {
  constructor(private readonly deliveries: WebhookDeliveryService) {}

  @Get()
  @Roles('viewer')
  list(
    @TenantId() tenantId: string,
    @Query('endpointId') endpointId?: string,
    @Query('status') status?: WebhookDeliveryStatus,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
  ) {
    return this.deliveries.list(tenantId, {
      endpointId,
      status,
      cursor,
      limit,
    });
  }

  @Post(':id/redeliver')
  @Roles('owner')
  @Audited('webhook_delivery.redeliver', { target: deliveryAuditTarget })
  redeliver(@TenantId() tenantId: string, @Param('id') id: string) {
    return this.deliveries.redeliver(tenantId, id);
  }
}
