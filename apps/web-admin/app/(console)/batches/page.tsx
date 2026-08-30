'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import {
  Button,
  DataTable,
  EmptyState,
  PageHeader,
  ProgressBar,
  StatusChip,
} from '@verifyng/ui';
import { LayersIcon, PlusIcon, AlertTriangleIcon } from 'lucide-react';
import { useAuth } from '@/lib/auth-store';
import { useTenantPath } from '@/lib/tenant-path';
import { queryKeys } from '@/lib/query';
import { listBatches, type Batch, type BatchStatus } from '@/lib/batches';
import { listProducts } from '@/lib/products';
import { listOems } from '@/lib/oems';

const STATUS_VARIANT: Record<
  BatchStatus,
  'success' | 'warning' | 'danger' | 'info' | 'neutral'
> = {
  minting: 'info',
  minted: 'success',
  delivered: 'success',
  printed: 'success',
  shipped: 'success',
  closed: 'neutral',
  failed: 'danger',
};

export default function BatchesPage() {
  const { activeTenantId, role } = useAuth();
  const tenantPath = useTenantPath();
  const isOwner = role === 'owner';

  const batchesQuery = useQuery({
    queryKey: queryKeys.batches.list(activeTenantId ?? ''),
    queryFn: () => listBatches(tenantPath),
    enabled: !!activeTenantId,
    refetchInterval: (query) =>
      query.state.data?.some((b) => b.status === 'minting') ? 2000 : false,
  });

  const productsQuery = useQuery({
    queryKey: queryKeys.products.list(activeTenantId ?? ''),
    queryFn: () => listProducts(tenantPath),
    enabled: !!activeTenantId,
  });

  const oemsQuery = useQuery({
    queryKey: queryKeys.oems.list(activeTenantId ?? ''),
    queryFn: () => listOems(tenantPath),
    enabled: !!activeTenantId,
  });

  const productName = (id: string) =>
    productsQuery.data?.find((p) => p.id === id)?.sku ?? id.slice(0, 8);
  const oemName = (id: string) =>
    oemsQuery.data?.find((o) => o.id === id)?.name ?? id.slice(0, 8);

  const columns: ColumnDef<Batch>[] = [
    {
      accessorKey: 'id',
      header: 'Batch',
      cell: ({ row }) => (
        <Link
          href={`/batches/${row.original.id}`}
          className="text-brand font-medium hover:underline"
        >
          {row.original.id.slice(0, 8)}
        </Link>
      ),
    },
    {
      accessorKey: 'productId',
      header: 'Product',
      cell: ({ row }) => productName(row.original.productId),
    },
    {
      accessorKey: 'oemId',
      header: 'OEM',
      cell: ({ row }) => oemName(row.original.oemId),
    },
    { accessorKey: 'count', header: 'Count' },
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
      id: 'progress',
      header: 'Progress',
      cell: ({ row }) => (
        <ProgressBar
          value={row.original.mintedCount}
          max={row.original.count}
          showValue
          className="w-32"
        />
      ),
    },
    {
      accessorKey: 'createdAt',
      header: 'Created',
      cell: ({ row }) => new Date(row.original.createdAt).toLocaleString(),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Batches"
        description="Minted unit batches for this tenant's products."
        actions={
          isOwner ? (
            <Button asChild>
              <Link href="/batches/new">
                <PlusIcon className="mr-2 h-4 w-4" />
                Mint batch
              </Link>
            </Button>
          ) : undefined
        }
      />

      {batchesQuery.isError ? (
        <EmptyState
          icon={AlertTriangleIcon}
          title="Couldn't load batches"
          description="The catalog service isn't reachable yet."
        />
      ) : (
        <DataTable
          columns={columns}
          data={batchesQuery.data ?? []}
          isLoading={batchesQuery.isLoading}
          emptyState={<EmptyState icon={LayersIcon} title="No batches yet" />}
        />
      )}
    </div>
  );
}
