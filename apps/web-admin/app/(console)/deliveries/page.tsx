'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { z } from 'zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import {
  Badge,
  Button,
  DataTable,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  EmptyState,
  FormField,
  Input,
  PageHeader,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  StatusChip,
  useToast,
} from '@verifyng/ui';
import { AlertTriangleIcon, PlusIcon, TruckIcon } from 'lucide-react';
import { useAuth } from '@/lib/auth-store';
import { useTenantPath } from '@/lib/tenant-path';
import { queryKeys } from '@/lib/query';
import { ApiError } from '@/lib/api-client';
import { Form, setServerErrors, useZodForm } from '@/lib/forms';
import { listBatches } from '@/lib/batches';
import { listOems } from '@/lib/oems';
import {
  deliverBatch,
  listAllDeliveries,
  type Delivery,
  type DeliveryStatus,
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

const deliverSchema = z.object({
  batchId: z.string().min(1, 'Select a batch'),
  oemId: z.string().min(1, 'Select an OEM'),
  expiresInHours: z.coerce
    .number()
    .int()
    .min(1)
    .max(24 * 30),
  maxDownloads: z.coerce.number().int().min(1).max(1000),
  expectedShipDate: z.string().optional(),
});
type DeliverInput = z.infer<typeof deliverSchema>;

function receiptBadge(delivery: Delivery) {
  const latest = delivery.receipts[0];
  if (!latest) return null;
  return (
    <Badge variant={latest.matched ? 'default' : 'destructive'}>
      {latest.matched ? 'Receipt OK' : `Mismatch: ${latest.mismatchReason}`}
    </Badge>
  );
}

export default function DeliveriesPage() {
  const { activeTenantId, role } = useAuth();
  const tenantPath = useTenantPath();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const canDeliver = role === 'owner';

  const [dialogOpen, setDialogOpen] = useState(false);

  const deliveriesQuery = useQuery({
    queryKey: queryKeys.deliveries.list(activeTenantId ?? ''),
    queryFn: () => listAllDeliveries(tenantPath),
    enabled: !!activeTenantId,
  });
  const batchesQuery = useQuery({
    queryKey: queryKeys.batches.list(activeTenantId ?? ''),
    queryFn: () => listBatches(tenantPath),
    enabled: !!activeTenantId && dialogOpen,
  });
  const oemsQuery = useQuery({
    queryKey: queryKeys.oems.list(activeTenantId ?? ''),
    queryFn: () => listOems(tenantPath),
    enabled: !!activeTenantId && dialogOpen,
  });

  const mintedBatches = useMemo(
    () => batchesQuery.data?.filter((b) => b.status === 'minted') ?? [],
    [batchesQuery.data],
  );
  const activeOems = useMemo(
    () => oemsQuery.data?.filter((o) => o.status === 'active') ?? [],
    [oemsQuery.data],
  );

  const form = useZodForm<DeliverInput>(deliverSchema, {
    batchId: '',
    oemId: '',
    expiresInHours: 72,
    maxDownloads: 5,
    expectedShipDate: '',
  });

  const deliverMutation = useMutation({
    mutationFn: (input: DeliverInput) =>
      deliverBatch(tenantPath, input.batchId, {
        oemId: input.oemId,
        expiresInHours: input.expiresInHours,
        maxDownloads: input.maxDownloads,
        expectedShipDate: input.expectedShipDate || undefined,
      }),
    onSuccess: () => {
      toast({ title: 'Batch delivered' });
      setDialogOpen(false);
      form.reset();
      queryClient.invalidateQueries({
        queryKey: queryKeys.deliveries.list(activeTenantId ?? ''),
      });
    },
    onError: (error: unknown) => {
      setServerErrors(form, error);
      if (error instanceof ApiError && !error.details?.length) {
        toast({ title: error.message, variant: 'destructive' });
      }
    },
  });

  const columns: ColumnDef<Delivery>[] = [
    {
      accessorKey: 'batchId',
      header: 'Batch',
      cell: ({ row }) =>
        row.original.batch ? (
          <Link
            href={`/batches/${row.original.batchId}`}
            className="hover:underline"
          >
            {row.original.batch.product.sku} ·{' '}
            {row.original.batchId.slice(0, 8)}
          </Link>
        ) : (
          row.original.batchId.slice(0, 8)
        ),
    },
    {
      accessorKey: 'oem.name',
      header: 'OEM',
      cell: ({ row }) => row.original.oem.name,
    },
    {
      accessorKey: 'status',
      header: 'Status',
      cell: ({ row }) => (
        <StatusChip variant={STATUS_VARIANT[row.original.status]}>
          {row.original.status}
        </StatusChip>
      ),
    },
    {
      id: 'downloads',
      header: 'Downloads',
      cell: ({ row }) =>
        `${row.original.downloadCount} / ${row.original.maxDownloads}`,
    },
    {
      accessorKey: 'expiresAt',
      header: 'Expires',
      cell: ({ row }) => new Date(row.original.expiresAt).toLocaleString(),
    },
    {
      id: 'receipt',
      header: 'Receipt',
      cell: ({ row }) => receiptBadge(row.original) ?? '—',
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Deliveries"
        description="Hand a minted batch to a verified OEM for printing."
        actions={
          canDeliver ? (
            <Button onClick={() => setDialogOpen(true)}>
              <PlusIcon className="mr-2 h-4 w-4" />
              Deliver batch
            </Button>
          ) : undefined
        }
      />

      {deliveriesQuery.isError ? (
        <EmptyState
          icon={AlertTriangleIcon}
          title="Couldn't load deliveries"
          description="The delivery service isn't reachable yet."
        />
      ) : (
        <DataTable
          columns={columns}
          data={deliveriesQuery.data ?? []}
          isLoading={deliveriesQuery.isLoading}
          emptyState={<EmptyState icon={TruckIcon} title="No deliveries yet" />}
          rowActions={(row) => (
            <Button variant="ghost" size="sm" asChild>
              <Link href={`/deliveries/${row.id}`}>View</Link>
            </Button>
          )}
        />
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Deliver batch</DialogTitle>
          </DialogHeader>
          <Form
            form={form}
            onSubmit={(values) => deliverMutation.mutate(values)}
            className="space-y-4"
          >
            <FormField
              label="Batch"
              htmlFor="deliver-batch"
              error={form.formState.errors.batchId?.message}
              required
            >
              <Select
                onValueChange={(value) => form.setValue('batchId', value)}
              >
                <SelectTrigger id="deliver-batch">
                  <SelectValue placeholder="Select a minted batch" />
                </SelectTrigger>
                <SelectContent>
                  {mintedBatches.map((b) => (
                    <SelectItem key={b.id} value={b.id}>
                      {b.id.slice(0, 8)} — {b.count.toLocaleString()} units
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormField>

            <FormField
              label="OEM"
              htmlFor="deliver-oem"
              error={form.formState.errors.oemId?.message}
              required
            >
              <Select onValueChange={(value) => form.setValue('oemId', value)}>
                <SelectTrigger id="deliver-oem">
                  <SelectValue placeholder="Select an OEM" />
                </SelectTrigger>
                <SelectContent>
                  {activeOems.map((o) => (
                    <SelectItem key={o.id} value={o.id}>
                      {o.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormField>

            <FormField label="Expected ship date" htmlFor="deliver-ship-date">
              <Input
                id="deliver-ship-date"
                type="date"
                {...form.register('expectedShipDate')}
              />
            </FormField>

            <FormField label="Link expires in (hours)" htmlFor="deliver-expiry">
              <Input
                id="deliver-expiry"
                type="number"
                min={1}
                {...form.register('expiresInHours')}
              />
            </FormField>

            <FormField label="Max downloads" htmlFor="deliver-max-downloads">
              <Input
                id="deliver-max-downloads"
                type="number"
                min={1}
                {...form.register('maxDownloads')}
              />
            </FormField>

            <DialogFooter>
              <Button type="submit" disabled={deliverMutation.isPending}>
                {deliverMutation.isPending ? 'Delivering…' : 'Deliver'}
              </Button>
            </DialogFooter>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
