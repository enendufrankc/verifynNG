import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { TenantId } from '../auth/decorators/tenant-id.decorator.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { Audited } from '../audit/audited.decorator.js';
import type { AuthenticatedRequest } from '../../common/authenticated-request.js';
import { WebhookEndpointService } from './webhook-endpoint.service.js';
import { CreateWebhookEndpointDto } from './dto/create-webhook-endpoint.dto.js';
import { UpdateWebhookEndpointDto } from './dto/update-webhook-endpoint.dto.js';

const webhookEndpointAuditTarget = (req: AuthenticatedRequest) => ({
  type: 'webhook-endpoint',
  id: (req.params?.id as string) ?? 'unknown',
});

@Controller('tenants/:tenantId/webhook-endpoints')
export class WebhookEndpointsController {
  constructor(private readonly webhookEndpoints: WebhookEndpointService) {}

  @Get()
  @Roles('viewer')
  list(@TenantId() tenantId: string) {
    return this.webhookEndpoints.list(tenantId);
  }

  @Get(':id')
  @Roles('viewer')
  get(@TenantId() tenantId: string, @Param('id') id: string) {
    return this.webhookEndpoints.get(tenantId, id);
  }

  @Post()
  @Roles('owner')
  @Audited('webhook_endpoint.create', { target: webhookEndpointAuditTarget })
  create(@TenantId() tenantId: string, @Body() dto: CreateWebhookEndpointDto) {
    return this.webhookEndpoints.create(tenantId, dto);
  }

  @Patch(':id')
  @Roles('owner')
  @Audited('webhook_endpoint.update', { target: webhookEndpointAuditTarget })
  update(
    @TenantId() tenantId: string,
    @Param('id') id: string,
    @Body() dto: UpdateWebhookEndpointDto,
  ) {
    return this.webhookEndpoints.update(tenantId, id, dto);
  }

  @Post(':id/test')
  @Roles('owner')
  @Audited('webhook_endpoint.test', { target: webhookEndpointAuditTarget })
  test(@TenantId() tenantId: string, @Param('id') id: string) {
    return this.webhookEndpoints.testSend(tenantId, id);
  }

  @Post(':id/rotate-secret')
  @Roles('owner')
  @Audited('webhook_endpoint.rotate_secret', {
    target: webhookEndpointAuditTarget,
  })
  rotateSecret(@TenantId() tenantId: string, @Param('id') id: string) {
    return this.webhookEndpoints.rotateSecret(tenantId, id);
  }
}
