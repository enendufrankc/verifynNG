import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { Inject } from '@nestjs/common';
import { Roles } from '../auth/decorators/roles.decorator';
import { TenantId } from '../auth/decorators/tenant-id.decorator';
import { Principal } from '../auth/decorators/principal.decorator';
import type { UserPrincipal } from '../auth/types/principal';
import { Audited } from '../audit/audited.decorator';
import { BatchLifecycleService } from './batch-lifecycle.service';
import { DeliveryService } from './delivery.service';
import { DeliverBatchDto } from './dto/deliver-batch.dto';

/** Tenant-side deliveries: mounted on the batch it delivers/closes. */
@Controller('tenants/:tenantId/batches/:batchId')
export class DeliveriesController {
  constructor(
    private deliveryService: DeliveryService,
    private batchLifecycle: BatchLifecycleService,
    @Inject('PRISMA') private prisma: PrismaClient,
  ) {}

  @Post('deliveries')
  @Roles('owner')
  @Audited('batch.deliver', {
    target: (req) => ({ type: 'batch', id: req.params.batchId as string }),
  })
  deliver(
    @TenantId() tenantId: string,
    @Param('batchId') batchId: string,
    @Body() dto: DeliverBatchDto,
    @Principal() principal: UserPrincipal,
  ) {
    return this.deliveryService.deliver(tenantId, batchId, dto, {
      userId: principal.userId,
    });
  }

  @Get('deliveries')
  @Roles('viewer')
  list(@TenantId() tenantId: string, @Param('batchId') batchId: string) {
    return this.deliveryService.listForBatch(tenantId, batchId);
  }

  @Get('receipts')
  @Roles('viewer')
  receipts(@TenantId() tenantId: string, @Param('batchId') batchId: string) {
    return this.prisma.printReceipt.findMany({
      where: { tenantId, batchId },
      orderBy: { createdAt: 'desc' },
    });
  }

  @Post('close')
  @Roles('owner')
  @Audited('batch.close', {
    target: (req) => ({ type: 'batch', id: req.params.batchId as string }),
  })
  close(
    @TenantId() tenantId: string,
    @Param('batchId') batchId: string,
    @Principal() principal: UserPrincipal,
  ) {
    return this.batchLifecycle.transition(tenantId, batchId, 'closed', {
      type: 'user',
      id: principal.userId,
    });
  }
}

/** Tenant-side actions on an existing delivery, addressed by delivery id directly. */
@Controller('tenants/:tenantId/deliveries')
export class DeliveryActionsController {
  constructor(private deliveryService: DeliveryService) {}

  /** Top-level "Deliveries" console page — every delivery across every batch. */
  @Get()
  @Roles('viewer')
  listForTenant(@TenantId() tenantId: string) {
    return this.deliveryService.listForTenant(tenantId);
  }

  @Get(':id')
  @Roles('viewer')
  get(@TenantId() tenantId: string, @Param('id') id: string) {
    return this.deliveryService.getTenantDelivery(tenantId, id);
  }

  @Post(':id/revoke')
  @Roles('owner')
  @Audited('delivery.revoke')
  revoke(@TenantId() tenantId: string, @Param('id') id: string) {
    return this.deliveryService.revoke(tenantId, id);
  }

  @Post(':id/resend')
  @Roles('owner')
  @Audited('delivery.resend')
  resend(@TenantId() tenantId: string, @Param('id') id: string) {
    return this.deliveryService.resend(tenantId, id);
  }
}
