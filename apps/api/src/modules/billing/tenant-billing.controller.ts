import {
  Controller,
  Get,
  Inject,
  Param,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { Roles, TenantId } from '../../common/tenant';
import { AllowWhenSuspended } from '../../common/tenant-status/decorators';
import { SubscriptionService } from './subscription.service';
import { InvoiceService } from './invoice.service';
import { PaymentService } from './payment.service';

@Controller('v1/tenants/:tenantId/billing')
export class TenantBillingController {
  constructor(
    @Inject(SubscriptionService)
    private readonly subscriptions: SubscriptionService,
    @Inject(InvoiceService) private readonly invoices: InvoiceService,
    @Inject(PaymentService) private readonly payments: PaymentService,
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

  // `invoices/:id/pdf`, not the dot-suffix `invoices/:id.pdf` the epic doc
  // originally sketched: verified live that NestJS's route registration
  // (unlike plain Express, which handles a literal `.` in a path
  // correctly) matches the plain `:id` route for a `.pdf`-suffixed request
  // instead of this more specific one, regardless of declaration order.
  @Get('invoices/:id/pdf')
  @Roles('owner')
  async getInvoicePdf(
    @TenantId() tenantId: string,
    @Param('id') id: string,
    @Res() res: Response,
  ): Promise<void> {
    const invoice = await this.invoices.getForTenant(tenantId, id);
    const pdf = await this.invoices.renderPdf(tenantId, id);
    // Returning the Buffer instead of calling res.send() directly gets
    // JSON-serialised by Nest's default response handler (verified live:
    // the body came back as `{"type":"Buffer","data":[...]}`, not raw
    // bytes) — @Header()+passthrough alone isn't enough for a Buffer body.
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${invoice.number}.pdf"`,
    );
    res.send(pdf);
  }

  @Get('invoices/:id')
  @Roles('owner')
  getInvoice(@TenantId() tenantId: string, @Param('id') id: string) {
    return this.invoices.getForTenant(tenantId, id);
  }

  // A restricted tenant must still be able to pay its way out — otherwise
  // AC6's "from the banner click Pay now" is a dead end (TenantStatusGuard
  // blocks every write for a restricted tenant by default, same as
  // suspended). Found live: this route 403'd with tenant_suspended for a
  // genuinely restricted demo tenant before this decorator was added.
  @Post('invoices/:id/pay')
  @Roles('owner')
  @AllowWhenSuspended()
  async payInvoice(
    @TenantId() tenantId: string,
    @Param('id') id: string,
  ): Promise<{ checkoutUrl: string }> {
    // getForTenant 404s if the invoice isn't this tenant's — payments.initialise
    // itself doesn't take a tenantId, so this is the tenant-scoping check.
    await this.invoices.getForTenant(tenantId, id);
    return this.payments.initialise(id);
  }
}
