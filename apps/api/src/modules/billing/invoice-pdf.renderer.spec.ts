import { describe, expect, it } from 'vitest';
import { PDFParse } from 'pdf-parse';
import { Currency, Invoice, InvoiceLine } from '@prisma/client';
import { renderInvoicePdf } from './invoice-pdf.renderer';

function makeInvoice(): Invoice & { lines: InvoiceLine[] } {
  const now = new Date('2026-09-01T00:00:00.000Z');
  return {
    id: 'inv_1',
    tenantId: 'ivoryglow',
    number: 'INV-202608-ivoryglow-1',
    status: 'issued',
    currency: 'NGN' as Currency,
    periodStart: new Date('2026-08-01T00:00:00.000Z'),
    periodEnd: new Date('2026-09-01T00:00:00.000Z'),
    subtotalMinor: 6_600_000,
    taxMinor: 0,
    totalMinor: 6_600_000,
    issuedAt: now,
    dueAt: new Date('2026-09-08T00:00:00.000Z'),
    paidAt: null,
    attemptCount: 0,
    nextRetryAt: null,
    usageSnapshot: {},
    createdAt: now,
    lines: [
      {
        id: 'line_1',
        invoiceId: 'inv_1',
        tenantId: 'ivoryglow',
        kind: 'plan_fee',
        description: 'Starter plan fee',
        quantity: 1,
        unitPriceMinor: 4_500_000,
        amountMinor: 4_500_000,
      },
      {
        id: 'line_2',
        invoiceId: 'inv_1',
        tenantId: 'ivoryglow',
        kind: 'unit_overage',
        description: 'Unit overage (2000 units)',
        quantity: 2000,
        unitPriceMinor: 800,
        amountMinor: 1_600_000,
      },
      {
        id: 'line_3',
        invoiceId: 'inv_1',
        tenantId: 'ivoryglow',
        kind: 'scan_overage',
        description: 'Scan overage (10000 scans)',
        quantity: 10_000,
        unitPriceMinor: 50,
        amountMinor: 500_000,
      },
    ],
  };
}

describe('renderInvoicePdf (golden text)', () => {
  it('produces a PDF whose extracted text matches AC4', async () => {
    const buffer = await renderInvoicePdf(makeInvoice(), {
      name: 'IVORY GLOW',
      legalName: 'Ivory Glow Cosmetics Ltd',
      country: 'NG',
    });

    expect(buffer.byteLength).toBeGreaterThan(1000);
    // First bytes of every PDF are the %PDF- magic number.
    expect(buffer.subarray(0, 5).toString('utf8')).toBe('%PDF-');

    const parser = new PDFParse({ data: buffer });
    const { text } = await parser.getText();
    await parser.destroy();

    expect(text).toContain('Ivory Glow Cosmetics Ltd');
    expect(text).toContain('INV-202608-ivoryglow-1');
    expect(text).toContain('₦66,000.00'); // AC4
    expect(text).toContain('₦45,000.00'); // plan fee
    expect(text).toContain('₦16,000.00'); // unit overage amount
    expect(text).toContain('₦5,000.00'); // scan overage amount
  });

  it('falls back to name when legalName is not set', async () => {
    const buffer = await renderInvoicePdf(makeInvoice(), {
      name: 'IVORY GLOW',
      legalName: null,
      country: null,
    });
    const parser = new PDFParse({ data: buffer });
    const { text } = await parser.getText();
    await parser.destroy();
    expect(text).toContain('IVORY GLOW');
  });
});
