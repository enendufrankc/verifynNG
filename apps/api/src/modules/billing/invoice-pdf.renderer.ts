import * as React from 'react';
import {
  Document,
  Font,
  Page,
  StyleSheet,
  Text,
  View,
  renderToBuffer,
} from '@react-pdf/renderer';
import { Currency, Invoice, InvoiceLine } from '@prisma/client';
import path from 'node:path';
import { formatMinor } from './currency.util';

// Helvetica (the PDF standard-14 font @react-pdf/renderer falls back to)
// has no glyph for ₦ (U+20A6) — it renders as a broken-character box. Noto
// Sans covers it (and £), so every invoice uses it instead. Bundled locally
// (not fetched from a CDN) so PDF rendering works fully offline in
// `docker compose up`, matching AGENTS.md's "local Docker is the target."
// `apps/api/{src,dist}/modules/billing` are both exactly 3 levels below
// `apps/api/`, so this path resolves the same under tsx (src) and the
// built app (dist).
Font.register({
  family: 'Noto Sans',
  src: path.join(
    __dirname,
    '..',
    '..',
    '..',
    'assets',
    'fonts',
    'NotoSans-Regular.ttf',
  ),
});

const styles = StyleSheet.create({
  page: {
    padding: 32,
    fontSize: 10,
    color: '#1a1a2e',
    fontFamily: 'Noto Sans',
  },
  title: { fontSize: 18, marginBottom: 4 },
  subtitle: { fontSize: 10, color: '#666', marginBottom: 16 },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  section: { marginTop: 16, marginBottom: 8 },
  tableHeader: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#ddd',
    paddingBottom: 4,
    marginBottom: 4,
    fontSize: 9,
    color: '#666',
  },
  tableRow: {
    flexDirection: 'row',
    paddingVertical: 4,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  colDescription: { flex: 4 },
  colQty: { flex: 1, textAlign: 'right' },
  colUnitPrice: { flex: 2, textAlign: 'right' },
  colAmount: { flex: 2, textAlign: 'right' },
  totals: { marginTop: 12, alignItems: 'flex-end' },
  totalRow: {
    flexDirection: 'row',
    width: 200,
    justifyContent: 'space-between',
    marginBottom: 2,
  },
  totalLabel: { color: '#666' },
  grandTotal: { fontSize: 12, marginTop: 4 },
  footer: { marginTop: 32, fontSize: 9, color: '#666' },
});

export interface InvoicePdfTenant {
  name: string;
  legalName: string | null;
  country: string | null;
}

const LINE_LABELS: Record<string, string> = {
  plan_fee: 'Plan fee',
  unit_overage: 'Unit overage',
  scan_overage: 'Scan overage',
  proration_credit: 'Proration credit',
  proration_charge: 'Proration charge',
  adjustment: 'Adjustment',
};

function formatDate(d: Date | null): string {
  if (!d) return '—';
  return d.toISOString().slice(0, 10);
}

export async function renderInvoicePdf(
  invoice: Invoice & { lines: InvoiceLine[] },
  tenant: InvoicePdfTenant,
  currency: Currency = invoice.currency,
): Promise<Buffer> {
  const displayName = tenant.legalName ?? tenant.name;

  const rows = invoice.lines.map((line) =>
    React.createElement(
      View,
      { key: line.id, style: styles.tableRow },
      React.createElement(
        Text,
        { style: styles.colDescription },
        `${LINE_LABELS[line.kind] ?? line.kind} — ${line.description}`,
      ),
      React.createElement(
        Text,
        { style: styles.colQty },
        String(line.quantity),
      ),
      React.createElement(
        Text,
        { style: styles.colUnitPrice },
        formatMinor(line.unitPriceMinor, currency),
      ),
      React.createElement(
        Text,
        { style: styles.colAmount },
        formatMinor(line.amountMinor, currency),
      ),
    ),
  );

  const doc = React.createElement(
    Document,
    { title: `Invoice ${invoice.number}` },
    React.createElement(
      Page,
      { size: 'A4', style: styles.page },
      React.createElement(Text, { style: styles.title }, displayName),
      React.createElement(
        Text,
        { style: styles.subtitle },
        tenant.country ? `Country: ${tenant.country}` : '',
      ),
      React.createElement(
        Text,
        { style: styles.title },
        `Invoice ${invoice.number}`,
      ),
      React.createElement(
        View,
        { style: styles.metaRow },
        React.createElement(
          Text,
          null,
          `Period: ${formatDate(invoice.periodStart)} – ${formatDate(invoice.periodEnd)}`,
        ),
        React.createElement(Text, null, `Status: ${invoice.status}`),
      ),
      React.createElement(
        View,
        { style: styles.metaRow },
        React.createElement(
          Text,
          null,
          `Issued: ${formatDate(invoice.issuedAt)}`,
        ),
        React.createElement(Text, null, `Due: ${formatDate(invoice.dueAt)}`),
      ),
      React.createElement(
        View,
        { style: styles.section },
        React.createElement(
          View,
          { style: styles.tableHeader },
          React.createElement(
            Text,
            { style: styles.colDescription },
            'Description',
          ),
          React.createElement(Text, { style: styles.colQty }, 'Qty'),
          React.createElement(
            Text,
            { style: styles.colUnitPrice },
            'Unit price',
          ),
          React.createElement(Text, { style: styles.colAmount }, 'Amount'),
        ),
        ...rows,
      ),
      React.createElement(
        View,
        { style: styles.totals },
        React.createElement(
          View,
          { style: styles.totalRow },
          React.createElement(Text, { style: styles.totalLabel }, 'Subtotal'),
          React.createElement(
            Text,
            null,
            formatMinor(invoice.subtotalMinor, currency),
          ),
        ),
        React.createElement(
          View,
          { style: styles.totalRow },
          React.createElement(Text, { style: styles.totalLabel }, 'Tax'),
          React.createElement(
            Text,
            null,
            formatMinor(invoice.taxMinor, currency),
          ),
        ),
        React.createElement(
          View,
          { style: { ...styles.totalRow, ...styles.grandTotal } },
          React.createElement(Text, null, 'Total'),
          React.createElement(
            Text,
            null,
            formatMinor(invoice.totalMinor, currency),
          ),
        ),
      ),
      React.createElement(
        Text,
        { style: styles.footer },
        'Pay online from your billing dashboard, or by bank transfer using the invoice number as reference. Questions? Contact your account owner.',
      ),
    ),
  );

  return renderToBuffer(doc);
}
