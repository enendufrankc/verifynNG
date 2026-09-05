'use client';

import { useQuery } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { DataTable, EmptyState, PageHeader, StatusChip } from '@verifyng/ui';
import { LifeBuoy } from 'lucide-react';
import { useAuthStore } from '@/lib/auth-store';
import { queryKeys } from '@/lib/query';
import { listOwnTickets, type Ticket } from '@/lib/support';

export default function MyTicketsPage() {
  const activeTenantId = useAuthStore((s) => s.activeTenantId);

  const query = useQuery({
    queryKey: queryKeys.support.helpTickets(activeTenantId ?? ''),
    queryFn: () => listOwnTickets(activeTenantId!),
    enabled: !!activeTenantId,
  });

  const columns: ColumnDef<Ticket>[] = [
    { accessorKey: 'number', header: '#' },
    { accessorKey: 'subject', header: 'Subject' },
    {
      accessorKey: 'status',
      header: 'Status',
      cell: ({ row }) => <StatusChip>{row.original.status}</StatusChip>,
    },
    {
      accessorKey: 'lastActivityAt',
      header: 'Last activity',
      cell: ({ row }) => new Date(row.original.lastActivityAt).toLocaleString(),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="My tickets"
        description="Requests you've sent to platform support and their replies."
      />
      <DataTable
        columns={columns}
        data={query.data?.items ?? []}
        isLoading={query.isLoading}
        emptyState={<EmptyState icon={LifeBuoy} title="No tickets yet" />}
      />
    </div>
  );
}
