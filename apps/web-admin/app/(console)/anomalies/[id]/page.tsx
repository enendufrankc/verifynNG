'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import {
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  EmptyState,
  PageHeader,
  StatusChip,
  Textarea,
  useToast,
} from '@verifyng/ui';
import { AlertTriangleIcon } from 'lucide-react';
import { useAuth } from '@/lib/auth-store';
import { ApiError } from '@/lib/api-client';
import {
  acknowledgeAnomaly,
  dismissAnomaly,
  getAnomaly,
  resolveAnomaly,
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

type Action = 'acknowledge' | 'resolve' | 'dismiss';

export default function AnomalyDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const { activeTenantId, role } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const canAct = role === 'operator' || role === 'owner';

  const query = useQuery({
    queryKey: ['anomalies', 'detail', activeTenantId, id],
    queryFn: () => getAnomaly(id),
    enabled: !!activeTenantId,
  });

  const [pendingAction, setPendingAction] = useState<Action | null>(null);
  const [note, setNote] = useState('');

  const mutation = useMutation({
    mutationFn: async (action: Action) => {
      if (action === 'acknowledge')
        return acknowledgeAnomaly(id, note || undefined);
      if (action === 'resolve') return resolveAnomaly(id, note || undefined);
      return dismissAnomaly(id, note || undefined);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['anomalies'] });
      setPendingAction(null);
      setNote('');
    },
    onError: (error) => {
      toast({
        title: error instanceof ApiError ? error.message : 'Action failed',
        variant: 'destructive',
      });
    },
  });

  if (query.isError) {
    return (
      <EmptyState icon={AlertTriangleIcon} title="Couldn't load this anomaly" />
    );
  }

  const data = query.data;
  const anomaly = data?.anomaly;

  return (
    <div className="space-y-6">
      <PageHeader
        title={anomaly ? (RULE_LABEL[anomaly.rule] ?? anomaly.rule) : 'Anomaly'}
        description={
          anomaly
            ? `Score ${anomaly.score} · first seen ${new Date(anomaly.firstSeenAt).toLocaleString()}`
            : undefined
        }
        actions={
          anomaly ? (
            <StatusChip variant={STATUS_VARIANT[anomaly.status]}>
              {anomaly.status}
            </StatusChip>
          ) : undefined
        }
      />

      {anomaly && (
        <>
          {(data.unit || data.batch) && (
            <div className="border-border bg-surface space-y-2 rounded-md border p-4">
              <h2 className="text-sm font-medium">
                Linked {data.unit ? 'unit' : 'batch'}
              </h2>
              {data.unit && (
                <div className="flex items-center gap-3">
                  <Link
                    href={`/units/${data.unit.id}`}
                    className="text-brand hover:underline"
                  >
                    {data.unit.tier1Code}
                  </Link>
                  <Badge variant="secondary">{data.unit.state}</Badge>
                </div>
              )}
              {data.batch && !data.unit && (
                <Link
                  href={`/units/batch/${data.batch.id}`}
                  className="text-brand hover:underline"
                >
                  Batch {data.batch.watermark}
                </Link>
              )}
              {anomaly.rule === 'velocity' && (
                <p className="text-fg-muted text-sm">
                  Velocity anomalies never target a single unit — a human
                  decides whether to recall the batch.
                </p>
              )}
            </div>
          )}

          <div className="space-y-3">
            <h2 className="text-sm font-medium">Evidence timeline</h2>
            <p className="text-fg-muted text-xs">
              City and time only — never IPs or coordinates.
            </p>
            <ul className="divide-border divide-y rounded-md border">
              {data.linkedScans.length === 0 ? (
                <li className="text-fg-muted p-3 text-sm">
                  No individual scans linked to this anomaly.
                </li>
              ) : (
                data.linkedScans.map((scan) => (
                  <li
                    key={scan.id}
                    className="flex items-center justify-between p-3 text-sm"
                  >
                    <span>{new Date(scan.createdAt).toLocaleString()}</span>
                    <span>
                      {scan.geoCity ?? 'Unknown city'}
                      {scan.geoCountry ? `, ${scan.geoCountry}` : ''}
                    </span>
                    <Badge variant="secondary">{scan.verdict}</Badge>
                  </li>
                ))
              )}
            </ul>
          </div>

          {canAct &&
            anomaly.status !== 'resolved' &&
            anomaly.status !== 'dismissed' && (
              <div className="flex gap-2">
                {anomaly.status === 'open' && (
                  <Button
                    variant="outline"
                    onClick={() => setPendingAction('acknowledge')}
                  >
                    Acknowledge
                  </Button>
                )}
                <Button
                  variant="outline"
                  onClick={() => setPendingAction('resolve')}
                >
                  Resolve
                </Button>
                <Button
                  variant="outline"
                  onClick={() => setPendingAction('dismiss')}
                >
                  Dismiss
                </Button>
              </div>
            )}
        </>
      )}

      <Dialog
        open={!!pendingAction}
        onOpenChange={(open) => !open && setPendingAction(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {pendingAction === 'acknowledge'
                ? 'Acknowledge'
                : pendingAction === 'resolve'
                  ? 'Resolve'
                  : 'Dismiss'}{' '}
              anomaly
            </DialogTitle>
            <DialogDescription>Optional note for the record.</DialogDescription>
          </DialogHeader>
          <Textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Note (optional)"
          />
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setPendingAction(null)}
              disabled={mutation.isPending}
            >
              Cancel
            </Button>
            <Button
              onClick={() => pendingAction && mutation.mutate(pendingAction)}
              disabled={mutation.isPending}
            >
              {mutation.isPending ? '…' : 'Confirm'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
