'use client';

import { useState } from 'react';
import Link from 'next/link';
import { z } from 'zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import {
  Badge,
  Button,
  Checkbox,
  CodeBlock,
  DataTable,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  EmptyState,
  FormField,
  Input,
  Textarea,
  PageHeader,
  useToast,
} from '@verifyng/ui';
import {
  WebhookIcon,
  PlusIcon,
  AlertTriangleIcon,
  ListIcon,
} from 'lucide-react';
import { useAuth } from '@/lib/auth-store';
import { useTenantPath } from '@/lib/tenant-path';
import { queryKeys } from '@/lib/query';
import { ApiError } from '@/lib/api-client';
import { Form, setServerErrors, useZodForm } from '@/lib/forms';
import {
  WEBHOOK_EVENT_CATALOGUE,
  createWebhookEndpoint,
  listWebhookDeliveries,
  listWebhookEndpoints,
  rotateWebhookSecret,
  testWebhookEndpoint,
  updateWebhookEndpoint,
  type WebhookEndpoint,
} from '@/lib/webhooks';

const endpointSchema = z.object({
  url: z.string().url('Enter a valid URL'),
  events: z.array(z.string()).min(1, 'Select at least one event'),
  description: z.string().max(500).optional(),
});
type EndpointInput = z.infer<typeof endpointSchema>;

