'use client';

import { useParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import {
  Badge,
  Button,
  DataTable,
  EmptyState,
  PageHeader,
  StatusChip,
  useToast,
} from '@verifyng/ui';
import { AlertTriangleIcon } from 'lucide-react';
import { useAuth } from '@/lib/auth-store';
import { useTenantPath } from '@/lib/tenant-path';
import { queryKeys } from '@/lib/query';
import { ApiError } from '@/lib/api-client';
import {
  getDelivery,
  resendDelivery,
  revokeDelivery,
  type Delivery,
  type DeliveryStatus,
  type ManifestDownloadRow,
} from '@/lib/deliveries';

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

export default function DeliveryDetailPage() {
  const params = useParams<{ id: string }>();
  const deliveryId = params.id;
  const { activeTenantId, role } = useAuth();
  const tenantPath = useTenantPath();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const isOwner = role === 'owner';

  const deliveryQuery = useQuery({
    queryKey: queryKeys.deliveries.detail(activeTenantId ?? '', deliveryId),
    queryFn: () => getDelivery(tenantPath, deliveryId),
    enabled: !!activeTenantId,
  });

  const invalidate = () =>
    queryClient.invalidateQueries({
      queryKey: queryKeys.deliveries.detail(activeTenantId ?? '', deliveryId),
    });

  const revokeMutation = useMutation({
    mutationFn: () => revokeDelivery(tenantPath, deliveryId),
    onSuccess: () => {
      toast({ title: 'Delivery revoked' });
      invalidate();
    },
    onError: (error: unknown) =>
      toast({
        title: error instanceof ApiError ? error.message : 'Revoke failed',
        variant: 'destructive',
      }),
  });

  const resendMutation = useMutation({
    mutationFn: () => resendDelivery(tenantPath, deliveryId),
    onSuccess: () => {
      toast({ title: 'Delivery resent — a fresh link was emailed to the OEM' });
      invalidate();
    },
    onError: (error: unknown) =>
      toast({
        title: error instanceof ApiError ? error.message : 'Resend failed',
        variant: 'destructive',
      }),
  });

  const downloadColumns: ColumnDef<ManifestDownloadRow>[] = [
    {
      accessorKey: 'createdAt',
      header: 'When',
      cell: ({ row }) => new Date(row.original.createdAt).toLocaleString(),
    },
    { accessorKey: 'ip', header: 'IP' },
    { accessorKey: 'userAgent', header: 'User agent' },
  ];

  if (deliveryQuery.isError) {
    return (
      <EmptyState
        icon={AlertTriangleIcon}
        title="Couldn't load this delivery"
        description="It may not exist, or the delivery service isn't reachable yet."
      />
    );
  }

  const delivery: Delivery | undefined = deliveryQuery.data;

  return (
    <div className="space-y-6">
      <PageHeader
        title={delivery ? `Delivery to ${delivery.oem.name}` : 'Delivery'}
        description={
          delivery ? `Batch ${delivery.batchId.slice(0, 8)}` : undefined
        }
        actions={
          delivery ? (
            <StatusChip variant={STATUS_VARIANT[delivery.status]}>
              {delivery.status}
            </StatusChip>
          ) : undefined
        }
      />

      {delivery && (
        <>
          <div className="border-border bg-surface grid grid-cols-2 gap-4 rounded-md border p-4 text-sm sm:grid-cols-4">
            <div>
              <div className="text-fg-muted">Downloads</div>
              <div className="font-medium">
                {delivery.downloadCount} / {delivery.maxDownloads}
              </div>
            </div>
            <div>
              <div className="text-fg-muted">Expires</div>
              <div className="font-medium">
                {new Date(delivery.expiresAt).toLocaleString()}
              </div>
            </div>
            <div>
              <div className="text-fg-muted">Expected ship date</div>
              <div className="font-medium">
                {delivery.expectedShipDate
                  ? new Date(delivery.expectedShipDate).toLocaleDateString()
                  : '—'}
              </div>
            </div>
            <div>
              <div className="text-fg-muted">Delivered</div>
              <div className="font-medium">
                {new Date(delivery.deliveredAt).toLocaleString()}
              </div>
            </div>
          </div>

          {isOwner && delivery.status !== 'revoked' && (
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => resendMutation.mutate()}
                disabled={resendMutation.isPending}
              >
                {resendMutation.isPending ? 'Resending…' : 'Resend'}
              </Button>
              <Button
                variant="destructive"
                onClick={() => revokeMutation.mutate()}
                disabled={revokeMutation.isPending}
              >
                {revokeMutation.isPending ? 'Revoking…' : 'Revoke'}
              </Button>
            </div>
          )}

          <div className="space-y-3">
            <h2 className="text-sm font-medium">Receipts</h2>
            {delivery.receipts.length === 0 ? (
              <p className="text-fg-muted text-sm">No receipt submitted yet.</p>
            ) : (
              <div className="space-y-2">
                {delivery.receipts.map((r) => (
                  <div
                    key={r.id}
                    className="border-border bg-surface flex items-center justify-between rounded-md border p-3 text-sm"
                  >
                    <div>
                      <Badge variant={r.matched ? 'default' : 'destructive'}>
                        {r.matched
                          ? 'Matched'
                          : `Mismatch: ${r.mismatchReason}`}
                      </Badge>
                      <span className="text-fg-muted ml-2">
                        {r.codeCount} / {r.expectedCount} codes
                      </span>
                    </div>
                    <span className="text-fg-muted">
                      {new Date(r.createdAt).toLocaleString()}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-3">
            <h2 className="text-sm font-medium">Download log</h2>
            <DataTable
              columns={downloadColumns}
              data={delivery.downloads}
              emptyState={<EmptyState title="No downloads yet" />}
            />
          </div>
        </>
      )}
    </div>
  );
}
