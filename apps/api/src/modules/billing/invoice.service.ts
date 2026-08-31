import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Currency, Invoice, PrismaClient } from '@prisma/client';
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

    const number = await this.nextInvoiceNumber(tenantId, start);

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

  /** `INV-<YYYYMM>-<tenantSlug>-<seq>` — shared by regular and proration invoices so the two share one sequence per calendar month, never colliding. */
  private async nextInvoiceNumber(
    tenantId: string,
    periodStart: Date,
  ): Promise<string> {
    const tenant = await this.prisma.tenant.findUniqueOrThrow({
      where: { id: tenantId },
      select: { slug: true },
    });
    const yyyymm = `${periodStart.getUTCFullYear()}${String(
      periodStart.getUTCMonth() + 1,
    ).padStart(2, '0')}`;
    const seq =
      (await this.prisma.invoice.count({
        where: { tenantId, periodStart },
      })) + 1;
    return `INV-${yyyymm}-${tenant.slug}-${seq}`;
  }

  /**
   * Immediate proration invoice for a mid-period upgrade (T10): a credit
   * line for the unused fraction of the old plan's fee and a charge line
   * for the same fraction of the new plan's fee — `SubscriptionService.
   * changePlan` computes both amounts and only calls this when their net is
   * positive (a net credit or zero produces no invoice, since this
   * catalogue doesn't issue standalone refunds).
   */
  async generateProration(
    tenantId: string,
    params: {
      currency: Currency;
      periodStart: Date;
      periodEnd: Date;
      oldPlanName: string;
      newPlanName: string;
      creditMinor: number;
      chargeMinor: number;
    },
  ): Promise<Invoice> {
    const lines: Array<{
      kind: string;
      description: string;
      quantity: number;
      unitPriceMinor: number;
      amountMinor: number;
    }> = [];
    if (params.creditMinor > 0) {
      lines.push({
        kind: 'proration_credit',
        description: `Credit: unused time on ${params.oldPlanName}`,
        quantity: 1,
        unitPriceMinor: -params.creditMinor,
        amountMinor: -params.creditMinor,
      });
    }
    lines.push({
      kind: 'proration_charge',
      description: `Charge: remaining time on ${params.newPlanName}`,
      quantity: 1,
      unitPriceMinor: params.chargeMinor,
      amountMinor: params.chargeMinor,
    });

    const subtotalMinor = lines.reduce((sum, l) => sum + l.amountMinor, 0);
    const env = loadEnv();
    const taxRateBps =
      params.currency === 'NGN'
        ? env.BILLING_TAX_RATE_BPS_NGN
        : env.BILLING_TAX_RATE_BPS_GBP;
    const taxMinor = Math.round((subtotalMinor * taxRateBps) / 10_000);
    const totalMinor = subtotalMinor + taxMinor;

    const number = await this.nextInvoiceNumber(tenantId, params.periodStart);

    return this.prisma.invoice.create({
      data: {
        tenantId,
        number,
        status: 'draft',
        currency: params.currency,
        periodStart: params.periodStart,
        periodEnd: params.periodEnd,
        subtotalMinor,
        taxMinor,
        totalMinor,
        usageSnapshot: {},
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

  /**
   * `GET .../billing/usage-vs-plan` (T11) — live, best-effort numbers for
   * the web-admin overview page, not an invoicing computation: reads
   * whatever `UsageSummary` rows exist for the period regardless of
   * `finalisedAt` (unlike `generateForPeriod`, which refuses to bill an
   * open period). A `features.trialTotalCap` plan (free-trial) caps units
   * for the trial's whole lifetime, not per calendar month, so it's
   * compared against the real lifetime `Unit` count instead of this
   * period's `periodFraction`-scaled slice — the same distinction
   * `EntitlementService.canMint` and `SubscriptionService.changePlan`'s
   * downgrade cap check already draw.
   */
  async usageVsPlan(
    tenantId: string,
    period?: string,
  ): Promise<{
    period: string;
    unitsMinted: number;
    includedUnits: number;
    scansRecorded: number;
    includedScans: number;
    projectedOverageMinor: number;
  }> {
    const sub = await this.prisma.subscription.findUniqueOrThrow({
      where: { tenantId },
      include: { plan: true },
    });
    const now = this.clock.now();
    const targetPeriod =
      period ??
      `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
    const { start, end } = monthRangeUtc(targetPeriod);
    const usage = await this.usageRead.summary(tenantId, targetPeriod);
    const scansRecorded =
      (usage.kinds['scan.tier1'] ?? 0) + (usage.kinds['scan.tier2'] ?? 0);

    const features = (sub.plan.features ?? {}) as PlanFeatures;
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
    const includedScans = Math.floor(
      sub.plan.includedScansPerMonth * periodFraction,
    );

    const unitsMinted = features.trialTotalCap
      ? await this.prisma.unit.count({ where: { tenantId } })
      : (usage.kinds['code.minted'] ?? 0);
    const includedUnits = features.trialTotalCap
      ? sub.plan.includedUnitsPerYear
      : Math.floor(sub.plan.includedUnitsPerYear * periodFraction);

    const unitPriceMinor =
      sub.currency === 'NGN'
        ? sub.plan.overageUnitPriceNgnMinor
        : sub.plan.overageUnitPriceGbpMinor;
    const scanPriceMinor =
      sub.currency === 'NGN'
        ? sub.plan.overageScanPriceNgnMinor
        : sub.plan.overageScanPriceGbpMinor;
    const projectedOverageMinor =
      Math.max(0, unitsMinted - includedUnits) * unitPriceMinor +
      Math.max(0, scansRecorded - includedScans) * scanPriceMinor;

    return {
      period: targetPeriod,
      unitsMinted,
      includedUnits,
      scansRecorded,
      includedScans,
      projectedOverageMinor,
    };
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
