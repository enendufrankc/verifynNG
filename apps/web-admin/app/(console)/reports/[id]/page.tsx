'use client';

import { useParams } from 'next/navigation';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import {
  Badge,
  Button,
  EmptyState,
  PageHeader,
  StatusChip,
  Textarea,
  useToast,
} from '@verifyng/ui';
import { AlertTriangleIcon } from 'lucide-react';
import { useAuth } from '@/lib/auth-store';
import { queryKeys } from '@/lib/query';
import { getReport, addReportNote, assignReport } from '@/lib/reports';
import type { ReportStatus } from '@/lib/reports';
import { StatusDialog } from './status-dialog';

const STATUS_VARIANT: Record<
  ReportStatus,
  'success' | 'warning' | 'danger' | 'info' | 'neutral'
> = {
  new: 'info',
  triaged: 'warning',
  investigating: 'warning',
  closed: 'neutral',
};

export default function ReportDetailPage() {
  const params = useParams<{ id: string }>();
  const { activeTenantId, role, user } = useAuth();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [note, setNote] = useState('');
  const canAct = role === 'owner' || role === 'operator';

  const reportQuery = useQuery({
    queryKey: queryKeys.reports.detail(activeTenantId ?? '', params.id),
    queryFn: () => getReport(params.id),
    enabled: !!activeTenantId,
  });

  const invalidateDetail = () =>
    queryClient.invalidateQueries({
      queryKey: queryKeys.reports.detail(activeTenantId ?? '', params.id),
    });

  const noteMutation = useMutation({
    mutationFn: () => addReportNote(params.id, note),
    onSuccess: () => {
      setNote('');
      invalidateDetail();
    },
    onError: () => {
      toast({ title: 'Could not add note', variant: 'destructive' });
    },
  });

  const assignMutation = useMutation({
    mutationFn: (memberId: string) => assignReport(params.id, memberId),
    onSuccess: () => invalidateDetail(),
    onError: () => {
      toast({ title: 'Could not assign report', variant: 'destructive' });
    },
  });

  if (reportQuery.isError) {
    return (
      <EmptyState
        icon={AlertTriangleIcon}
        title="Couldn't load this report"
        description="It may not exist, or the reports service isn't reachable yet."
      />
    );
  }

  const report = reportQuery.data;

  return (
    <div className="space-y-6">
      <PageHeader
        title={report ? report.reference : 'Report'}
        description={
          report
            ? `${report.purchaseChannel} — ${report.verdictAtReport} verdict`
            : undefined
        }
        actions={
          report ? (
            <StatusChip variant={STATUS_VARIANT[report.status]}>
              {report.status}
            </StatusChip>
          ) : undefined
        }
      />

      {report && (
        <div className="grid grid-cols-2 gap-6">
          <div className="space-y-4">
            <h3 className="font-medium">Photos</h3>
            <div className="grid grid-cols-3 gap-2">
              {report.photos.map((p) => (
                <div
                  key={p.id}
                  className="bg-muted flex aspect-square items-center justify-center rounded border text-xs"
                >
                  {p.status}
                </div>
              ))}
            </div>

            <h3 className="font-medium">Anomalies</h3>
            {report.anomalies.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                None (or E07 not yet available).
              </p>
            ) : (
              <div className="flex gap-2">
                {report.anomalies.map((a, i) => (
                  <Badge key={i}>{JSON.stringify(a)}</Badge>
                ))}
              </div>
            )}

            {report.unitId && (
              <a
                href={`/units/${report.unitId}`}
                className="text-brand text-sm hover:underline"
              >
                View linked unit →
              </a>
            )}
          </div>

          <div className="space-y-4">
            {canAct && (
              <div className="flex gap-2">
                <Button
                  size="sm"
                  disabled={!user?.id}
                  onClick={() => user?.id && assignMutation.mutate(user.id)}
                >
                  Assign to me
                </Button>
                <StatusDialog
                  reportId={params.id}
                  currentStatus={report.status}
                  hasContact={Boolean(report.contactEmail)}
                />
              </div>
            )}

            <h3 className="font-medium">Notes</h3>
            <ul className="space-y-2">
              {report.notes.map((n) => (
                <li key={n.id} className="rounded border p-2 text-sm">
                  <p>{n.body}</p>
                  <p className="text-muted-foreground text-xs">
                    {new Date(n.createdAt).toLocaleString()}
                  </p>
                </li>
              ))}
            </ul>
            {canAct && (
              <div className="space-y-2">
                <Textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Add a note…"
                />
                <Button
                  size="sm"
                  onClick={() => noteMutation.mutate()}
                  disabled={!note}
                >
                  Add note
                </Button>
              </div>
            )}

            <h3 className="font-medium">Status history</h3>
            <ul className="space-y-1 text-sm">
              {report.statusChanges.map((s) => (
                <li key={s.id}>
                  {s.fromStatus ?? '—'} → {s.toStatus}{' '}
                  {s.outcome ? `(${s.outcome})` : ''} —{' '}
                  {new Date(s.createdAt).toLocaleString()}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
