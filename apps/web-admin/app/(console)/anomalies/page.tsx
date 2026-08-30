'use client';

import { useState } from 'react';
import Link from 'next/link';
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
import { AlertTriangleIcon, ShieldAlert } from 'lucide-react';
import { useAuth } from '@/lib/auth-store';
import {
  listAnomalies,
  type Anomaly,
  type AnomalyStatus,
} from '@/lib/anomalies';

const STATUS_VARIANT: Record<
  AnomalyStatus,
  'success' | 'warning' | 'danger' | 'info' | 'neutral'
> = {
  open: 'danger',
  acknowledged: 'warning',
  resolved: 'success',
  dismissed: 'neutral',
};

const RULE_LABEL: Record<string, string> = {
  geo_dispersion: 'Geo dispersion',
  velocity: 'Velocity',
  dead_code: 'Dead code',
  pre_reveal: 'Pre-reveal',
  duplicate_first: 'Duplicate first',
};

function distinctCities(anomaly: Anomaly): number {
  return new Set(anomaly.evidence.scans.map((s) => s.city).filter(Boolean))
    .size;
}

export default function AnomaliesPage() {
  const { activeTenantId } = useAuth();
  // Saved default: "Open · score ≥ 60".
  const [status, setStatus] = useState<AnomalyStatus | 'all'>('open');
  const [minScore, setMinScore] = useState(60);
  const [cursor, setCursor] = useState<string | undefined>(undefined);

  const query = useQuery({
    queryKey: ['anomalies', 'list', activeTenantId, status, minScore, cursor],
    queryFn: () =>
      listAnomalies({
        status: status === 'all' ? undefined : status,
        minScore,
        cursor,
      }),
    enabled: !!activeTenantId,
  });

  const columns: ColumnDef<Anomaly>[] = [
    {
      id: 'rule',
      header: 'Rule',
      cell: ({ row }) => (
        <Link
          href={`/anomalies/${row.original.id}`}
          className="text-brand font-medium hover:underline"
        >
          {RULE_LABEL[row.original.rule] ?? row.original.rule}
        </Link>
      ),
    },
    { accessorKey: 'score', header: 'Score' },
    {
      id: 'ref',
      header: 'Unit / Batch',
      cell: ({ row }) => {
        const a = row.original;
        if (a.unitId)
          return (
            <Link href={`/units/${a.unitId}`} className="hover:underline">
              {a.unitId.slice(0, 8)}
            </Link>
          );
        if (a.batchId)
          return (
            <Link
              href={`/units/batch/${a.batchId}`}
              className="hover:underline"
            >
              {a.batchId.slice(0, 8)}
            </Link>
          );
        return <span className="text-fg-muted">—</span>;
      },
    },
    {
      id: 'cities',
      header: 'Cities',
      cell: ({ row }) => distinctCities(row.original),
    },
    {
      accessorKey: 'firstSeenAt',
      header: 'First seen',
      cell: ({ row }) => new Date(row.original.firstSeenAt).toLocaleString(),
    },
    {
      accessorKey: 'lastSeenAt',
      header: 'Last seen',
      cell: ({ row }) => new Date(row.original.lastSeenAt).toLocaleString(),
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
      id: 'assignee',
      header: 'Assignee',
      cell: ({ row }) =>
        row.original.assignedToId?.slice(0, 8) ?? (
          <span className="text-fg-muted">Unassigned</span>
        ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Anomalies"
        description="Rules-engine findings across scan events. Rules only — no ML."
      />

      <div className="flex flex-wrap items-center gap-3">
        <Select
          value={status}
          onValueChange={(v) => {
            setStatus(v as AnomalyStatus | 'all');
            setCursor(undefined);
          }}
        >
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="open">Open</SelectItem>
            <SelectItem value="acknowledged">Acknowledged</SelectItem>
            <SelectItem value="resolved">Resolved</SelectItem>
            <SelectItem value="dismissed">Dismissed</SelectItem>
            <SelectItem value="all">All</SelectItem>
          </SelectContent>
        </Select>
        <Select
          value={String(minScore)}
          onValueChange={(v) => {
            setMinScore(Number(v));
            setCursor(undefined);
          }}
        >
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Min score" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="0">Any score</SelectItem>
            <SelectItem value="40">Score ≥ 40</SelectItem>
            <SelectItem value="60">Score ≥ 60</SelectItem>
            <SelectItem value="80">Score ≥ 80</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {query.isError ? (
        <EmptyState
          icon={AlertTriangleIcon}
          title="Couldn't load anomalies"
          description="The anomaly service isn't reachable yet."
        />
      ) : (
        <DataTable
          columns={columns}
          data={query.data?.items ?? []}
          isLoading={query.isLoading}
          emptyState={
            <EmptyState
              icon={ShieldAlert}
              title="No anomalies"
              description="Nothing has crossed a rule threshold yet."
            />
          }
          pagination={{
            hasPrev: !!cursor,
            hasNext: !!query.data?.cursor,
            onPrev: () => setCursor(undefined),
            onNext: () => setCursor(query.data?.cursor),
          }}
        />
      )}
    </div>
  );
}
