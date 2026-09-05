'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import {
  DataTable,
  EmptyState,
  PageHeader,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  StatusChip,
} from '@verifyng/ui';
import { LifeBuoy } from 'lucide-react';
import { queryKeys } from '@/lib/query';
import {
  listPlatformTickets,
  type Ticket,
  type TicketStatus,
} from '@/lib/support';

const STATUS_VARIANT: Record<
  TicketStatus,
  'info' | 'warning' | 'ok' | 'neutral'
> = {
  open: 'info',
  in_progress: 'warning',
  pending_customer: 'warning',
  resolved: 'ok',
  closed: 'neutral',
};

export default function SupportTicketsPage() {
  const params = useSearchParams();
  const [status, setStatus] = useState<TicketStatus | undefined>(undefined);
  const tenantId = params.get('tenantId') ?? undefined;

  const query = useQuery({
    queryKey: queryKeys.support.tickets(`${status ?? ''}:${tenantId ?? ''}`),
    queryFn: () => listPlatformTickets({ status, tenantId }),
  });

  const columns: ColumnDef<Ticket>[] = [
    {
      accessorKey: 'number',
      header: '#',
      cell: ({ row }) => (
        <Link
          href={`/support/tickets/${row.original.id}`}
          className="text-brand hover:underline"
        >
          #{row.original.number}
        </Link>
      ),
    },
    { accessorKey: 'subject', header: 'Subject' },
    { accessorKey: 'channel', header: 'Channel' },
    {
      accessorKey: 'status',
      header: 'Status',
      cell: ({ row }) => (
        <StatusChip variant={STATUS_VARIANT[row.original.status]}>
          {row.original.status.replaceAll('_', ' ')}
        </StatusChip>
      ),
    },
    { accessorKey: 'priority', header: 'Priority' },
    {
      accessorKey: 'assigneeId',
      header: 'Assignee',
      cell: ({ row }) => row.original.assigneeId ?? 'Unassigned',
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
        title="Tickets"
        description="Support requests from the console, the public form and email — unassigned first."
      />
      <Select
        value={status ?? 'all'}
        onValueChange={(v) =>
          setStatus(v === 'all' ? undefined : (v as TicketStatus))
        }
      >
        <SelectTrigger className="w-48">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All statuses</SelectItem>
          <SelectItem value="open">Open</SelectItem>
          <SelectItem value="in_progress">In progress</SelectItem>
          <SelectItem value="pending_customer">Pending customer</SelectItem>
          <SelectItem value="resolved">Resolved</SelectItem>
          <SelectItem value="closed">Closed</SelectItem>
        </SelectContent>
      </Select>
      <DataTable
        columns={columns}
        data={query.data?.items ?? []}
        isLoading={query.isLoading}
        emptyState={<EmptyState icon={LifeBuoy} title="No tickets" />}
      />
    </div>
  );
}
