'use client';

import { useState } from 'react';
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
  useToast,
} from '@verifyng/ui';
import { FactoryIcon, PlusIcon, AlertTriangleIcon } from 'lucide-react';
import { useAuth } from '@/lib/auth-store';
import { useTenantPath } from '@/lib/tenant-path';
import { queryKeys } from '@/lib/query';
import { ApiError } from '@/lib/api-client';
import { Form, setServerErrors, useZodForm } from '@/lib/forms';
import {
  createOem,
  listOems,
  setOemStatus,
  updateOem,
  type Oem,
} from '@/lib/oems';

const oemSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  country: z.string().optional(),
  contactName: z.string().optional(),
  contactEmail: z.string().email('Invalid email').optional().or(z.literal('')),
  contactPhone: z.string().optional(),
});
type OemInput = z.infer<typeof oemSchema>;

export default function OemsPage() {
  const { activeTenantId, role } = useAuth();
  const tenantPath = useTenantPath();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const canWrite = role === 'operator' || role === 'owner';
  const isOwner = role === 'owner';

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Oem | null>(null);

  const oemsQuery = useQuery({
    queryKey: queryKeys.oems.list(activeTenantId ?? ''),
    queryFn: () => listOems(tenantPath),
    enabled: !!activeTenantId,
  });

  const form = useZodForm<OemInput>(oemSchema, {
    name: '',
    country: '',
    contactName: '',
    contactEmail: '',
    contactPhone: '',
  });

  function openCreate() {
    setEditing(null);
    form.reset({
      name: '',
      country: '',
      contactName: '',
      contactEmail: '',
      contactPhone: '',
    });
    setDialogOpen(true);
  }

  function openEdit(oem: Oem) {
    setEditing(oem);
    form.reset({
      name: oem.name,
      country: oem.country ?? '',
      contactName: oem.contactName ?? '',
      contactEmail: oem.contactEmail ?? '',
      contactPhone: oem.contactPhone ?? '',
    });
    setDialogOpen(true);
  }

  const invalidateList = () =>
    queryClient.invalidateQueries({
      queryKey: queryKeys.oems.list(activeTenantId ?? ''),
    });

  const saveMutation = useMutation({
    mutationFn: (input: OemInput) => {
      const payload = {
        ...input,
        country: input.country || undefined,
        contactName: input.contactName || undefined,
        contactEmail: input.contactEmail || undefined,
        contactPhone: input.contactPhone || undefined,
      };
      return editing
        ? updateOem(tenantPath, editing.id, payload)
        : createOem(tenantPath, payload);
    },
    onSuccess: () => {
      toast({ title: editing ? 'OEM updated' : 'OEM created' });
      setDialogOpen(false);
      invalidateList();
    },
    onError: (error: unknown) => {
      setServerErrors(form, error);
      if (error instanceof ApiError && !error.details?.length) {
        toast({ title: error.message, variant: 'destructive' });
      }
    },
  });

  const statusMutation = useMutation({
    mutationFn: ({
      oemId,
      status,
    }: {
      oemId: string;
      status: 'active' | 'suspended';
    }) => setOemStatus(tenantPath, oemId, status),
    onSuccess: invalidateList,
    onError: (error: unknown) => {
      toast({
        title:
          error instanceof ApiError ? error.message : 'Status change failed',
        variant: 'destructive',
      });
    },
  });

  const columns: ColumnDef<Oem>[] = [
    { accessorKey: 'name', header: 'Name' },
    {
      accessorKey: 'country',
      header: 'Country',
      cell: ({ row }) => row.original.country ?? '—',
    },
    {
      accessorKey: 'contactEmail',
      header: 'Contact',
      cell: ({ row }) => row.original.contactEmail ?? '—',
    },
    {
      accessorKey: 'status',
      header: 'Status',
      cell: ({ row }) => (
        <Badge
          variant={row.original.status === 'active' ? 'default' : 'secondary'}
        >
          {row.original.status === 'active' ? 'Active' : 'Suspended'}
        </Badge>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="OEMs"
        description="Registered manufacturers batches are delivered to."
        actions={
          canWrite ? (
            <Button onClick={openCreate}>
              <PlusIcon className="mr-2 h-4 w-4" />
              New OEM
            </Button>
          ) : undefined
        }
      />

      {oemsQuery.isError ? (
        <EmptyState
          icon={AlertTriangleIcon}
          title="Couldn't load OEMs"
          description="The catalog service isn't reachable yet."
        />
      ) : (
        <DataTable
          columns={columns}
          data={oemsQuery.data ?? []}
          isLoading={oemsQuery.isLoading}
          emptyState={<EmptyState icon={FactoryIcon} title="No OEMs yet" />}
          rowActions={
            canWrite
              ? (oem) => (
                  <div className="flex gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => openEdit(oem)}
                    >
                      Edit
                    </Button>
                    {isOwner && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          statusMutation.mutate({
                            oemId: oem.id,
                            status:
                              oem.status === 'active' ? 'suspended' : 'active',
                          })
                        }
                      >
                        {oem.status === 'active' ? 'Suspend' : 'Reactivate'}
                      </Button>
                    )}
                  </div>
                )
              : undefined
          }
        />
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit OEM' : 'New OEM'}</DialogTitle>
          </DialogHeader>
          <Form
            form={form}
            onSubmit={(values) => saveMutation.mutate(values)}
            className="space-y-4"
          >
            <FormField
              label="Name"
              htmlFor="oem-name"
              error={form.formState.errors.name?.message}
              required
            >
              <Input id="oem-name" {...form.register('name')} />
            </FormField>
            <FormField label="Country" htmlFor="oem-country">
              <Input id="oem-country" {...form.register('country')} />
            </FormField>
            <FormField label="Contact name" htmlFor="oem-contact-name">
              <Input id="oem-contact-name" {...form.register('contactName')} />
            </FormField>
            <FormField
              label="Contact email"
              htmlFor="oem-contact-email"
              error={form.formState.errors.contactEmail?.message}
            >
              <Input
                id="oem-contact-email"
                type="email"
                {...form.register('contactEmail')}
              />
            </FormField>
            <FormField label="Contact phone" htmlFor="oem-contact-phone">
              <Input
                id="oem-contact-phone"
                {...form.register('contactPhone')}
              />
            </FormField>
            <DialogFooter>
              <Button type="submit" disabled={saveMutation.isPending}>
                {saveMutation.isPending ? 'Saving…' : 'Save'}
              </Button>
            </DialogFooter>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
