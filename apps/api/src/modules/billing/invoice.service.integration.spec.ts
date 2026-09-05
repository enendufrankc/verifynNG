import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { PrismaClient } from '@prisma/client';
import {
  createTestDatabase,
  dropTestSchema,
  disconnectTestHelper,
  seedPlans,
} from '@verifynng/db';
import { InvoiceService } from './invoice.service';
import { EventsService } from '../../common/events.service';
import { UsageReadService } from '../metering/usage-read.service';
import { BillingClock } from './billing-clock.service';

describe('InvoiceService integration (real Postgres)', () => {
  let prisma: PrismaClient;
  let schemaName: string;
  let invoices: InvoiceService;

  async function makeTenantOnStarter(
    currentPeriodStart: Date,
    currentPeriodEnd: Date,
  ) {
    const tenant = await prisma.tenant.create({
      data: {
        slug: `inv-test-${Math.random().toString(36).slice(2)}`,
        name: 'Invoice Test',
        status: 'active',
      },
    });
    const starter = await prisma.plan.findUniqueOrThrow({
      where: { code: 'starter' },
    });
    await prisma.subscription.create({
      data: {
        tenantId: tenant.id,
        planId: starter.id,
        status: 'active',
        currency: 'NGN',
        currentPeriodStart,
        currentPeriodEnd,
      },
    });
    return tenant.id;
  }

  async function seedFinalisedUsage(
    tenantId: string,
    month: string,
    unitsMinted: number,
    scansTier1: number,
  ) {
    await prisma.usageSummary.create({
      data: {
        tenantId,
        month,
        kind: 'code_minted',
        quantity: unitsMinted,
        eventCount: unitsMinted,
        finalisedAt: new Date(),
      },
    });
    await prisma.usageSummary.create({
      data: {
        tenantId,
        month,
        kind: 'scan_tier1',
        quantity: scansTier1,
        eventCount: scansTier1,
        finalisedAt: new Date(),
      },
    });
  }

  beforeAll(async () => {
    const result = await createTestDatabase('invoice-service-integration');
    prisma = result.prisma;
    schemaName = result.schemaName;
    await seedPlans(prisma);
    invoices = new InvoiceService(
      prisma,
      new EventsService(new EventEmitter2()),
      new UsageReadService(prisma),
      new BillingClock(),
    );
  }, 30000);

  afterAll(async () => {
    await dropTestSchema(schemaName, prisma);
    await disconnectTestHelper();
  });

  it('AC4: 12,000 units + 60,000 scans on starter produces the documented line amounts', async () => {
    const periodStart = new Date(Date.UTC(2026, 7, 1)); // 2026-08-01
    const periodEnd = new Date(Date.UTC(2026, 8, 1)); // 2026-09-01
    const tenantId = await makeTenantOnStarter(periodStart, periodEnd);
    await seedFinalisedUsage(tenantId, '2026-08', 12_000, 60_000);

    const invoice = await invoices.generateForPeriod(tenantId, '2026-08');
    const lines = await prisma.invoiceLine.findMany({
      where: { invoiceId: invoice.id },
      orderBy: { kind: 'asc' },
    });

    expect(lines).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: 'plan_fee', amountMinor: 4_500_000 }),
        expect.objectContaining({
          kind: 'unit_overage',
          quantity: 2_000,
          unitPriceMinor: 800,
          amountMinor: 1_600_000,
        }),
        expect.objectContaining({
          kind: 'scan_overage',
          quantity: 10_000,
          unitPriceMinor: 50,
          amountMinor: 500_000,
        }),
      ]),
    );
    expect(invoice.subtotalMinor).toBe(6_600_000);
    expect(invoice.totalMinor).toBe(6_600_000); // BILLING_TAX_RATE_BPS_NGN defaults to 0
    expect(invoice.status).toBe('draft');
    expect(invoice.number).toMatch(/^INV-202608-inv-test-.+-1$/);
  });

  it('omits overage lines when usage is within the included allowance', async () => {
    const periodStart = new Date(Date.UTC(2026, 7, 1));
    const periodEnd = new Date(Date.UTC(2026, 8, 1));
    const tenantId = await makeTenantOnStarter(periodStart, periodEnd);
    await seedFinalisedUsage(tenantId, '2026-08', 1_000, 1_000);

    const invoice = await invoices.generateForPeriod(tenantId, '2026-08');
    const lines = await prisma.invoiceLine.findMany({
      where: { invoiceId: invoice.id },
    });

    expect(lines).toHaveLength(1);
    expect(lines[0].kind).toBe('plan_fee');
    expect(invoice.totalMinor).toBe(4_500_000);
  });

  it('throws when usage for the period is not finalised', async () => {
    const periodStart = new Date(Date.UTC(2026, 7, 1));
    const periodEnd = new Date(Date.UTC(2026, 8, 1));
    const tenantId = await makeTenantOnStarter(periodStart, periodEnd);
    await prisma.usageSummary.create({
      data: {
        tenantId,
        month: '2026-08',
        kind: 'code_minted',
        quantity: 500,
        eventCount: 500,
        finalisedAt: null,
      },
    });

    await expect(
      invoices.generateForPeriod(tenantId, '2026-08'),
    ).rejects.toThrow(/not_finalised/);
  });

  it('scales the included allowance by periodFraction for a mid-period signup', async () => {
    // Subscription starts on day 16 of a 31-day August -> ~16/31 of the
    // month remaining, so the included scan allowance is roughly halved.
    const periodStart = new Date(Date.UTC(2026, 7, 1));
    const periodEnd = new Date(Date.UTC(2026, 8, 1));
    const midPeriodStart = new Date(Date.UTC(2026, 7, 16));
    const tenantId = await makeTenantOnStarter(midPeriodStart, periodEnd);
    // 30,000 scans, included is 50,000/month * (16/31) ≈ 25,806 -> overage
    await seedFinalisedUsage(tenantId, '2026-08', 0, 30_000);

    const invoice = await invoices.generateForPeriod(tenantId, '2026-08');
    const lines = await prisma.invoiceLine.findMany({
      where: { invoiceId: invoice.id },
    });
    const scanLine = lines.find((l) => l.kind === 'scan_overage');
    expect(scanLine).toBeDefined();
    expect(scanLine!.quantity).toBeGreaterThan(0);
    expect(scanLine!.quantity).toBeLessThan(30_000);

    // Sanity-check against the periodStart-based baseline (full month, no fraction).
    const fullMonthTenantId = await makeTenantOnStarter(periodStart, periodEnd);
    await seedFinalisedUsage(fullMonthTenantId, '2026-08', 0, 30_000);
    const fullMonthInvoice = await invoices.generateForPeriod(
      fullMonthTenantId,
      '2026-08',
    );
    const fullMonthLines = await prisma.invoiceLine.findMany({
      where: { invoiceId: fullMonthInvoice.id },
    });
    expect(
      fullMonthLines.find((l) => l.kind === 'scan_overage'),
    ).toBeUndefined();
  });

  it('issue() sets dueAt +7d, emits invoice.issued, and is not re-issuable', async () => {
    const periodStart = new Date(Date.UTC(2026, 7, 1));
    const periodEnd = new Date(Date.UTC(2026, 8, 1));
    const tenantId = await makeTenantOnStarter(periodStart, periodEnd);
    await seedFinalisedUsage(tenantId, '2026-08', 1_000, 1_000);
    const invoice = await invoices.generateForPeriod(tenantId, '2026-08');

    const issued = await invoices.issue(invoice.id);
    expect(issued.status).toBe('issued');
    expect(issued.issuedAt).not.toBeNull();
    expect(issued.dueAt!.getTime() - issued.issuedAt!.getTime()).toBe(
      7 * 24 * 60 * 60 * 1000,
    );

    await expect(invoices.issue(invoice.id)).rejects.toThrow(
      /invoice_not_draft/,
    );
  });

  it('rejects generating an invoice for an enterprise (customPricing) plan', async () => {
    const tenant = await prisma.tenant.create({
      data: {
        slug: `inv-ent-${Math.random().toString(36).slice(2)}`,
        name: 'Ent Test',
      },
    });
    const enterprise = await prisma.plan.findUniqueOrThrow({
      where: { code: 'enterprise' },
    });
    await prisma.subscription.create({
      data: {
        tenantId: tenant.id,
        planId: enterprise.id,
        status: 'active',
        currency: 'NGN',
        currentPeriodStart: new Date(Date.UTC(2026, 7, 1)),
        currentPeriodEnd: new Date(Date.UTC(2026, 8, 1)),
      },
    });
    await expect(
      invoices.generateForPeriod(tenant.id, '2026-08'),
    ).rejects.toThrow(/invoiced_manually/);
  });

  describe('usageVsPlan (T11)', () => {
    it('reports zero projected overage when usage is within the plan allowance', async () => {
      const periodStart = new Date(Date.UTC(2026, 7, 1));
      const periodEnd = new Date(Date.UTC(2026, 8, 1));
      const tenantId = await makeTenantOnStarter(periodStart, periodEnd);
      await seedFinalisedUsage(tenantId, '2026-08', 1_000, 1_000);

      const result = await invoices.usageVsPlan(tenantId, '2026-08');
      expect(result.unitsMinted).toBe(1_000);
      expect(result.includedUnits).toBe(10_000); // starter, full month -> periodFraction 1
      expect(result.scansRecorded).toBe(1_000);
      expect(result.includedScans).toBe(50_000);
      expect(result.projectedOverageMinor).toBe(0);
    });

    it("projects overage cost using the plan's NGN overage prices when usage exceeds the allowance", async () => {
      const periodStart = new Date(Date.UTC(2026, 7, 1));
      const periodEnd = new Date(Date.UTC(2026, 8, 1));
      const tenantId = await makeTenantOnStarter(periodStart, periodEnd);
      await seedFinalisedUsage(tenantId, '2026-08', 12_000, 60_000);

      const result = await invoices.usageVsPlan(tenantId, '2026-08');
      // Same numbers as the AC4 generateForPeriod test: 2,000 unit overage @
      // 800 kobo + 10,000 scan overage @ 50 kobo = 1,600,000 + 500,000.
      expect(result.projectedOverageMinor).toBe(2_100_000);
    });

    it('compares a trialTotalCap plan against the lifetime Unit count, not the calendar-month usage slice', async () => {
      const tenant = await prisma.tenant.create({
        data: {
          slug: `inv-trial-${Math.random().toString(36).slice(2)}`,
          name: 'Trial Test',
        },
      });
      const freeTrial = await prisma.plan.findUniqueOrThrow({
        where: { code: 'free-trial' },
      });
      await prisma.subscription.create({
        data: {
          tenantId: tenant.id,
          planId: freeTrial.id,
          status: 'trialing',
          currency: 'NGN',
          currentPeriodStart: new Date(Date.UTC(2026, 7, 1)),
          currentPeriodEnd: new Date(Date.UTC(2026, 8, 31)),
        },
      });
      const product = await prisma.product.create({
        data: { tenantId: tenant.id, sku: `sku-${Math.random()}`, name: 'P' },
      });
      const batch = await prisma.batch.create({
        data: {
          tenantId: tenant.id,
          productId: product.id,
          count: 3,
          idempotencyKey: `idem-${Math.random()}`,
          requestedBy: 'test',
          watermark: 'w',
          kid: 'k1',
        },
      });
      for (let i = 0; i < 3; i++) {
        await prisma.unit.create({
          data: {
            tenantId: tenant.id,
            batchId: batch.id,
            tier1Code: `t1-${batch.id}-${i}`,
            tier2Hash: `t2-${batch.id}-${i}`,
            serial: i,
            productId: product.id,
          },
        });
      }

      const result = await invoices.usageVsPlan(tenant.id, '2026-08');
      expect(result.unitsMinted).toBe(3); // lifetime Unit count, not usage.kinds['code.minted']
      expect(result.includedUnits).toBe(500); // free-trial's full lifetime cap, unscaled by periodFraction
      expect(result.projectedOverageMinor).toBe(0); // free-trial's overage prices are 0
    });
  });
});
