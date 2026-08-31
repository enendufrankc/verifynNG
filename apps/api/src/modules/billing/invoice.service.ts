import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Invoice, PrismaClient } from '@prisma/client';
import { loadEnv } from '@verifynng/config';
import { EventsService } from '../../common/events.service';
import { UsageReadService } from '../metering/usage-read.service';
import { monthRangeUtc } from '../metering/month.util';
import type { PlanFeatures } from './entitlement.service';
import { renderInvoicePdf } from './invoice-pdf.renderer';
import { BillingClock } from './billing-clock.service';

/**
 * Generates monthly invoices from E12's UsageSummary. `unit_overage` is
 * priced against `Plan.includedUnitsPerYear` and `scan_overage` against
 * `Plan.includedScansPerMonth`, each scaled by `periodFraction` — the
 * fraction of [periodStart, periodEnd) the subscription was actually on
 * this plan (1.0 for a full month on an unchanged plan; less for a
 * mid-period signup or plan change). See docs/billing-pricing-and-
 * proration.md (T10) for the worked examples this mirrors.
 */
@Injectable()
export class InvoiceService {
  constructor(
    @Inject('PRISMA') private readonly prisma: PrismaClient,
    @Inject(EventsService) private readonly events: EventsService,
    @Inject(UsageReadService) private readonly usageRead: UsageReadService,
    @Inject(BillingClock) private readonly clock: BillingClock,
  ) {}

  async generateForPeriod(tenantId: string, period: string): Promise<Invoice> {
    const sub = await this.prisma.subscription.findUniqueOrThrow({
      where: { tenantId },
      include: { plan: true },
    });
    const features = (sub.plan.features ?? {}) as PlanFeatures;
    if (features.customPricing) {
      throw new BadRequestException(
        'enterprise_plans_are_invoiced_manually_by_support',
      );
    }

    const { start, end } = monthRangeUtc(period);
    const usage = await this.usageRead.summary(tenantId, period);
    // Only consume finalised rollups (CROSS-EPIC-REQUESTS.md's request to
    // E15 from E12) — an open UsageSummary can still change under us.
    if (!usage.finalisedAt) {
      throw new ConflictException('usage_not_finalised_for_period');
    }

    const unitsMinted = usage.kinds['code.minted'] ?? 0;
    const scansRecorded =
      (usage.kinds['scan.tier1'] ?? 0) + (usage.kinds['scan.tier2'] ?? 0);

    const activeStart =
      sub.currentPeriodStart > start ? sub.currentPeriodStart : start;
    const periodFraction = Math.min(
      1,
      Math.max(
        0,
        (end.getTime() - activeStart.getTime()) /
          (end.getTime() - start.getTime()),
      ),
    );

    const includedUnits = Math.floor(
      sub.plan.includedUnitsPerYear * periodFraction,
    );
    const includedScans = Math.floor(
      sub.plan.includedScansPerMonth * periodFraction,
    );
    const unitOverageQty = Math.max(0, unitsMinted - includedUnits);
    const scanOverageQty = Math.max(0, scansRecorded - includedScans);

    const currency = sub.currency;
    const planFeeMinor =
      currency === 'NGN'
        ? sub.plan.monthlyPriceNgnMinor
        : sub.plan.monthlyPriceGbpMinor;
    const unitPriceMinor =
      currency === 'NGN'
        ? sub.plan.overageUnitPriceNgnMinor
        : sub.plan.overageUnitPriceGbpMinor;
    const scanPriceMinor =
      currency === 'NGN'
        ? sub.plan.overageScanPriceNgnMinor
        : sub.plan.overageScanPriceGbpMinor;

    const lines: Array<{
      kind: string;
      description: string;
      quantity: number;
      unitPriceMinor: number;
      amountMinor: number;
    }> = [
      {
        kind: 'plan_fee',
        description: `${sub.plan.name} plan fee`,
        quantity: 1,
        unitPriceMinor: planFeeMinor,
        amountMinor: planFeeMinor,
      },
    ];
    if (unitOverageQty > 0) {
      lines.push({
        kind: 'unit_overage',
        description: `Unit overage (${unitOverageQty} units)`,
        quantity: unitOverageQty,
        unitPriceMinor,
        amountMinor: unitOverageQty * unitPriceMinor,
      });
    }
    if (scanOverageQty > 0) {
      lines.push({
        kind: 'scan_overage',
        description: `Scan overage (${scanOverageQty} scans)`,
        quantity: scanOverageQty,
        unitPriceMinor: scanPriceMinor,
        amountMinor: scanOverageQty * scanPriceMinor,
      });
    }

    const subtotalMinor = lines.reduce((sum, l) => sum + l.amountMinor, 0);
    const env = loadEnv();
    const taxRateBps =
      currency === 'NGN'
        ? env.BILLING_TAX_RATE_BPS_NGN
        : env.BILLING_TAX_RATE_BPS_GBP;
    const taxMinor = Math.round((subtotalMinor * taxRateBps) / 10_000);
    const totalMinor = subtotalMinor + taxMinor;

    const tenant = await this.prisma.tenant.findUniqueOrThrow({
      where: { id: tenantId },
      select: { slug: true },
    });
    const yyyymm = period.replace('-', '');
    const seq =
      (await this.prisma.invoice.count({
        where: { tenantId, periodStart: start },
      })) + 1;
    const number = `INV-${yyyymm}-${tenant.slug}-${seq}`;

    return this.prisma.invoice.create({
      data: {
        tenantId,
        number,
        status: 'draft',
        currency,
        periodStart: start,
        periodEnd: end,
        subtotalMinor,
        taxMinor,
        totalMinor,
        usageSnapshot: usage as unknown as object,
        lines: { create: lines.map((l) => ({ ...l, tenantId })) },
      },
      include: { lines: true },
    });
  }

