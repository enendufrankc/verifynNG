'use client';

import { useState } from 'react';
import { z } from 'zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import {
  Badge,
  Button,
  Checkbox,
  CodeBlock,
  ConfirmDialog,
  DataTable,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  EmptyState,
  FormField,
  Input,
  PageHeader,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  useToast,
} from '@verifyng/ui';
import { KeyRound, PlusIcon, AlertTriangleIcon } from 'lucide-react';
import { useAuth } from '@/lib/auth-store';
import { useTenantPath } from '@/lib/tenant-path';
import { queryKeys } from '@/lib/query';
import { ApiError } from '@/lib/api-client';
import { Form, setServerErrors, useZodForm } from '@/lib/forms';
import {
  API_KEY_SCOPES,
  createApiKey,
  listApiKeys,
  revokeApiKey,
  type ApiKey,
  type ApiKeyScope,
} from '@/lib/api-keys';

const createSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100),
  mode: z.enum(['live', 'test']),
  scopes: z.array(z.string()).min(1, 'Select at least one scope'),
});
type CreateInput = z.infer<typeof createSchema>;

function statusOf(key: ApiKey): {
  label: string;
  variant: 'secondary' | 'destructive';
} {
  if (key.revokedAt) return { label: 'Revoked', variant: 'destructive' };
  if (key.expiresAt && new Date(key.expiresAt).getTime() < Date.now()) {
    return { label: 'Expired', variant: 'destructive' };
  }
  return { label: 'Active', variant: 'secondary' };
}

