'use client';

import { useQuery } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { DataTable, EmptyState, PageHeader, StatusChip } from '@verifyng/ui';
import { History } from 'lucide-react';
import { queryKeys } from '@/lib/query';
import {
  listImpersonationHistory,
  type ImpersonationSessionRow,
} from '@/lib/impersonation';

function duration(row: ImpersonationSessionRow): string {
  const end = row.endedAt ? new Date(row.endedAt) : new Date();
  const seconds = Math.max(
    0,
    Math.round((end.getTime() - new Date(row.startedAt).getTime()) / 1000),
  );
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export default function ImpersonationHistoryPage() {
  const query = useQuery({
    queryKey: queryKeys.support.impersonationHistory(),
    queryFn: listImpersonationHistory,
  });

  const columns: ColumnDef<ImpersonationSessionRow>[] = [
    { accessorKey: 'supportUserId', header: 'Support user' },
    { accessorKey: 'tenantId', header: 'Tenant' },
    {
      accessorKey: 'mode',
      header: 'Mode',
      cell: ({ row }) => (
        <StatusChip
          variant={row.original.mode === 'write' ? 'warning' : 'info'}
        >
          {row.original.mode}
        </StatusChip>
      ),
    },
    {
      accessorKey: 'reason',
      header: 'Reason',
      cell: ({ row }) => row.original.reason ?? '—',
    },
    {
      accessorKey: 'startedAt',
      header: 'Started',
      cell: ({ row }) => new Date(row.original.startedAt).toLocaleString(),
    },
    {
      id: 'duration',
      header: 'Duration',
      cell: ({ row }) => duration(row.original),
    },
    {
      accessorKey: 'endedBy',
      header: 'Ended by',
      cell: ({ row }) =>
        row.original.endedBy ?? (row.original.endedAt ? '—' : 'active'),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Impersonation history"
        description="Every impersonation session — who, which tenant, mode, reason, duration."
      />
      <DataTable
        columns={columns}
        data={query.data?.items ?? []}
        isLoading={query.isLoading}
        emptyState={
          <EmptyState icon={History} title="No impersonation sessions yet" />
        }
      />
    </div>
  );
}
