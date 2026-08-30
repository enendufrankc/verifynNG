import { describe, expect, it } from 'vitest';
import { TemplateRegistry } from './registry';
import { BrandingData, TemplateData, TemplateId } from './template-data';

const branding: BrandingData = {
  tenantName: 'IVORY GLOW',
  logoUrl: 'https://example.test/logo.png',
  primaryColor: '#8b5cf6',
  footerAddress: '1 Test Street, Lagos',
  unsubscribeLine: 'Manage notification preferences in your console.',
};

const samples: { [T in TemplateId]: TemplateData[T] } = {
  'tenant.welcome': {
    tenantName: 'IVORY GLOW',
    loginUrl: 'https://example.test/login',
  },
  'verification.approved': {
    productName: 'Glow Serum',
    tier1Code: 'ivoryglow.2.k1.demo',
    verifiedAt: '2026-08-29T00:00:00.000Z',
  },
  'verification.rejected': {
    productName: 'Glow Serum',
    tier1Code: 'ivoryglow.2.k1.demo',
    reason: 'Code was not found',
  },
  'batch.minted': {
    productName: 'Glow Serum',
    batchSku: 'GLOW-001',
    unitCount: 100,
    dashboardUrl: 'https://example.test/batches/GLOW-001',
  },
  'manifest.delivered': {
    oemName: 'Example OEM',
    batchSku: 'GLOW-001',
    unitCount: 100,
    dashboardUrl: 'https://example.test/manifests/GLOW-001',
  },
  'receipt.mismatch': {
    oemName: 'Example OEM',
    batchSku: 'GLOW-001',
    expectedCount: 100,
    receivedCount: 98,
    dashboardUrl: 'https://example.test/manifests/GLOW-001',
  },
  'anomaly.alert': {
    tenantName: 'Ivory Glow',
    rule: 'duplicate_first',
    score: 80,
    unitRef: 'ivoryglow.1.k1.demo',
    batchRef: 'IVORYGLOW-20260830-A',
    summary: 'Same unit scanned twice 850km apart within the window',
    cities: ['Lagos', 'Kano'],
    adminUrl: 'https://example.test/anomalies/1',
  },
  'report.received': {
    reportReference: 'RPT-001',
    tier1Code: 'ivoryglow.2.k1.demo',
    reportType: 'suspected counterfeit',
    reportedAt: '2026-08-29T00:00:00.000Z',
    dashboardUrl: 'https://example.test/reports/RPT-001',
  },
  'invoice.issued': {
    invoiceNumber: 'INV-001',
    amount: '₦10,000',
    dueDate: '2026-09-29',
    dashboardUrl: 'https://example.test/invoices/INV-001',
  },
  'invoice.paid': {
    invoiceNumber: 'INV-001',
    amount: '₦10,000',
    paidAt: '2026-08-29T00:00:00.000Z',
  },
  'invoice.failed': {
    invoiceNumber: 'INV-001',
    amount: '₦10,000',
    reason: 'Card declined',
    retryUrl: 'https://example.test/invoices/INV-001/retry',
  },
  'password.reset': {
    resetUrl: 'https://example.test/reset/token',
    expiresIn: '30 minutes',
  },
  'mfa.recovery': {
    recoveryUrl: 'https://example.test/recover/token',
    expiresIn: '30 minutes',
  },
  'notification.test': {
    message: 'Template smoke test',
    timestamp: '2026-08-29T00:00:00.000Z',
  },
};

describe('TemplateRegistry', () => {
  it.each(Object.keys(samples) as TemplateId[])('renders %s', (templateId) => {
    const rendered = new TemplateRegistry().render(
      templateId,
      samples[templateId],
      branding,
    );

    expect(rendered).toMatchSnapshot();
  });

  it('escapes untrusted template data in HTML', () => {
    const rendered = new TemplateRegistry().render(
      'notification.test',
      { message: '<script>alert(1)</script>', timestamp: 'now' },
      branding,
    );

    expect(rendered.html).not.toContain('<script>alert(1)</script>');
    expect(rendered.html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
  });
});
