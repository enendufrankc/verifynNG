'use client';

import { useState } from 'react';
import Link from 'next/link';
import type { ColumnDef } from '@tanstack/react-table';
import {
  Button,
  DataTable,
  EmptyState,
  HelpLink,
  Input,
  PageHeader,
  StatusChip,
} from '@verifyng/ui';
import { ScrollText } from 'lucide-react';
import { useAuth } from '@/lib/auth-store';
import { usePagedQuery } from '@/lib/query';
import { listAudit, type AuditEntry } from '@/lib/audit';

const ACTOR_VARIANT: Record<string, 'info' | 'neutral' | 'warning'> = {
  user: 'info',
  system: 'neutral',
  support: 'warning',
};

function targetHref(e: AuditEntry): string | null {
  switch (e.targetType) {
    case 'unit':
      return `/units/${e.target}`;
    case 'batch':
      return `/batches/${e.target}`;
    case 'anomaly':
      return `/anomalies/${e.target}`;
    case 'report':
      return `/reports/${e.target}`;
    default:
      return null;
  }
}

export default function AuditPage() {
  const { activeTenantId } = useAuth();
  const [action, setAction] = useState('');
  const [targetType, setTargetType] = useState('');
  const [applied, setApplied] = useState({ action: '', targetType: '' });

  const query = usePagedQuery<AuditEntry>(
    ['audit', activeTenantId, applied.action, applied.targetType],
    (cursor) =>
      listAudit({
        action: applied.action || undefined,
        targetType: applied.targetType || undefined,
        cursor,
      }),
  );
  const rows = query.data?.pages.flatMap((p) => p.items) ?? [];

  const columns: ColumnDef<AuditEntry>[] = [
    {
      accessorKey: 'createdAt',
      header: 'When',
      cell: ({ row }) => new Date(row.original.createdAt).toLocaleString(),
    },
    {
      id: 'actor',
      header: 'Actor',
      cell: ({ row }) => (
        <span className="flex items-center gap-2">
          <StatusChip
            variant={ACTOR_VARIANT[row.original.actorType] ?? 'neutral'}
          >
            {row.original.actorType}
          </StatusChip>
          <span className="text-fg-muted font-mono text-xs">
            {row.original.actorId?.slice(0, 8) ?? '—'}
          </span>
        </span>
      ),
    },
    {
      accessorKey: 'action',
      header: 'Action',
      cell: ({ row }) => (
        <span className="font-mono text-xs">{row.original.action}</span>
      ),
    },
    {
      id: 'target',
      header: 'Target',
      cell: ({ row }) => {
        const e = row.original;
        const href = targetHref(e);
        const label = `${e.targetType || 'object'} · ${e.target.slice(0, 12)}`;
        return href ? (
          <Link href={href} className="text-brand hover:underline">
            {label}
          </Link>
        ) : (
          <span>{label}</span>
        );
      },
    },
    {
      accessorKey: 'requestId',
      header: 'Request',
      cell: ({ row }) => (
        <span className="text-fg-muted font-mono text-xs">
          {row.original.requestId?.slice(0, 8) ?? '—'}
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Audit log"
        description="Every privileged action in this tenant, newest first. Entries are hash-chained and append-only — they cannot be edited or deleted."
        actions={<HelpLink docSlug="console/audit" module="audit" />}
      />

      <form
        className="flex flex-wrap gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          setApplied({ action: action.trim(), targetType: targetType.trim() });
        }}
      >
        <Input
          value={action}
          onChange={(e) => setAction(e.target.value)}
          placeholder="Action (e.g. unit.flag)"
          className="max-w-xs"
        />
        <Input
          value={targetType}
          onChange={(e) => setTargetType(e.target.value)}
          placeholder="Target type (unit, batch, …)"
          className="max-w-xs"
        />
        <Button type="submit" variant="outline">
          Filter
        </Button>
      </form>

      {query.isError ? (
        <EmptyState icon={ScrollText} title="Couldn't load the audit log" />
      ) : (
        <>
          <DataTable
            columns={columns}
            data={rows}
            emptyState={
              <EmptyState
                icon={ScrollText}
                title={
                  query.isLoading ? 'Loading…' : 'No audit entries match'
                }
              />
            }
          />
          {query.hasNextPage && (
            <Button
              variant="outline"
              onClick={() => query.fetchNextPage()}
              disabled={query.isFetchingNextPage}
            >
              {query.isFetchingNextPage ? 'Loading…' : 'Load older entries'}
            </Button>
          )}
        </>
      )}
    </div>
  );
}
