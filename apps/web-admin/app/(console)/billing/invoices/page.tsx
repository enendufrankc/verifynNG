'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import {
  Button,
  DataTable,
  EmptyState,
  PageHeader,
  StatusChip,
} from '@verifyng/ui';
import { FileTextIcon } from 'lucide-react';
import { useAuth } from '@/lib/auth-store';
import { useTenantPath } from '@/lib/tenant-path';
import { queryKeys } from '@/lib/query';
import { formatMinor } from '@/lib/format-money';
import { listInvoices, type Invoice, type InvoiceStatus } from '@/lib/billing';

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

export default function InvoicesPage() {
  const { activeTenantId } = useAuth();
  const tenantPath = useTenantPath();
  const tenantId = activeTenantId ?? '';
  const [cursor, setCursor] = useState<string | undefined>(undefined);

  const query = useQuery({
    queryKey: [...queryKeys.billing.invoices(tenantId), cursor],
    queryFn: () => listInvoices(tenantPath, cursor),
    enabled: !!tenantId,
  });

  const columns: ColumnDef<Invoice>[] = [
    {
      accessorKey: 'number',
      header: 'Invoice',
      cell: ({ row }) => (
        <Link
          href={`/billing/invoices/${row.original.id}`}
          className="text-brand hover:underline"
        >
          {row.original.number}
        </Link>
      ),
    },
    {
      accessorKey: 'status',
      header: 'Status',
      cell: ({ row }) => (
        <StatusChip variant={STATUS_VARIANT[row.original.status]}>
          {row.original.status}
        </StatusChip>
      ),
    },
    {
      accessorKey: 'totalMinor',
      header: 'Total',
      cell: ({ row }) =>
        formatMinor(row.original.totalMinor, row.original.currency),
    },
    {
      accessorKey: 'dueAt',
      header: 'Due',
      cell: ({ row }) =>
        row.original.dueAt
          ? new Date(row.original.dueAt).toLocaleDateString()
          : '—',
    },
    {
      accessorKey: 'createdAt',
      header: 'Created',
      cell: ({ row }) => new Date(row.original.createdAt).toLocaleDateString(),
    },
  ];

  return (
    <div className="space-y-s6">
      <PageHeader
        title="Invoices"
        description="Monthly and proration invoices for this organization."
        actions={
          <Button variant="outline" asChild>
            <Link href="/billing">Back to overview</Link>
          </Button>
        }
      />

      <DataTable
        columns={columns}
        data={query.data?.invoices ?? []}
        isLoading={query.isLoading}
        emptyState={<EmptyState icon={FileTextIcon} title="No invoices yet" />}
        pagination={{
          hasPrev: !!cursor,
          hasNext: !!query.data?.nextCursor,
          onPrev: () => setCursor(undefined),
          onNext: () => setCursor(query.data?.nextCursor ?? undefined),
        }}
      />
    </div>
  );
}
