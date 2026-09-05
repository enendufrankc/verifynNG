'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import {
  Button,
  DataTable,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  EmptyState,
  PageHeader,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  StatusChip,
  Textarea,
  useToast,
} from '@verifyng/ui';
import { CreditCardIcon } from 'lucide-react';
import { queryKeys } from '@/lib/query';
import { formatMinor } from '@/lib/format-money';
import { ApiError } from '@/lib/api-client';
import {
  getTenantInvoicesForSupport,
  listPlatformSubscriptions,
  markInvoicePaidManually,
  type Currency,
  type PlatformSubscriptionRow,
  type SubscriptionStatus,
} from '@/lib/billing';

const STATUS_OPTIONS: SubscriptionStatus[] = [
  'trialing',
  'active',
  'past_due',
  'restricted',
  'cancelled',
];
const CURRENCY_OPTIONS: Currency[] = ['NGN', 'GBP'];

const STATUS_VARIANT: Record<
  SubscriptionStatus,
  'info' | 'success' | 'warning' | 'danger' | 'neutral'
> = {
  trialing: 'info',
  active: 'success',
  past_due: 'warning',
  restricted: 'danger',
  cancelled: 'neutral',
};

const INVOICE_STATUS_VARIANT: Record<
  string,
  'neutral' | 'info' | 'success' | 'warning' | 'danger'
> = {
  draft: 'neutral',
  issued: 'info',
  paid: 'success',
  void: 'neutral',
  uncollectible: 'danger',
};

