'use client';

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
import { AlertTriangleIcon, TruckIcon } from 'lucide-react';
import { queryKeys } from '@/lib/query';
import { listOemDeliveries, type OemDelivery } from '@/lib/oem-portal';
import type { DeliveryStatus } from '@/lib/deliveries';

const STATUS_VARIANT: Record<
  DeliveryStatus,
  'success' | 'warning' | 'danger' | 'info' | 'neutral'
> = {
  delivered: 'info',
  downloaded: 'info',
  receipted: 'success',
  revoked: 'neutral',
  expired: 'warning',
};

export default function OemDeliveriesPage() {
  const deliveriesQuery = useQuery({
    queryKey: queryKeys.oemPortal.list(),
    queryFn: listOemDeliveries,
  });

  const columns: ColumnDef<OemDelivery>[] = [
    {
      id: 'product',
      header: 'Product',
      cell: ({ row }) =>
        `${row.original.batch.product.sku} — ${row.original.batch.product.name}`,
    },
    {
      id: 'units',
      header: 'Units',
      cell: ({ row }) => row.original.batch.count.toLocaleString(),
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
      accessorKey: 'expiresAt',
      header: 'Expires',
      cell: ({ row }) => new Date(row.original.expiresAt).toLocaleString(),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Your deliveries"
        description="Batches delivered to you for printing."
      />

      {deliveriesQuery.isError ? (
        <EmptyState
          icon={AlertTriangleIcon}
          title="Couldn't load deliveries"
          description="The delivery service isn't reachable yet."
        />
      ) : (
        <DataTable
          columns={columns}
          data={deliveriesQuery.data ?? []}
          isLoading={deliveriesQuery.isLoading}
          emptyState={<EmptyState icon={TruckIcon} title="No deliveries yet" />}
          rowActions={(row) => (
            <Button variant="ghost" size="sm" asChild>
              <Link href={`/oem/deliveries/${row.id}`}>View</Link>
            </Button>
          )}
        />
      )}
    </div>
  );
}
