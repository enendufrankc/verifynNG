import { Controller, Get, Inject, Param, Query } from '@nestjs/common';
import { Roles, TenantId } from '../../common/tenant';
import { SubscriptionService } from './subscription.service';
import { InvoiceService } from './invoice.service';

@Controller('v1/tenants/:tenantId/billing')
export class TenantBillingController {
  constructor(
    @Inject(SubscriptionService)
    private readonly subscriptions: SubscriptionService,
    @Inject(InvoiceService) private readonly invoices: InvoiceService,
  ) {}

  @Get('subscription')
  @Roles('owner')
  getSubscription(@TenantId() tenantId: string) {
    return this.subscriptions.getForTenant(tenantId);
  }

  @Get('invoices')
  @Roles('owner')
  listInvoices(@TenantId() tenantId: string, @Query('cursor') cursor?: string) {
    return this.invoices.listForTenant(tenantId, { cursor });
  }

  @Get('invoices/:id')
  @Roles('owner')
  getInvoice(@TenantId() tenantId: string, @Param('id') id: string) {
    return this.invoices.getForTenant(tenantId, id);
  }
}
