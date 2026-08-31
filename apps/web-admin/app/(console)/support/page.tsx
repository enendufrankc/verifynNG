'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import {
  Badge,
  Button,
  DataTable,
  EmptyState,
  Input,
  PageHeader,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Sheet,
  SheetContent,
  StatusChip,
  useToast,
} from '@verifyng/ui';
import { Building2, ExternalLink } from 'lucide-react';
import { queryKeys } from '@/lib/query';
import { ApiError } from '@/lib/api-client';
import { getTenant, listTenants, type TenantDirectoryRow } from '@/lib/support';
import { startImpersonation } from '@/lib/impersonation';

const STATUS_VARIANT: Record<string, 'ok' | 'warning' | 'danger' | 'neutral'> =
  {
    active: 'ok',
    pending: 'neutral',
    in_review: 'warning',
    suspended: 'danger',
    restricted: 'danger',
    offboarded: 'neutral',
  };

export default function SupportTenantsPage() {
  const { toast } = useToast();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<string | undefined>(undefined);
  const [selected, setSelected] = useState<TenantDirectoryRow | null>(null);
  const [starting, setStarting] = useState(false);

  const tenantsQuery = useQuery({
    queryKey: queryKeys.support.tenants(q, status),
    queryFn: () => listTenants({ q: q || undefined, status }),
  });

  const detailQuery = useQuery({
    queryKey: queryKeys.support.tenant(selected?.id ?? ''),
    queryFn: () => getTenant(selected!.id),
    enabled: !!selected,
  });

  const viewAsTenant = async (tenant: TenantDirectoryRow) => {
    setStarting(true);
    try {
      const result = await startImpersonation({
        tenantId: tenant.id,
        mode: 'read',
      });
      const url = new URL('/impersonate', window.location.origin);
      url.searchParams.set('token', result.token);
      url.searchParams.set('tenantId', result.tenantId);
      url.searchParams.set('tenantName', tenant.name);
      url.searchParams.set('mode', result.mode);
      url.searchParams.set('expiresAt', result.expiresAt);
      url.searchParams.set('sessionId', result.id);
      window.open(url.toString(), '_blank', 'noopener');
    } catch (err) {
      toast({
        title:
          err instanceof ApiError
            ? err.message
            : 'Could not start impersonation',
        variant: 'destructive',
      });
    } finally {
      setStarting(false);
    }
  };

  const columns: ColumnDef<TenantDirectoryRow>[] = [
    {
      accessorKey: 'name',
      header: 'Business',
      cell: ({ row }) => (
        <button
          className="text-fg font-medium hover:underline"
          onClick={() => setSelected(row.original)}
        >
          {row.original.name}
        </button>
      ),
    },
    { accessorKey: 'slug', header: 'Slug' },
    {
      accessorKey: 'status',
      header: 'Status',
      cell: ({ row }) => (
        <StatusChip variant={STATUS_VARIANT[row.original.status] ?? 'neutral'}>
          {row.original.status}
        </StatusChip>
      ),
    },
    {
      accessorKey: 'planCode',
      header: 'Plan',
      cell: ({ row }) => row.original.planCode ?? '—',
    },
    {
      accessorKey: 'unitsThisYear',
      header: 'Units this year',
    },
    {
      accessorKey: 'scansLast30d',
      header: 'Scans (30d)',
    },
    {
      accessorKey: 'lastActivityAt',
      header: 'Last activity',
      cell: ({ row }) =>
        row.original.lastActivityAt
          ? new Date(row.original.lastActivityAt).toLocaleString()
          : '—',
    },
    { accessorKey: 'ownerEmail', header: 'Owner' },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Tenants"
        description="Every tenant on the platform — status, plan and recent activity."
      />
      <div className="flex flex-wrap gap-3">
        <Input
          placeholder="Search by name or slug…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="max-w-xs"
        />
        <Select
          value={status ?? 'all'}
          onValueChange={(v) => setStatus(v === 'all' ? undefined : v)}
        >
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="in_review">In review</SelectItem>
            <SelectItem value="suspended">Suspended</SelectItem>
            <SelectItem value="restricted">Restricted</SelectItem>
            <SelectItem value="offboarded">Offboarded</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <DataTable
        columns={columns}
        data={tenantsQuery.data?.items ?? []}
        isLoading={tenantsQuery.isLoading}
        emptyState={<EmptyState icon={Building2} title="No tenants found" />}
        rowActions={(tenant) => (
          <Button
            size="sm"
            variant="secondary"
            disabled={starting}
            onClick={() => viewAsTenant(tenant)}
          >
            View as tenant
          </Button>
        )}
      />

      <Sheet
        open={!!selected}
        onOpenChange={(open) => !open && setSelected(null)}
      >
        <SheetContent side="right" className="w-full max-w-md space-y-4 p-6">
          {selected && (
            <>
              <h2 className="text-lg font-semibold">{selected.name}</h2>
              <p className="text-fg-muted text-sm">{selected.slug}</p>
              <div className="flex flex-wrap gap-2">
                <Badge variant="secondary">{selected.status}</Badge>
                {selected.planCode && (
                  <Badge variant="secondary">{selected.planCode}</Badge>
                )}
              </div>
              <div className="flex flex-col gap-2">
                <Button
                  onClick={() => viewAsTenant(selected)}
                  disabled={starting}
                >
                  View as tenant
                </Button>
                <Button
                  variant="secondary"
                  onClick={() =>
                    window.open(
                      `/support/tickets?tenantId=${selected.id}`,
                      '_self',
                    )
                  }
                >
                  Open tickets
                </Button>
                <Button
                  variant="secondary"
                  onClick={() =>
                    window.open(
                      `/support/subscriptions?tenantId=${selected.id}`,
                    )
                  }
                >
                  Subscription (E15)
                </Button>
                <a
                  href={`/audit?tenantId=${selected.id}`}
                  className="text-brand flex items-center gap-1 text-sm hover:underline"
                >
                  View audit log <ExternalLink className="h-3 w-3" />
                </a>
              </div>

              <div>
                <h3 className="text-fg-muted mb-2 text-xs font-semibold uppercase">
                  Recent audit
                </h3>
                <div className="space-y-1 text-sm">
                  {detailQuery.data?.recentAudit.map((row) => (
                    <div key={row.id} className="flex justify-between">
                      <span>{row.action}</span>
                      <span className="text-fg-muted">
                        {new Date(row.createdAt).toLocaleString()}
                      </span>
                    </div>
                  ))}
                  {detailQuery.data &&
                    detailQuery.data.recentAudit.length === 0 && (
                      <p className="text-fg-muted">No audit activity yet.</p>
                    )}
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