export default function ApiKeysPage() {
  const { activeTenantId, role } = useAuth();
  const tenantPath = useTenantPath();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const isOwner = role === 'owner';

  const [createOpen, setCreateOpen] = useState(false);
  const [revokeTarget, setRevokeTarget] = useState<ApiKey | null>(null);
  const [revealedKey, setRevealedKey] = useState<string | null>(null);
  const [hasStoredKey, setHasStoredKey] = useState(false);

  const keysQuery = useQuery({
    queryKey: queryKeys.apiKeys.list(activeTenantId ?? ''),
    queryFn: () => listApiKeys(tenantPath),
    enabled: !!activeTenantId,
  });

  const createForm = useZodForm<CreateInput>(createSchema, {
    name: '',
    mode: 'live',
    scopes: [],
  });

  const createMutation = useMutation({
    mutationFn: (input: CreateInput) =>
      createApiKey(tenantPath, {
        name: input.name,
        mode: input.mode,
        scopes: input.scopes as ApiKeyScope[],
      }),
    onSuccess: ({ key }) => {
      setCreateOpen(false);
      setRevealedKey(key);
      setHasStoredKey(false);
      createForm.reset();
      queryClient.invalidateQueries({
        queryKey: queryKeys.apiKeys.list(activeTenantId ?? ''),
      });
    },
    onError: (error: unknown) => {
      setServerErrors(createForm, error);
      if (error instanceof ApiError && !error.details?.length) {
        toast({ title: error.message, variant: 'destructive' });
      }
    },
  });

  const revokeMutation = useMutation({
    mutationFn: (id: string) => revokeApiKey(tenantPath, id),
    onSuccess: () => {
      setRevokeTarget(null);
      queryClient.invalidateQueries({
        queryKey: queryKeys.apiKeys.list(activeTenantId ?? ''),
      });
    },
    onError: (error: unknown) => {
      toast({
        title:
          error instanceof ApiError ? error.message : 'Could not revoke key',
        variant: 'destructive',
      });
    },
  });

  const selectedScopes = createForm.watch('scopes') ?? [];
  function toggleScope(scope: string, checked: boolean) {
    const next = checked
      ? [...selectedScopes, scope]
      : selectedScopes.filter((s) => s !== scope);
    createForm.setValue('scopes', next, { shouldValidate: true });
  }

  function copySecret(secret: string) {
    navigator.clipboard.writeText(secret);
    toast({ title: 'Copied API key' });
  }

  const columns: ColumnDef<ApiKey>[] = [
    { accessorKey: 'name', header: 'Name' },
    {
      accessorKey: 'prefix',
      header: 'Key',
      cell: ({ row }) => (
        <span className="font-mono text-xs">{row.original.prefix}…</span>
      ),
    },
    {
      accessorKey: 'scopes',
      header: 'Scopes',
      cell: ({ row }) => (
        <div className="flex flex-wrap gap-1">
          {row.original.scopes.map((s) => (
            <Badge key={s} variant="secondary" className="font-mono text-xs">
              {s}
            </Badge>
          ))}
        </div>
      ),
    },
    {
      accessorKey: 'status',
      header: 'Status',
      cell: ({ row }) => {
        const { label, variant } = statusOf(row.original);
        return <Badge variant={variant}>{label}</Badge>;
      },
    },
    {
      accessorKey: 'lastUsedAt',
      header: 'Last used',
      cell: ({ row }) =>
        row.original.lastUsedAt
          ? new Date(row.original.lastUsedAt).toLocaleString()
          : 'Never',
    },
    {
      accessorKey: 'expiresAt',
      header: 'Expiry',
      cell: ({ row }) =>
        row.original.expiresAt
          ? new Date(row.original.expiresAt).toLocaleDateString()
          : 'No expiry',
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="API keys"
        description="Keys authenticate requests to the public API. See /api/docs for usage."
        actions={
          isOwner ? (
            <Dialog open={createOpen} onOpenChange={setCreateOpen}>
              <DialogTrigger asChild>
                <Button>
                  <PlusIcon className="mr-2 h-4 w-4" />
                  Create key
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Create an API key</DialogTitle>
                </DialogHeader>
                <Form
                  form={createForm}
                  onSubmit={(values) => createMutation.mutate(values)}
                  className="space-y-4"
                >
                  <FormField
                    label="Name"
                    htmlFor="key-name"
                    error={createForm.formState.errors.name?.message}
                    required
                  >
                    <Input
                      id="key-name"
                      placeholder="ERP integration"
                      {...createForm.register('name')}
                    />
                  </FormField>
                  <FormField label="Mode" htmlFor="key-mode" required>
                    <Select
                      defaultValue="live"
                      onValueChange={(value) =>
                        createForm.setValue('mode', value as 'live' | 'test')
                      }
                    >
                      <SelectTrigger id="key-mode">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="live">Live</SelectItem>
                        <SelectItem value="test">Test</SelectItem>
                      </SelectContent>
                    </Select>
                  </FormField>
                  <FormField
                    label="Scopes"
                    htmlFor="key-scopes"
                    error={createForm.formState.errors.scopes?.message}
                    required
                  >
                    <div className="space-y-2" id="key-scopes">
                      {API_KEY_SCOPES.map((scope) => (
                        <label
                          key={scope}
                          className="flex items-center gap-2 text-sm"
                        >
                          <Checkbox
                            checked={selectedScopes.includes(scope)}
                            onCheckedChange={(checked) =>
                              toggleScope(scope, checked === true)
                            }
                          />
                          <span className="font-mono">{scope}</span>
                        </label>
                      ))}
                    </div>
                  </FormField>
                  <DialogFooter>
                    <Button type="submit" disabled={createMutation.isPending}>
                      {createMutation.isPending ? 'Creating…' : 'Create key'}
                    </Button>
                  </DialogFooter>
                </Form>
              </DialogContent>
            </Dialog>
          ) : undefined
        }
      />

      {keysQuery.isError ? (
        <EmptyState
          icon={AlertTriangleIcon}
          title="Couldn't load API keys"
          description="Try again shortly."
        />
      ) : (
        <DataTable
          columns={columns}
          data={keysQuery.data ?? []}
          isLoading={keysQuery.isLoading}
          emptyState={<EmptyState icon={KeyRound} title="No API keys yet" />}
          rowActions={
            isOwner
              ? (key) =>
                  key.revokedAt ? null : (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setRevokeTarget(key)}
                    >
                      Revoke
                    </Button>
                  )
              : undefined
          }
        />
      )}

      <Dialog
        open={!!revealedKey}
        onOpenChange={(open) => {
          if (!open && !hasStoredKey) return; // force the confirmation below
          if (!open) setRevealedKey(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Save your API key</DialogTitle>
          </DialogHeader>
          <p className="text-fg-muted text-sm">
            This is the only time the full key is shown. Store it somewhere safe
            — you won&rsquo;t be able to see it again.
          </p>
          {revealedKey ? (
            <div className="flex items-center gap-2">
              <CodeBlock code={revealedKey} className="flex-1" />
              <Button variant="outline" onClick={() => copySecret(revealedKey)}>
                Copy
              </Button>
            </div>
          ) : null}
          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={hasStoredKey}
              onCheckedChange={(checked) => setHasStoredKey(checked === true)}
            />
            I have stored it
          </label>
          <DialogFooter>
            <Button
              disabled={!hasStoredKey}
              onClick={() => setRevealedKey(null)}
            >
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!revokeTarget}
        onOpenChange={(open) => !open && setRevokeTarget(null)}
        title={`Revoke ${revokeTarget?.name ?? 'this key'}?`}
        description="Requests using this key will start failing immediately."
        confirmLabel="Revoke"
        variant="destructive"
        isLoading={revokeMutation.isPending}
        onConfirm={() => revokeTarget && revokeMutation.mutate(revokeTarget.id)}
      />
    </div>
  );
}