function SecretRevealDialog({
  secret,
  onClose,
}: {
  secret: string | null;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const [hasStored, setHasStored] = useState(false);

  return (
    <Dialog
      open={!!secret}
      onOpenChange={(open) => {
        if (!open && hasStored) onClose();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Save your webhook secret</DialogTitle>
        </DialogHeader>
        <p className="text-fg-muted text-sm">
          This is the only time the full secret is shown. Use it to verify the{' '}
          <code>X-VerifyNG-Signature</code> header on incoming deliveries.
        </p>
        {secret ? (
          <div className="flex items-center gap-2">
            <CodeBlock code={secret} className="flex-1" />
            <Button
              variant="outline"
              onClick={() => {
                navigator.clipboard.writeText(secret);
                toast({ title: 'Copied secret' });
              }}
            >
              Copy
            </Button>
          </div>
        ) : null}
        <label className="flex items-center gap-2 text-sm">
          <Checkbox
            checked={hasStored}
            onCheckedChange={(checked) => setHasStored(checked === true)}
          />
          I have stored it
        </label>
        <DialogFooter>
          <Button
            disabled={!hasStored}
            onClick={() => {
              setHasStored(false);
              onClose();
            }}
          >
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function WebhooksPage() {
  const { activeTenantId, role } = useAuth();
  const tenantPath = useTenantPath();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const isOwner = role === 'owner';

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<WebhookEndpoint | null>(null);
  const [revealedSecret, setRevealedSecret] = useState<string | null>(null);

  const endpointsQuery = useQuery({
    queryKey: queryKeys.webhooks.list(activeTenantId ?? ''),
    queryFn: () => listWebhookEndpoints(tenantPath),
    enabled: !!activeTenantId,
  });

  const form = useZodForm<EndpointInput>(endpointSchema, {
    url: '',
    events: [],
    description: '',
  });

  function openCreate() {
    setEditTarget(null);
    form.reset({ url: '', events: [], description: '' });
    setDialogOpen(true);
  }

  function openEdit(endpoint: WebhookEndpoint) {
    setEditTarget(endpoint);
    form.reset({
      url: endpoint.url,
      events: endpoint.events,
      description: endpoint.description ?? '',
    });
    setDialogOpen(true);
  }

  function invalidateList() {
    queryClient.invalidateQueries({
      queryKey: queryKeys.webhooks.list(activeTenantId ?? ''),
    });
  }

  const saveMutation = useMutation({
    mutationFn: async (input: EndpointInput) => {
      if (editTarget) {
        await updateWebhookEndpoint(tenantPath, editTarget.id, input);
        return { secret: null };
      }
      const { secret } = await createWebhookEndpoint(tenantPath, input);
      return { secret };
    },
    onSuccess: ({ secret }) => {
      setDialogOpen(false);
      invalidateList();
      if (secret) setRevealedSecret(secret);
    },
    onError: (error: unknown) => {
      setServerErrors(form, error);
      if (error instanceof ApiError && !error.details?.length) {
        toast({ title: error.message, variant: 'destructive' });
      }
    },
  });

  const toggleStatusMutation = useMutation({
    mutationFn: (endpoint: WebhookEndpoint) =>
      updateWebhookEndpoint(tenantPath, endpoint.id, {
        status: endpoint.status === 'active' ? 'disabled' : 'active',
      }),
    onSuccess: invalidateList,
    onError: (error: unknown) => {
      toast({
        title: error instanceof ApiError ? error.message : 'Update failed',
        variant: 'destructive',
      });
    },
  });

  const rotateMutation = useMutation({
    mutationFn: (id: string) => rotateWebhookSecret(tenantPath, id),
    onSuccess: ({ secret }) => setRevealedSecret(secret),
    onError: (error: unknown) => {
      toast({
        title: error instanceof ApiError ? error.message : 'Rotation failed',
        variant: 'destructive',
      });
    },
  });

  const testMutation = useMutation({
    mutationFn: (endpoint: WebhookEndpoint) =>
      testWebhookEndpoint(tenantPath, endpoint.id).then((res) => ({
        ...res,
        endpointId: endpoint.id,
      })),
    onSuccess: async ({ deliveryId, endpointId }) => {
      toast({ title: 'Test webhook sent' });
      for (let attempt = 0; attempt < 5; attempt++) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
        const page = await listWebhookDeliveries(tenantPath, { endpointId });
        const delivery = page.data.find((d) => d.id === deliveryId);
        if (
          delivery &&
          delivery.status !== 'pending' &&
          delivery.status !== 'delivering'
        ) {
          toast({
            title: `Test delivery ${delivery.status}`,
            description: delivery.lastStatusCode
              ? `Responded ${delivery.lastStatusCode}`
              : (delivery.lastError ?? undefined),
            variant:
              delivery.status === 'succeeded' ? undefined : 'destructive',
          });
          return;
        }
      }
      toast({ title: 'Still pending — check the delivery log' });
    },
    onError: (error: unknown) => {
      toast({
        title: error instanceof ApiError ? error.message : 'Test send failed',
        variant: 'destructive',
      });
    },
  });

  const selectedEvents = form.watch('events') ?? [];
  function toggleEvent(event: string, checked: boolean) {
    const next = checked
      ? [...selectedEvents, event]
      : selectedEvents.filter((e) => e !== event);
    form.setValue('events', next, { shouldValidate: true });
  }

  const columns: ColumnDef<WebhookEndpoint>[] = [
    {
      accessorKey: 'url',
      header: 'URL',
      cell: ({ row }) => (
        <span className="font-mono text-xs">{row.original.url}</span>
      ),
    },
    {
      accessorKey: 'events',
      header: 'Events',
      cell: ({ row }) => (
        <div className="flex flex-wrap gap-1">
          {row.original.events.map((e) => (
            <Badge key={e} variant="secondary" className="font-mono text-xs">
              {e}
            </Badge>
          ))}
        </div>
      ),
    },
    {
      accessorKey: 'status',
      header: 'Status',
      cell: ({ row }) => (
        <Badge
          variant={
            row.original.status === 'active' ? 'secondary' : 'destructive'
          }
        >
          {row.original.status}
        </Badge>
      ),
    },
    {
      accessorKey: 'failureStreak',
      header: 'Failure streak',
      cell: ({ row }) => row.original.failureStreak,
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Webhooks"
        description="Deliver domain events to your systems. See the consumer guide for signature verification."
        actions={
          isOwner ? (
            <Button onClick={openCreate}>
              <PlusIcon className="mr-2 h-4 w-4" />
              Add endpoint
            </Button>
          ) : undefined
        }
      />

      {endpointsQuery.isError ? (
        <EmptyState
          icon={AlertTriangleIcon}
          title="Couldn't load webhook endpoints"
          description="Try again shortly."
        />
      ) : (
        <DataTable
          columns={columns}
          data={endpointsQuery.data ?? []}
          isLoading={endpointsQuery.isLoading}
          emptyState={
            <EmptyState icon={WebhookIcon} title="No webhook endpoints yet" />
          }
          rowActions={(endpoint) => (
            <div className="flex flex-wrap items-center gap-1">
              <Button variant="ghost" size="sm" asChild>
                <Link href={`/webhooks/${endpoint.id}/deliveries`}>
                  <ListIcon className="mr-1 h-3 w-3" />
                  Deliveries
                </Link>
              </Button>
              {isOwner ? (
                <>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={testMutation.isPending}
                    onClick={() => testMutation.mutate(endpoint)}
                  >
                    Send test
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => openEdit(endpoint)}
                  >
                    Edit
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={rotateMutation.isPending}
                    onClick={() => rotateMutation.mutate(endpoint.id)}
                  >
                    Rotate secret
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={toggleStatusMutation.isPending}
                    onClick={() => toggleStatusMutation.mutate(endpoint)}
                  >
                    {endpoint.status === 'active' ? 'Disable' : 'Enable'}
                  </Button>
                </>
              ) : null}
            </div>
          )}
        />
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editTarget ? 'Edit webhook endpoint' : 'Add webhook endpoint'}
            </DialogTitle>
          </DialogHeader>
          <Form
            form={form}
            onSubmit={(values) => saveMutation.mutate(values)}
            className="space-y-4"
          >
            <FormField
              label="URL"
              htmlFor="endpoint-url"
              error={form.formState.errors.url?.message}
              required
            >
              <Input
                id="endpoint-url"
                placeholder="https://erp.example.com/webhooks/verifyng"
                {...form.register('url')}
              />
            </FormField>
            <FormField
              label="Events"
              htmlFor="endpoint-events"
              error={form.formState.errors.events?.message}
              required
            >
              <div className="space-y-2" id="endpoint-events">
                {WEBHOOK_EVENT_CATALOGUE.map((event) => (
                  <label
                    key={event}
                    className="flex items-center gap-2 text-sm"
                  >
                    <Checkbox
                      checked={selectedEvents.includes(event)}
                      onCheckedChange={(checked) =>
                        toggleEvent(event, checked === true)
                      }
                    />
                    <span className="font-mono">{event}</span>
                  </label>
                ))}
              </div>
            </FormField>
            <FormField label="Description" htmlFor="endpoint-description">
              <Textarea
                id="endpoint-description"
                placeholder="What this endpoint is for"
                {...form.register('description')}
              />
            </FormField>
            <DialogFooter>
              <Button type="submit" disabled={saveMutation.isPending}>
                {saveMutation.isPending
                  ? 'Saving…'
                  : editTarget
                    ? 'Save changes'
                    : 'Add endpoint'}
              </Button>
            </DialogFooter>
          </Form>
        </DialogContent>
      </Dialog>

      <SecretRevealDialog
        secret={revealedSecret}
        onClose={() => setRevealedSecret(null)}
      />
    </div>
  );
}