  async issue(invoiceId: string): Promise<Invoice> {
    const invoice = await this.prisma.invoice.findUniqueOrThrow({
      where: { id: invoiceId },
    });
    if (invoice.status !== 'draft') {
      throw new ConflictException('invoice_not_draft');
    }
    const now = this.clock.now();
    const dueAt = this.clock.addDays(now, 7);
    const updated = await this.prisma.invoice.update({
      where: { id: invoiceId },
      data: { status: 'issued', issuedAt: now, dueAt },
    });
    await this.events.emit('invoice.issued', {
      tenantId: updated.tenantId,
      invoiceId: updated.id,
      number: updated.number,
      currency: updated.currency,
      totalMinor: updated.totalMinor,
      dueAt: dueAt.toISOString(),
    });
    return updated;
  }

  async markPaid(invoiceId: string, _paymentId: string): Promise<Invoice> {
    const invoice = await this.prisma.invoice.findUniqueOrThrow({
      where: { id: invoiceId },
    });
    if (invoice.status === 'paid') return invoice;
    return this.prisma.invoice.update({
      where: { id: invoiceId },
      data: { status: 'paid', paidAt: new Date() },
    });
  }

  async listForTenant(
    tenantId: string,
    opts: { cursor?: string; limit?: number } = {},
  ): Promise<{ invoices: Invoice[]; nextCursor: string | null }> {
    const limit = opts.limit ?? 20;
    const rows = await this.prisma.invoice.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
      ...(opts.cursor ? { cursor: { id: opts.cursor }, skip: 1 } : {}),
    });
    const hasMore = rows.length > limit;
    const invoices = hasMore ? rows.slice(0, limit) : rows;
    return {
      invoices,
      nextCursor: hasMore ? invoices[invoices.length - 1].id : null,
    };
  }

  async getForTenant(tenantId: string, invoiceId: string): Promise<Invoice> {
    const invoice = await this.prisma.invoice.findFirst({
      where: { id: invoiceId, tenantId },
      include: { lines: true },
    });
    if (!invoice) throw new NotFoundException('invoice_not_found');
    return invoice;
  }

  async renderPdf(tenantId: string, invoiceId: string): Promise<Buffer> {
    const invoice = await this.prisma.invoice.findFirst({
      where: { id: invoiceId, tenantId },
      include: { lines: true },
    });
    if (!invoice) throw new NotFoundException('invoice_not_found');
    const tenant = await this.prisma.tenant.findUniqueOrThrow({
      where: { id: tenantId },
      select: { name: true, legalName: true, country: true },
    });
    return renderInvoicePdf(invoice, tenant);
  }
}
