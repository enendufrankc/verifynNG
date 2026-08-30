'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import {
  DataTable,
  EmptyState,
  PageHeader,
  StatusChip,
  Tabs,
  TabsList,
  TabsTrigger,
} from '@verifyng/ui';
import { MessageSquareWarning, AlertTriangleIcon } from 'lucide-react';
import { useAuth } from '@/lib/auth-store';
import { queryKeys } from '@/lib/query';
import { listReports, type Report, type ReportStatus } from '@/lib/reports';

const STATUS_VARIANT: Record<
  ReportStatus,
  'success' | 'warning' | 'danger' | 'info' | 'neutral'
> = {
  new: 'info',
  triaged: 'warning',
  investigating: 'warning',
  closed: 'neutral',
};

type SavedView = 'all' | 'new' | 'mine';

export default function ReportsPage() {
  const { activeTenantId, user } = useAuth();
  const [view, setView] = useState<SavedView>('all');

  const reportsQuery = useQuery({
    queryKey: queryKeys.reports.list(activeTenantId ?? '', view),
    queryFn: () =>
      listReports(
        view === 'new'
          ? { status: 'new' }
          : view === 'mine'
            ? { assignedToId: user?.id }
            : undefined,
      ),
    enabled: !!activeTenantId && (view !== 'mine' || !!user?.id),
  });

  const columns: ColumnDef<Report>[] = [
    {
      accessorKey: 'reference',
      header: 'Reference',
      cell: ({ row }) => (
        <Link
          href={`/reports/${row.original.id}`}
          className="text-brand font-medium hover:underline"
        >
          {row.original.reference}
        </Link>
      ),
    },
    { accessorKey: 'purchaseChannel', header: 'Channel' },
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
      accessorKey: 'outcome',
      header: 'Outcome',
      cell: ({ row }) => row.original.outcome ?? '—',
    },
    {
      id: 'photos',
      header: 'Photos',
      cell: ({ row }) => row.original.photos?.length ?? 0,
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
        title="Reports"
        description="Consumer fake reports for this tenant's products."
      />
      <Tabs value={view} onValueChange={(v) => setView(v as SavedView)}>
        <TabsList>
          <TabsTrigger value="all">All</TabsTrigger>
          <TabsTrigger value="new">New</TabsTrigger>
          <TabsTrigger value="mine">Mine</TabsTrigger>
        </TabsList>
      </Tabs>

      {reportsQuery.isError ? (
        <EmptyState
          icon={AlertTriangleIcon}
          title="Couldn't load reports"
          description="The reports service isn't reachable yet."
        />
      ) : (
        <DataTable
          columns={columns}
          data={reportsQuery.data ?? []}
          isLoading={reportsQuery.isLoading}
          emptyState={
            <EmptyState icon={MessageSquareWarning} title="No reports yet" />
          }
        />
      )}
    </div>
  );
}
