'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import {
  Badge,
  Button,
  DataTable,
  EmptyState,
  PageHeader,
  ProgressBar,
  StatusChip,
  useToast,
} from '@verifyng/ui';
import { AlertTriangleIcon, CopyIcon, DownloadIcon } from 'lucide-react';
import { useAuth } from '@/lib/auth-store';
import { useTenantPath } from '@/lib/tenant-path';
import { queryKeys } from '@/lib/query';
import { ApiError } from '@/lib/api-client';
import {
  downloadArtefact,
  getBatch,
  getBatchUnits,
  type ArtefactKind,
  type Unit,
} from '@/lib/batches';
import { redactCode } from '@/lib/redact-code';

const STATUS_VARIANT: Record<
  string,
  'success' | 'warning' | 'danger' | 'info' | 'neutral'
> = {
  minting: 'info',
  minted: 'success',
  delivered: 'success',
  printed: 'success',
  shipped: 'success',
  closed: 'neutral',
  failed: 'danger',
};

const ARTEFACTS: Array<{
  kind: ArtefactKind;
  label: string;
  fileName: string;
}> = [
  { kind: 'all-zip', label: 'All exports (.zip)', fileName: 'all.zip' },
  { kind: 'qr-zip', label: 'QR codes (.zip)', fileName: 'qr.zip' },
  {
    kind: 'tier1-csv',
    label: 'Tier-1 codes (.csv)',
    fileName: 'tier1-codes.csv',
  },
  {
    kind: 'sheet-pdf',
    label: 'Application sheet (.pdf)',
    fileName: 'application-sheet.pdf',
  },
];

export default function BatchDetailPage() {
  const params = useParams<{ id: string }>();
  const batchId = params.id;
  const { activeTenantId, role } = useAuth();
  const tenantPath = useTenantPath();
  const { toast } = useToast();
  const canDownload = role === 'operator' || role === 'owner';

  const batchQuery = useQuery({
    queryKey: queryKeys.batches.detail(activeTenantId ?? '', batchId),
    queryFn: () => getBatch(tenantPath, batchId),
    enabled: !!activeTenantId,
    refetchInterval: (query) =>
      query.state.data?.status === 'minting' ? 2000 : false,
  });

  const [unitsCursor, setUnitsCursor] = useState<string | undefined>(undefined);
  const unitsQuery = useQuery({
    queryKey: [
      ...queryKeys.batches.units(activeTenantId ?? '', batchId),
      unitsCursor,
    ],
    queryFn: () => getBatchUnits(tenantPath, batchId, unitsCursor),
    enabled: !!activeTenantId,
  });

  async function handleDownload(artefact: ArtefactKind, fileName: string) {
    try {
      await downloadArtefact(tenantPath, batchId, artefact, fileName);
    } catch (error) {
      toast({
        title: error instanceof ApiError ? error.message : 'Download failed',
        variant: 'destructive',
      });
    }
  }

  function copyCode(code: string) {
    navigator.clipboard.writeText(code);
    toast({ title: 'Copied tier-1 code' });
  }

  const columns: ColumnDef<Unit>[] = [
    { accessorKey: 'serial', header: 'Serial' },
    {
      accessorKey: 'tier1Code',
      header: 'Tier-1 code',
      cell: ({ row }) => {
        const code = row.original.tier1Code;
        if (!canDownload) return redactCode(code);
        return (
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs">{code}</span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => copyCode(code)}
              aria-label="Copy full code"
            >
              <CopyIcon className="h-3 w-3" />
            </Button>
          </div>
        );
      },
    },
    {
      accessorKey: 'state',
      header: 'State',
      cell: ({ row }) => (
        <Badge variant="secondary">{row.original.state}</Badge>
      ),
    },
  ];

  if (batchQuery.isError) {
    return (
      <EmptyState
        icon={AlertTriangleIcon}
        title="Couldn't load this batch"
        description="It may not exist, or the catalog service isn't reachable yet."
      />
    );
  }

  const batch = batchQuery.data;

  return (
    <div className="space-y-6">
      <PageHeader
        title={batch ? `Batch ${batch.id.slice(0, 8)}` : 'Batch'}
        description={
          batch
            ? `${batch.product.name} · OEM: ${batch.oem.name} · watermark ${batch.watermark}`
            : undefined
        }
        actions={
          batch ? (
            <StatusChip variant={STATUS_VARIANT[batch.status] ?? 'neutral'}>
              {batch.status}
            </StatusChip>
          ) : undefined
        }
      />

      {batch && (
        <>
          <div className="border-border bg-surface space-y-3 rounded-md border p-4">
            <ProgressBar
              value={batch.progress.minted}
              max={batch.progress.total}
              label={`${batch.progress.minted.toLocaleString()} / ${batch.progress.total.toLocaleString()} units minted`}
              showValue
            />
            {batch.status === 'failed' && batch.failedReason && (
              <p className="text-v-flag text-sm">{batch.failedReason}</p>
            )}
          </div>

          <div className="space-y-3">
            <h2 className="text-sm font-medium">Downloads</h2>
            {!batch.exportsReadyAt ? (
              <p className="text-fg-muted text-sm">
                Exports are still being generated for this batch.
              </p>
            ) : !canDownload ? (
              <p className="text-fg-muted text-sm">
                Only operators and owners can download batch exports.
              </p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {ARTEFACTS.map((artefact) => (
                  <Button
                    key={artefact.kind}
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      handleDownload(artefact.kind, artefact.fileName)
                    }
                  >
                    <DownloadIcon className="mr-2 h-4 w-4" />
                    {artefact.label}
                  </Button>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-medium">Units</h2>
              <Link
                href={`/units/batch/${batchId}`}
                className="text-brand text-sm hover:underline"
              >
                Units &amp; recall (E07) →
              </Link>
            </div>
            <DataTable
              columns={columns}
              data={unitsQuery.data ?? []}
              isLoading={unitsQuery.isLoading}
              emptyState={<EmptyState title="No units yet" />}
              pagination={{
                hasPrev: !!unitsCursor,
                hasNext: (unitsQuery.data?.length ?? 0) === 100,
                onPrev: () => setUnitsCursor(undefined),
                onNext: () => {
                  const last = unitsQuery.data?.[unitsQuery.data.length - 1];
                  if (last) setUnitsCursor(last.id);
                },
              }}
            />
          </div>
        </>
      )}
    </div>
  );
}
