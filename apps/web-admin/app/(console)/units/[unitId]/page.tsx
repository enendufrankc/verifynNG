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
  PageHeader,
  Textarea,
  useToast,
} from '@verifyng/ui';
import { AlertTriangleIcon } from 'lucide-react';
import { useAuth } from '@/lib/auth-store';
import { ApiError } from '@/lib/api-client';
import {
  decommissionUnit,
  flagUnit,
  getUnit,
  restoreUnit,
  type ScanEvent,
  type UnitTransition,
} from '@/lib/units';

const STATE_VARIANT: Record<string, 'default' | 'secondary' | 'destructive'> = {
  active: 'default',
  flagged: 'secondary',
  decommissioned: 'destructive',
};

type Action = 'flag' | 'decommission' | 'restore';

export default function UnitDetailPage() {
  const params = useParams<{ unitId: string }>();
  const unitId = params.unitId;
  const { activeTenantId, role } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const isOwner = role === 'owner';
  const canFlag = role === 'operator' || role === 'owner';

  const query = useQuery({
    queryKey: ['units', 'detail', activeTenantId, unitId],
    queryFn: () => getUnit(unitId),
    enabled: !!activeTenantId,
  });

  const [pendingAction, setPendingAction] = useState<Action | null>(null);
  const [reason, setReason] = useState('');

  const mutation = useMutation({
    mutationFn: async (action: Action) => {
      if (!reason.trim()) throw new Error('A reason is required');
      if (action === 'flag') return flagUnit(unitId, reason);
      if (action === 'decommission') return decommissionUnit(unitId, reason);
      return restoreUnit(unitId, reason);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['units', 'detail', activeTenantId, unitId],
      });
      setPendingAction(null);
      setReason('');
    },
    onError: (error) => {
      toast({
        title:
          error instanceof ApiError
            ? error.message
            : ((error as Error).message ?? 'Action failed'),
        variant: 'destructive',
      });
    },
  });

  if (query.isError) {
    return (
      <EmptyState icon={AlertTriangleIcon} title="Couldn't load this unit" />
    );
  }

  const data = query.data;
  const unit = data?.unit;

  const scanColumns: ColumnDef<ScanEvent>[] = [
    { accessorKey: 'tier', header: 'Tier' },
    { accessorKey: 'verdict', header: 'Verdict' },
    {
      id: 'geo',
      header: 'City',
      cell: ({ row }) => row.original.geoCity ?? '—',
    },
    {
      accessorKey: 'createdAt',
      header: 'When',
      cell: ({ row }) => new Date(row.original.createdAt).toLocaleString(),
    },
  ];

  const transitionColumns: ColumnDef<UnitTransition>[] = [
    { accessorKey: 'fromState', header: 'From' },
    { accessorKey: 'toState', header: 'To' },
    { accessorKey: 'reason', header: 'Reason' },
    { accessorKey: 'actorType', header: 'Actor' },
    {
      accessorKey: 'createdAt',
      header: 'When',
      cell: ({ row }) => new Date(row.original.createdAt).toLocaleString(),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title={unit ? unit.tier1Code : 'Unit'}
        description={
          unit
            ? `Serial ${unit.serial} · batch ${unit.batchId.slice(0, 8)}`
            : undefined
        }
        actions={
          unit ? (
            <Badge variant={STATE_VARIANT[unit.state] ?? 'secondary'}>
              {unit.state}
            </Badge>
          ) : undefined
        }
      />

      {unit && (
        <>
          <div className="flex gap-2">
            <Button
              variant="outline"
              disabled={!canFlag || unit.state !== 'active'}
              onClick={() => setPendingAction('flag')}
            >
              Flag
            </Button>
            <Button
              variant="outline"
              disabled={!isOwner || unit.state === 'decommissioned'}
              onClick={() => setPendingAction('decommission')}
              title={!isOwner ? 'Owner only' : undefined}
            >
              Decommission
            </Button>
            <Button
              variant="outline"
              disabled={!isOwner || unit.state === 'active'}
              onClick={() => setPendingAction('restore')}
              title={!isOwner ? 'Owner only' : undefined}
            >
              Restore
            </Button>
          </div>

          {data.anomalies.length > 0 && (
            <div className="space-y-2">
              <h2 className="text-sm font-medium">Anomalies</h2>
              <ul className="divide-border divide-y rounded-md border">
                {data.anomalies.map((a) => (
                  <li
                    key={a.id}
                    className="flex items-center justify-between p-3 text-sm"
                  >
                    <Link
                      href={`/anomalies/${a.id}`}
                      className="text-brand hover:underline"
                    >
                      {a.rule}
                    </Link>
                    <span>score {a.score}</span>
                    <Badge variant="secondary">{a.status}</Badge>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="space-y-2">
            <h2 className="text-sm font-medium">Transitions</h2>
            <DataTable
              columns={transitionColumns}
              data={data.transitions}
              emptyState={<EmptyState title="No transitions yet" />}
            />
          </div>

          <div className="space-y-2">
            <h2 className="text-sm font-medium">Scan history</h2>
            <DataTable
              columns={scanColumns}
              data={data.scanEvents}
              emptyState={<EmptyState title="No scans yet" />}
            />
          </div>
        </>
      )}

      <Dialog
        open={!!pendingAction}
        onOpenChange={(open) => !open && setPendingAction(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {pendingAction === 'flag'
                ? 'Flag'
                : pendingAction === 'decommission'
                  ? 'Decommission'
                  : 'Restore'}{' '}
              unit
            </DialogTitle>
            <DialogDescription>
              A reason is required and is recorded on the transition and audit
              log.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Reason"
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
