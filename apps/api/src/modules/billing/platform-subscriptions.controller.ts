import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { Currency, PrismaClient, SubscriptionStatus } from '@prisma/client';
import { PlatformRole } from '../../common/tenant';
import { Audited } from '../audit/audited.decorator';
import { InvoiceService } from './invoice.service';
import { PaymentService } from './payment.service';
import type { PlanFeatures } from './entitlement.service';

export interface PlatformSubscriptionRow {
  subscriptionId: string;
  tenantId: string;
  tenantName: string;
  tenantSlug: string;
  planCode: string;
  planName: string;
  status: SubscriptionStatus;
  currency: Currency;
  mrrMinor: number;
  nextInvoiceAt: Date;
  overdueMinor: number;
  overdueInvoiceId: string | null;
}

/**
 * T12 — platform-support only (`@PlatformRole('support')`, distinct from
 * every tenant-scoped `@Roles` route elsewhere in this module).
 * `Subscription.tenantId` is a plain scalar (E15's models never get a real
 * Prisma relation to Tenant — see the schema block's own comment), so this
 * joins `Subscription`+`Plan` (a real relation) against `Tenant` in memory
 * rather than a single Prisma query with an `include`.
 */
@Controller('v1/platform/subscriptions')
@PlatformRole('support')
export class PlatformSubscriptionsController {
  constructor(
    @Inject('PRISMA') private readonly prisma: PrismaClient,
    @Inject(InvoiceService) private readonly invoices: InvoiceService,
    @Inject(PaymentService) private readonly payments: PaymentService,
  ) {}

  @Get()
  async list(
    @Query('status') status?: SubscriptionStatus,
    @Query('planCode') planCode?: string,
    @Query('currency') currency?: Currency,
  ): Promise<PlatformSubscriptionRow[]> {
    const subscriptions = await this.prisma.subscription.findMany({
      where: {
        ...(status ? { status } : {}),
        ...(currency ? { currency } : {}),
        ...(planCode ? { plan: { code: planCode } } : {}),
      },
      include: { plan: true },
      orderBy: { createdAt: 'desc' },
    });

    const tenantIds = subscriptions.map((s) => s.tenantId);
    const tenants = await this.prisma.tenant.findMany({
      where: { id: { in: tenantIds } },
      select: { id: true, name: true, slug: true },
    });
    const tenantById = new Map(tenants.map((t) => [t.id, t]));

    // One overdue invoice per tenant is enough for the list view (the
    // support drawer's own invoice list shows the rest) — earliest dueAt
    // first, so this is the longest-overdue one.
    const overdueInvoices = await this.prisma.invoice.findMany({
      where: {
        tenantId: { in: tenantIds },
        status: 'issued',
        dueAt: { lt: new Date() },
      },
      orderBy: { dueAt: 'asc' },
    });
    const overdueByTenant = new Map<string, (typeof overdueInvoices)[number]>();
    for (const invoice of overdueInvoices) {
      if (!overdueByTenant.has(invoice.tenantId)) {
        overdueByTenant.set(invoice.tenantId, invoice);
      }
    }

    return subscriptions.map((s) => {
      const tenant = tenantById.get(s.tenantId);
      const features = (s.plan.features ?? {}) as PlanFeatures;
      const mrrMinor = features.customPricing
        ? 0
        : s.currency === 'NGN'
          ? s.plan.monthlyPriceNgnMinor
          : s.plan.monthlyPriceGbpMinor;
      const overdue = overdueByTenant.get(s.tenantId);
      return {
        subscriptionId: s.id,
        tenantId: s.tenantId,
        tenantName: tenant?.name ?? s.tenantId,
        tenantSlug: tenant?.slug ?? s.tenantId,
        planCode: s.plan.code,
        planName: s.plan.name,
        status: s.status,
        currency: s.currency,
        mrrMinor,
        nextInvoiceAt: s.currentPeriodEnd,
        overdueMinor: overdue?.totalMinor ?? 0,
        overdueInvoiceId: overdue?.id ?? null,
      };
    });
  }

  @Get(':tenantId/invoices')
  invoicesForTenant(@Param('tenantId') tenantId: string) {
    return this.invoices.listForTenant(tenantId, { limit: 50 });
  }

  // `:id` (not `:invoiceId`) so @Audited's default target resolver
  // (`req.params.id`) records the right invoice id with no extra
  // `target` option needed.
  @Post(':id/mark-paid')
  @Audited('billing.invoice.mark_paid')
  markPaid(@Param('id') id: string, @Body() body: { reason?: string }) {
    if (!body.reason?.trim()) {
      throw new BadRequestException('reason_required');
    }
    return this.payments.markPaidManually(id, body.reason.trim());
  }
}
