'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import {
  Badge,
  Button,
  DataTable,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  EmptyState,
  Input,
  PageHeader,
  ProgressBar,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
  useToast,
} from '@verifyng/ui';
import { AlertTriangleIcon } from 'lucide-react';
import { useAuth } from '@/lib/auth-store';
import { ApiError } from '@/lib/api-client';
import {
  getBatchUnits,
  getRecallProgress,
  recallBatch,
  type Unit,
  type UnitState,
} from '@/lib/units';

const CONFIRM_PHRASE = 'RECALL';

export default function BatchUnitsPage() {
  const params = useParams<{ batchId: string }>();
  const batchId = params.batchId;
  const { activeTenantId, role } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const isOwner = role === 'owner';

  const [state, setState] = useState<UnitState | 'all'>('all');
  const unitsQuery = useQuery({
    queryKey: ['units', 'batch', activeTenantId, batchId, state],
    queryFn: () => getBatchUnits(batchId, state === 'all' ? undefined : state),
    enabled: !!activeTenantId,
  });

  const [recallOpen, setRecallOpen] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [reason, setReason] = useState('');
  const [jobId, setJobId] = useState<string | null>(null);

  const recallMutation = useMutation({
    mutationFn: () => recallBatch(batchId, reason),
    onSuccess: (result) => {
      setJobId(result.jobId);
      setRecallOpen(false);
      setConfirmText('');
      setReason('');
    },
    onError: (error) => {
      toast({
        title: error instanceof ApiError ? error.message : 'Recall failed',
        variant: 'destructive',
      });
    },
  });

  const progressQuery = useQuery({
    queryKey: ['units', 'recall-progress', batchId, jobId],
    queryFn: () => getRecallProgress(batchId, jobId!),
    enabled: !!jobId,
    refetchInterval: (q) => (q.state.data?.progress === 100 ? false : 1000),
  });

  if (progressQuery.data?.progress === 100 && jobId) {
    queryClient.invalidateQueries({
      queryKey: ['units', 'batch', activeTenantId, batchId],
    });
  }

  const columns: ColumnDef<Unit>[] = [
    { accessorKey: 'serial', header: 'Serial' },
    {
      accessorKey: 'tier1Code',
      header: 'Tier-1 code',
      cell: ({ row }) => (
        <Link
          href={`/units/${row.original.id}`}
          className="text-brand font-mono text-xs hover:underline"
        >
          {row.original.tier1Code}
        </Link>
      ),
    },
    {
      accessorKey: 'state',
      header: 'State',
      cell: ({ row }) => (
        <Badge variant="secondary">{row.original.state}</Badge>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Batch units"
        description="Unit-by-unit state for this batch. Recall reuses per-unit decommission — restore stays possible unit by unit."
        actions={
          isOwner ? (
            <Button variant="destructive" onClick={() => setRecallOpen(true)}>
              Recall batch
            </Button>
          ) : undefined
        }
      />

      {jobId && (
        <div className="border-border bg-surface space-y-2 rounded-md border p-4">
          <ProgressBar
            value={progressQuery.data?.progress ?? 0}
            max={100}
            label={`Recall progress — ${progressQuery.data?.state ?? 'queued'}`}
            showValue
          />
        </div>
      )}

      <Select
        value={state}
        onValueChange={(v) => setState(v as UnitState | 'all')}
      >
        <SelectTrigger className="w-48">
          <SelectValue placeholder="Filter by state" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All states</SelectItem>
          <SelectItem value="active">Active</SelectItem>
          <SelectItem value="flagged">Flagged</SelectItem>
          <SelectItem value="decommissioned">Decommissioned</SelectItem>
        </SelectContent>
      </Select>

      {unitsQuery.isError ? (
        <EmptyState icon={AlertTriangleIcon} title="Couldn't load units" />
      ) : (
        <DataTable
          columns={columns}
          data={unitsQuery.data?.items ?? []}
          isLoading={unitsQuery.isLoading}
          emptyState={<EmptyState title="No units for this filter" />}
        />
      )}

      <Dialog open={recallOpen} onOpenChange={setRecallOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Recall this batch</DialogTitle>
            <DialogDescription>
              Decommissions every active/flagged unit in this batch. This
              affects real consumer-facing verdicts. Type{' '}
              <strong>{CONFIRM_PHRASE}</strong> to confirm.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Reason (required)"
          />
          <Input
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            placeholder={CONFIRM_PHRASE}
          />
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setRecallOpen(false)}
              disabled={recallMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={
                confirmText !== CONFIRM_PHRASE ||
                !reason.trim() ||
                recallMutation.isPending
              }
              onClick={() => recallMutation.mutate()}
            >
              {recallMutation.isPending ? '…' : 'Recall batch'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
