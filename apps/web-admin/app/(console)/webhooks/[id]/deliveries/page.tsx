'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import {
  Badge,
  Button,
  DataTable,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  EmptyState,
  PageHeader,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  useToast,
} from '@verifyng/ui';
import { AlertTriangleIcon, ListIcon } from 'lucide-react';
import { useAuth } from '@/lib/auth-store';
import { useTenantPath } from '@/lib/tenant-path';
import { queryKeys } from '@/lib/query';
import { ApiError } from '@/lib/api-client';
import {
  listWebhookDeliveries,
  redeliverWebhookDelivery,
  type WebhookDelivery,
} from '@/lib/webhooks';

const STATUS_OPTIONS = [
  'pending',
  'delivering',
  'succeeded',
  'failed',
  'dead',
] as const;

const STATUS_VARIANT: Record<
  WebhookDelivery['status'],
  'secondary' | 'destructive' | 'outline'
> = {
  pending: 'outline',
  delivering: 'outline',
  succeeded: 'secondary',
  failed: 'destructive',
  dead: 'destructive',
};

export default function WebhookDeliveriesPage() {
  const { id } = useParams<{ id: string }>();
  const { activeTenantId } = useAuth();
  const tenantPath = useTenantPath();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [status, setStatus] = useState<string | undefined>(undefined);
  const [cursorStack, setCursorStack] = useState<string[]>([]);
  const [detailTarget, setDetailTarget] = useState<WebhookDelivery | null>(
    null,
  );
  const cursor = cursorStack.at(-1);

  const queryKey = queryKeys.webhooks.deliveries(
    activeTenantId ?? '',
    id,
    status,
  );
  const deliveriesQuery = useQuery({
    queryKey: [...queryKey, cursor],
    queryFn: () =>
      listWebhookDeliveries(tenantPath, { endpointId: id, status, cursor }),
    enabled: !!activeTenantId,
  });

  const redeliverMutation = useMutation({
    mutationFn: (deliveryId: string) =>
      redeliverWebhookDelivery(tenantPath, deliveryId),
    onSuccess: () => {
      toast({ title: 'Redelivery queued' });
      queryClient.invalidateQueries({ queryKey: ['webhooks', 'deliveries'] });
    },
    onError: (error: unknown) => {
      toast({
        title: error instanceof ApiError ? error.message : 'Redeliver failed',
        variant: 'destructive',
      });
    },
  });

  const columns: ColumnDef<WebhookDelivery>[] = [
    {
      accessorKey: 'createdAt',
      header: 'Created',
      cell: ({ row }) => new Date(row.original.createdAt).toLocaleString(),
    },
    { accessorKey: 'event', header: 'Event' },
    {
      accessorKey: 'status',
      header: 'Status',
      cell: ({ row }) => (
        <Badge variant={STATUS_VARIANT[row.original.status]}>
          {row.original.status}
        </Badge>
      ),
    },
    { accessorKey: 'attempts', header: 'Attempts' },
    {
      accessorKey: 'lastStatusCode',
      header: 'Last status',
      cell: ({ row }) => row.original.lastStatusCode ?? '—',
    },
    {
      accessorKey: 'nextAttemptAt',
      header: 'Next attempt',
      cell: ({ row }) =>
        row.original.nextAttemptAt
          ? new Date(row.original.nextAttemptAt).toLocaleString()
          : '—',
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Webhook deliveries"
        description="Delivery attempts for this endpoint."
      />

      <div className="flex items-center gap-2">
        <Select
          value={status ?? 'all'}
          onValueChange={(value) => {
            setStatus(value === 'all' ? undefined : value);
            setCursorStack([]);
          }}
        >
          <SelectTrigger className="w-48">
            <SelectValue placeholder="All statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {STATUS_OPTIONS.map((s) => (
              <SelectItem key={s} value={s}>
                {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {deliveriesQuery.isError ? (
        <EmptyState
          icon={AlertTriangleIcon}
          title="Couldn't load deliveries"
          description="Try again shortly."
        />
      ) : (
        <DataTable
          columns={columns}
          data={deliveriesQuery.data?.data ?? []}
          isLoading={deliveriesQuery.isLoading}
          emptyState={<EmptyState icon={ListIcon} title="No deliveries yet" />}
          pagination={{
            hasPrev: cursorStack.length > 0,
            hasNext: !!deliveriesQuery.data?.nextCursor,
            onPrev: () => setCursorStack((s) => s.slice(0, -1)),
            onNext: () =>
              deliveriesQuery.data?.nextCursor &&
              setCursorStack((s) => [...s, deliveriesQuery.data!.nextCursor!]),
          }}
          rowActions={(delivery) => (
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setDetailTarget(delivery)}
              >
                Details
              </Button>
              {delivery.status === 'dead' || delivery.status === 'failed' ? (
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={redeliverMutation.isPending}
                  onClick={() => redeliverMutation.mutate(delivery.id)}
                >
                  Redeliver
                </Button>
              ) : null}
            </div>
          )}
        />
      )}

      <Dialog
        open={!!detailTarget}
        onOpenChange={(open) => !open && setDetailTarget(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delivery attempt details</DialogTitle>
          </DialogHeader>
          {detailTarget ? (
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-fg-muted">Status</dt>
                <dd>{detailTarget.status}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-fg-muted">Attempts</dt>
                <dd>{detailTarget.attempts}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-fg-muted">Last status code</dt>
                <dd>{detailTarget.lastStatusCode ?? '—'}</dd>
              </div>
              {detailTarget.lastResponse ? (
                <div>
                  <dt className="text-fg-muted mb-1">Response</dt>
                  <dd className="bg-surface-sunken overflow-x-auto rounded-md p-2 font-mono text-xs">
                    {detailTarget.lastResponse}
                  </dd>
                </div>
              ) : null}
              {detailTarget.lastError ? (
                <div>
                  <dt className="text-fg-muted mb-1">Error</dt>
                  <dd className="bg-surface-sunken overflow-x-auto rounded-md p-2 font-mono text-xs">
                    {detailTarget.lastError}
                  </dd>
                </div>
              ) : null}
            </dl>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
