'use client';

import { useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Badge,
  Button,
  EmptyState,
  FormField,
  Input,
  PageHeader,
  StatusChip,
  Textarea,
  useToast,
} from '@verifyng/ui';
import { AlertTriangleIcon } from 'lucide-react';
import { queryKeys } from '@/lib/query';
import { ApiError } from '@/lib/api-client';
import {
  artworkUrl,
  downloadManifest,
  getOemDelivery,
  shipDelivery,
  submitReceipt,
  type SubmitReceiptInput,
} from '@/lib/oem-portal';
import type { DeliveryStatus } from '@/lib/deliveries';

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

export default function OemDeliveryDetailPage() {
  const params = useParams<{ id: string }>();
  const deliveryId = params.id;
  const searchParams = useSearchParams();
  const token = searchParams.get('token');
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [receiptJson, setReceiptJson] = useState('');
  const [carrier, setCarrier] = useState('');
  const [trackingRef, setTrackingRef] = useState('');

  const deliveryQuery = useQuery({
    queryKey: queryKeys.oemPortal.detail(deliveryId),
    queryFn: () => getOemDelivery(deliveryId),
  });

  const invalidate = () =>
    queryClient.invalidateQueries({
      queryKey: queryKeys.oemPortal.detail(deliveryId),
    });

  const receiptMutation = useMutation({
    mutationFn: (input: SubmitReceiptInput) => submitReceipt(deliveryId, input),
    onSuccess: (result) => {
      toast({
        title: result.matched
          ? 'Receipt matched — batch marked printed'
          : 'Receipt mismatch',
        variant: result.matched ? undefined : 'destructive',
      });
      invalidate();
    },
    onError: (error: unknown) =>
      toast({
        title:
          error instanceof ApiError
            ? error.message
            : 'Receipt submission failed',
        variant: 'destructive',
      }),
  });

  const shipMutation = useMutation({
    mutationFn: () => shipDelivery(deliveryId, { carrier, trackingRef }),
    onSuccess: () => {
      toast({ title: 'Shipment recorded' });
      invalidate();
    },
    onError: (error: unknown) =>
      toast({
        title: error instanceof ApiError ? error.message : 'Ship failed',
        variant: 'destructive',
      }),
  });

  function handleSubmitReceipt() {
    let parsed: unknown;
    try {
      parsed = JSON.parse(receiptJson);
    } catch {
      toast({ title: 'That is not valid JSON', variant: 'destructive' });
      return;
    }
    const input = parsed as Partial<SubmitReceiptInput>;
    if (
      typeof input.receiptHash !== 'string' ||
      typeof input.codeCount !== 'number' ||
      !Array.isArray(input.watermarks)
    ) {
      toast({
        title:
          'Expected { receiptHash, codeCount, watermarks } — paste the JSON pnpm oem:receipt prints or writes with --out',
        variant: 'destructive',
      });
      return;
    }
    receiptMutation.mutate(input as SubmitReceiptInput);
  }

  async function handleDownloadManifest() {
    if (!token) return;
    try {
      await downloadManifest(deliveryId, token, `manifest-${deliveryId}.json`);
    } catch {
      toast({
        title: 'Download failed — the link may be expired or already used up',
        variant: 'destructive',
      });
    }
  }

  if (deliveryQuery.isError) {
    return (
      <EmptyState
        icon={AlertTriangleIcon}
        title="Couldn't load this delivery"
        description="It may not exist, or you may not have access to it."
      />
    );
  }

  const delivery = deliveryQuery.data;

  return (
    <div className="space-y-6">
      <PageHeader
        title={
          delivery
            ? `${delivery.batch.product.sku} — ${delivery.batch.product.name}`
            : 'Delivery'
        }
        description={
          delivery
            ? `${delivery.batch.count.toLocaleString()} units`
            : undefined
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
          {!token && (
            <div className="border-border bg-surface-sunken text-fg-muted rounded-md border p-3 text-sm">
              Open this delivery from the link in your email to download the
              manifest or artwork — this page alone can&apos;t re-issue that
              one-time link.
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            <Button onClick={handleDownloadManifest} disabled={!token}>
              Download manifest
            </Button>
            {token ? (
              <Button variant="outline" asChild>
                <a href={artworkUrl(deliveryId, token)}>Download QR artwork</a>
              </Button>
            ) : (
              <Button variant="outline" disabled>
                Download QR artwork
              </Button>
            )}
          </div>

          <div className="space-y-3">
            <h2 className="text-sm font-medium">Submit print receipt</h2>
            <p className="text-fg-muted text-sm">
              Run{' '}
              <code>
                pnpm oem:receipt &lt;printed.csv&gt; --out receipt.json
              </code>
              , then paste the contents of <code>receipt.json</code> below.
            </p>
            <Textarea
              rows={5}
              value={receiptJson}
              onChange={(e) => setReceiptJson(e.target.value)}
              placeholder='{"receiptHash":"...","codeCount":20,"watermarks":["ABCD"]}'
            />
            <Button
              onClick={handleSubmitReceipt}
              disabled={receiptMutation.isPending}
            >
              {receiptMutation.isPending ? 'Submitting…' : 'Submit receipt'}
            </Button>
            {delivery.receipts.length > 0 && (
              <div className="space-y-2">
                {delivery.receipts.map((r) => (
                  <div key={r.id} className="flex items-center gap-2 text-sm">
                    <Badge variant={r.matched ? 'default' : 'destructive'}>
                      {r.matched ? 'Matched' : `Mismatch: ${r.mismatchReason}`}
                    </Badge>
                    <span className="text-fg-muted">
                      {new Date(r.createdAt).toLocaleString()}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {delivery.receipts.some((r) => r.matched) && (
            <div className="space-y-3">
              <h2 className="text-sm font-medium">Ship</h2>
              <FormField label="Carrier" htmlFor="ship-carrier">
                <Input
                  id="ship-carrier"
                  value={carrier}
                  onChange={(e) => setCarrier(e.target.value)}
                />
              </FormField>
              <FormField label="Tracking reference" htmlFor="ship-tracking">
                <Input
                  id="ship-tracking"
                  value={trackingRef}
                  onChange={(e) => setTrackingRef(e.target.value)}
                />
              </FormField>
              <Button
                onClick={() => shipMutation.mutate()}
                disabled={shipMutation.isPending}
              >
                {shipMutation.isPending ? 'Recording…' : 'Mark shipped'}
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
