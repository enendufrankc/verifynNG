'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Button, PageHeader, StatusChip, useToast } from '@verifyng/ui';
import { DownloadIcon } from 'lucide-react';
import { useAuth } from '@/lib/auth-store';
import { useTenantPath } from '@/lib/tenant-path';
import { queryKeys } from '@/lib/query';
import { formatMinor } from '@/lib/format-money';
import { ApiError } from '@/lib/api-client';
import {
  downloadInvoicePdf,
  getInvoice,
  payInvoice,
  type InvoiceStatus,
} from '@/lib/billing';

const STATUS_VARIANT: Record<
  InvoiceStatus,
  'neutral' | 'info' | 'success' | 'warning' | 'danger'
> = {
  draft: 'neutral',
  issued: 'info',
  paid: 'success',
  void: 'neutral',
  uncollectible: 'danger',
};

const LINE_LABELS: Record<string, string> = {
  plan_fee: 'Plan fee',
  unit_overage: 'Unit overage',
  scan_overage: 'Scan overage',
  proration_credit: 'Proration credit',
  proration_charge: 'Proration charge',
  adjustment: 'Adjustment',
};

export default function InvoiceDetailPage() {
  const params = useParams<{ id: string }>();
  const invoiceId = params.id;
  const { activeTenantId } = useAuth();
  const tenantPath = useTenantPath();
  const tenantId = activeTenantId ?? '';
  const { toast } = useToast();
  const [downloading, setDownloading] = useState(false);
  const [paying, setPaying] = useState(false);

  const invoiceQuery = useQuery({
    queryKey: queryKeys.billing.invoice(tenantId, invoiceId),
    queryFn: () => getInvoice(tenantPath, invoiceId),
    enabled: !!tenantId && !!invoiceId,
  });
  const invoice = invoiceQuery.data;

  async function handleDownload() {
    if (!invoice) return;
    setDownloading(true);
    try {
      await downloadInvoicePdf(tenantPath, invoice.id, `${invoice.number}.pdf`);
    } catch (error) {
      toast({
        title: 'Could not download PDF',
        description: error instanceof Error ? error.message : undefined,
        variant: 'destructive',
      });
    } finally {
      setDownloading(false);
    }
  }

  async function handlePay() {
    if (!invoice) return;
    setPaying(true);
    try {
      const { checkoutUrl } = await payInvoice(tenantPath, invoice.id);
      window.location.href = checkoutUrl;
    } catch (error) {
      toast({
        title: 'Could not start checkout',
        description: error instanceof ApiError ? error.message : undefined,
        variant: 'destructive',
      });
      setPaying(false);
    }
  }

  return (
    <div className="space-y-s6">
      <PageHeader
        title={invoice?.number ?? 'Invoice'}
        description={
          invoice
            ? `${new Date(invoice.periodStart).toLocaleDateString()} – ${new Date(invoice.periodEnd).toLocaleDateString()}`
            : undefined
        }
        actions={
          <div className="flex gap-2">
            <Button variant="outline" asChild>
              <Link href="/billing/invoices">Back to invoices</Link>
            </Button>
            {invoice && (
              <Button
                variant="outline"
                onClick={handleDownload}
                disabled={downloading}
              >
                <DownloadIcon className="mr-2 h-4 w-4" />
                {downloading ? 'Downloading…' : 'Download PDF'}
              </Button>
            )}
            {invoice && invoice.status === 'issued' && (
              <Button onClick={handlePay} disabled={paying}>
                {paying ? 'Starting checkout…' : 'Pay now'}
              </Button>
            )}
          </div>
        }
      />

      {invoice && (
        <>
          <div className="gap-s4 grid grid-cols-2 md:grid-cols-4">
            <div className="bg-surface border-border p-s4 rounded-md border shadow-sm">
              <div className="text-fg-muted text-xs font-medium tracking-wide uppercase">
                Status
              </div>
              <div className="mt-1">
                <StatusChip variant={STATUS_VARIANT[invoice.status]}>
                  {invoice.status}
                </StatusChip>
              </div>
            </div>
            <div className="bg-surface border-border p-s4 rounded-md border shadow-sm">
              <div className="text-fg-muted text-xs font-medium tracking-wide uppercase">
                Total
              </div>
              <div className="text-fg mt-1 text-2xl font-semibold">
                {formatMinor(invoice.totalMinor, invoice.currency)}
              </div>
            </div>
            <div className="bg-surface border-border p-s4 rounded-md border shadow-sm">
              <div className="text-fg-muted text-xs font-medium tracking-wide uppercase">
                Due
              </div>
              <div className="text-fg mt-1 text-sm">
                {invoice.dueAt
                  ? new Date(invoice.dueAt).toLocaleDateString()
                  : '—'}
              </div>
            </div>
            <div className="bg-surface border-border p-s4 rounded-md border shadow-sm">
              <div className="text-fg-muted text-xs font-medium tracking-wide uppercase">
                Paid
              </div>
              <div className="text-fg mt-1 text-sm">
                {invoice.paidAt
                  ? new Date(invoice.paidAt).toLocaleDateString()
                  : '—'}
              </div>
            </div>
          </div>

          <div className="bg-surface border-border overflow-hidden rounded-md border">
            <table className="w-full text-sm">
              <thead className="bg-surface-sunken text-fg-muted text-xs uppercase">
                <tr>
                  <th className="p-s3 text-left">Line</th>
                  <th className="p-s3 text-right">Qty</th>
                  <th className="p-s3 text-right">Unit price</th>
                  <th className="p-s3 text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {(invoice.lines ?? []).map((line) => (
                  <tr key={line.id} className="border-border border-t">
                    <td className="p-s3">
                      {LINE_LABELS[line.kind] ?? line.kind} — {line.description}
                    </td>
                    <td className="p-s3 text-right tabular-nums">
                      {line.quantity}
                    </td>
                    <td className="p-s3 text-right tabular-nums">
                      {formatMinor(line.unitPriceMinor, invoice.currency)}
                    </td>
                    <td className="p-s3 text-right tabular-nums">
                      {formatMinor(line.amountMinor, invoice.currency)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-border border-t">
                  <td colSpan={3} className="p-s3 text-right font-medium">
                    Subtotal
                  </td>
                  <td className="p-s3 text-right font-medium tabular-nums">
                    {formatMinor(invoice.subtotalMinor, invoice.currency)}
                  </td>
                </tr>
                <tr>
                  <td colSpan={3} className="p-s3 text-right font-medium">
                    Tax
                  </td>
                  <td className="p-s3 text-right font-medium tabular-nums">
                    {formatMinor(invoice.taxMinor, invoice.currency)}
                  </td>
                </tr>
                <tr>
                  <td
                    colSpan={3}
                    className="p-s3 text-right text-base font-semibold"
                  >
                    Total
                  </td>
                  <td className="p-s3 text-right text-base font-semibold tabular-nums">
                    {formatMinor(invoice.totalMinor, invoice.currency)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