export default function PlatformSubscriptionsPage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [statusFilter, setStatusFilter] = useState<SubscriptionStatus | 'all'>(
    'all',
  );
  const [currencyFilter, setCurrencyFilter] = useState<Currency | 'all'>('all');
  const [drawerTenant, setDrawerTenant] =
    useState<PlatformSubscriptionRow | null>(null);
  const [markPaidTarget, setMarkPaidTarget] = useState<string | null>(null);
  const [reason, setReason] = useState('');

  const filters = {
    status: statusFilter === 'all' ? undefined : statusFilter,
    currency: currencyFilter === 'all' ? undefined : currencyFilter,
  };
  const filterKey = JSON.stringify(filters);

  const listQuery = useQuery({
    queryKey: queryKeys.billing.platformSubscriptions(filterKey),
    queryFn: () => listPlatformSubscriptions(filters),
  });

  const invoicesQuery = useQuery({
    queryKey: queryKeys.billing.supportInvoices(drawerTenant?.tenantId ?? ''),
    queryFn: () => getTenantInvoicesForSupport(drawerTenant!.tenantId),
    enabled: !!drawerTenant,
  });

  const markPaidMutation = useMutation({
    mutationFn: (invoiceId: string) =>
      markInvoicePaidManually(invoiceId, reason),
    onSuccess: () => {
      setMarkPaidTarget(null);
      setReason('');
      queryClient.invalidateQueries({
        queryKey: queryKeys.billing.platformSubscriptions(filterKey),
      });
      if (drawerTenant) {
        queryClient.invalidateQueries({
          queryKey: queryKeys.billing.supportInvoices(drawerTenant.tenantId),
        });
      }
      toast({ title: 'Invoice marked paid' });
    },
    onError: (error: unknown) => {
      toast({
        title:
          error instanceof ApiError ? error.message : 'Could not mark paid',
        variant: 'destructive',
      });
    },
  });

  const columns: ColumnDef<PlatformSubscriptionRow>[] = [
    {
      accessorKey: 'tenantName',
      header: 'Tenant',
      cell: ({ row }) => (
        <button
          className="text-brand hover:underline"
          onClick={() => setDrawerTenant(row.original)}
        >
          {row.original.tenantName}
        </button>
      ),
    },
    { accessorKey: 'planName', header: 'Plan' },
    {
      accessorKey: 'status',
      header: 'Status',
      cell: ({ row }) => (
        <StatusChip variant={STATUS_VARIANT[row.original.status]}>
          {row.original.status}
        </StatusChip>
      ),
    },
    { accessorKey: 'currency', header: 'Currency' },
    {
      accessorKey: 'mrrMinor',
      header: 'MRR',
      cell: ({ row }) =>
        formatMinor(row.original.mrrMinor, row.original.currency),
    },
    {
      accessorKey: 'nextInvoiceAt',
      header: 'Next invoice',
      cell: ({ row }) =>
        new Date(row.original.nextInvoiceAt).toLocaleDateString(),
    },
    {
      accessorKey: 'overdueMinor',
      header: 'Overdue',
      cell: ({ row }) =>
        row.original.overdueMinor > 0 ? (
          <StatusChip variant="danger">
            {formatMinor(row.original.overdueMinor, row.original.currency)}
          </StatusChip>
        ) : (
          '—'
        ),
    },
  ];

  return (
    <div className="space-y-s6">
      <PageHeader
        title="Subscriptions"
        description="Every tenant's subscription, plan, and payment status."
      />

      <div className="flex gap-3">
        <Select
          value={statusFilter}
          onValueChange={(v) =>
            setStatusFilter(v as SubscriptionStatus | 'all')
          }
        >
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {STATUS_OPTIONS.map((s) => (
              <SelectItem key={s} value={s}>
                {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={currencyFilter}
          onValueChange={(v) => setCurrencyFilter(v as Currency | 'all')}
        >
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Currency" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All currencies</SelectItem>
            {CURRENCY_OPTIONS.map((c) => (
              <SelectItem key={c} value={c}>
                {c}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <DataTable
        columns={columns}
        data={listQuery.data ?? []}
        isLoading={listQuery.isLoading}
        emptyState={
          <EmptyState icon={CreditCardIcon} title="No subscriptions found" />
        }
      />

      <Sheet
        open={!!drawerTenant}
        onOpenChange={(open) => !open && setDrawerTenant(null)}
      >
        <SheetContent side="right" className="w-full max-w-lg overflow-y-auto">
          <SheetHeader>
            <SheetTitle>{drawerTenant?.tenantName} — invoices</SheetTitle>
          </SheetHeader>
          <div className="mt-4 space-y-3">
            {(invoicesQuery.data?.invoices ?? []).map((invoice) => (
              <div
                key={invoice.id}
                className="border-border flex items-center justify-between rounded-md border p-3"
              >
                <div>
                  <p className="text-fg text-sm font-medium">
                    {invoice.number}
                  </p>
                  <p className="text-fg-muted text-xs">
                    {formatMinor(invoice.totalMinor, invoice.currency)}
                    {invoice.dueAt &&
                      ` · due ${new Date(invoice.dueAt).toLocaleDateString()}`}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <StatusChip
                    variant={
                      INVOICE_STATUS_VARIANT[invoice.status] ?? 'neutral'
                    }
                  >
                    {invoice.status}
                  </StatusChip>
                  {invoice.status === 'issued' && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setMarkPaidTarget(invoice.id)}
                    >
                      Mark paid
                    </Button>
                  )}
                </div>
              </div>
            ))}
            {invoicesQuery.data && invoicesQuery.data.invoices.length === 0 && (
              <p className="text-fg-muted text-sm">
                No invoices for this tenant.
              </p>
            )}
          </div>
        </SheetContent>
      </Sheet>

      <Dialog
        open={!!markPaidTarget}
        onOpenChange={(open) => {
          if (!open) {
            setMarkPaidTarget(null);
            setReason('');
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Mark this invoice paid (bank transfer)</DialogTitle>
          </DialogHeader>
          <Textarea
            placeholder="Reason (required) — e.g. bank transfer ref, date confirmed"
            rows={3}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
          <DialogFooter>
            <Button
              disabled={!reason.trim() || markPaidMutation.isPending}
              onClick={() =>
                markPaidTarget && markPaidMutation.mutate(markPaidTarget)
              }
            >
              {markPaidMutation.isPending ? 'Marking paid…' : 'Mark paid'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
