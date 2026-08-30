'use client';

import { useState } from 'react';
import { z } from 'zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import {
  Badge,
  Button,
  ConfirmDialog,
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
import { PackageIcon, PlusIcon, AlertTriangleIcon } from 'lucide-react';
import { useAuth } from '@/lib/auth-store';
import { useTenantPath } from '@/lib/tenant-path';
import { queryKeys } from '@/lib/query';
import { ApiError } from '@/lib/api-client';
import { Form, setServerErrors, useZodForm } from '@/lib/forms';
import {
  archiveProduct,
  createProduct,
  listProducts,
  updateProduct,
  validateGtin,
  type Product,
} from '@/lib/products';

const productSchema = z.object({
  sku: z.string().min(1, 'SKU is required'),
  name: z.string().min(1, 'Name is required'),
  gtin: z
    .string()
    .optional()
    .refine((v) => !v || validateGtin(v), 'Invalid GTIN check digit'),
});
type ProductInput = z.infer<typeof productSchema>;

export default function ProductsPage() {
  const { activeTenantId, role } = useAuth();
  const tenantPath = useTenantPath();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const canWrite = role === 'operator' || role === 'owner';
  const isOwner = role === 'owner';

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [archiveTarget, setArchiveTarget] = useState<Product | null>(null);

  const productsQuery = useQuery({
    queryKey: queryKeys.products.list(activeTenantId ?? ''),
    queryFn: () => listProducts(tenantPath),
    enabled: !!activeTenantId,
  });

  const form = useZodForm<ProductInput>(productSchema, {
    sku: '',
    name: '',
    gtin: '',
  });

  function openCreate() {
    setEditing(null);
    form.reset({ sku: '', name: '', gtin: '' });
    setDialogOpen(true);
  }

  function openEdit(product: Product) {
    setEditing(product);
    form.reset({
      sku: product.sku,
      name: product.name,
      gtin: product.gtin ?? '',
    });
    setDialogOpen(true);
  }

  const saveMutation = useMutation({
    mutationFn: (input: ProductInput) => {
      const payload = { ...input, gtin: input.gtin || undefined };
      return editing
        ? updateProduct(tenantPath, editing.id, payload)
        : createProduct(tenantPath, payload);
    },
    onSuccess: () => {
      toast({ title: editing ? 'Product updated' : 'Product created' });
      setDialogOpen(false);
      queryClient.invalidateQueries({
        queryKey: queryKeys.products.list(activeTenantId ?? ''),
      });
    },
    onError: (error: unknown) => {
      setServerErrors(form, error);
      if (error instanceof ApiError && !error.details?.length) {
        toast({ title: error.message, variant: 'destructive' });
      }
    },
  });

  const archiveMutation = useMutation({
    mutationFn: (productId: string) => archiveProduct(tenantPath, productId),
    onSuccess: () => {
      setArchiveTarget(null);
      queryClient.invalidateQueries({
        queryKey: queryKeys.products.list(activeTenantId ?? ''),
      });
    },
    onError: (error: unknown) => {
      toast({
        title: error instanceof ApiError ? error.message : 'Archive failed',
        variant: 'destructive',
      });
    },
  });

  const gtinValue = form.watch('gtin');
  const gtinLive =
    !gtinValue || validateGtin(gtinValue) ? null : 'Invalid GTIN check digit';

  const columns: ColumnDef<Product>[] = [
    { accessorKey: 'sku', header: 'SKU' },
    { accessorKey: 'name', header: 'Name' },
    {
      accessorKey: 'gtin',
      header: 'GTIN',
      cell: ({ row }) => row.original.gtin ?? '—',
    },
    {
      id: 'status',
      header: 'Status',
      cell: ({ row }) =>
        row.original.archivedAt ? (
          <Badge variant="secondary">Archived</Badge>
        ) : (
          <Badge>Active</Badge>
        ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Products"
        description="Catalog products this tenant mints batches for."
        actions={
          canWrite ? (
            <Button onClick={openCreate}>
              <PlusIcon className="mr-2 h-4 w-4" />
              New product
            </Button>
          ) : undefined
        }
      />

      {productsQuery.isError ? (
        <EmptyState
          icon={AlertTriangleIcon}
          title="Couldn't load products"
          description="The catalog service isn't reachable yet."
        />
      ) : (
        <DataTable
          columns={columns}
          data={productsQuery.data ?? []}
          isLoading={productsQuery.isLoading}
          emptyState={<EmptyState icon={PackageIcon} title="No products yet" />}
          rowActions={
            canWrite
              ? (product) => (
                  <div className="flex gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => openEdit(product)}
                    >
                      Edit
                    </Button>
                    {isOwner && !product.archivedAt && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setArchiveTarget(product)}
                      >
                        Archive
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
            <DialogTitle>
              {editing ? 'Edit product' : 'New product'}
            </DialogTitle>
          </DialogHeader>
          <Form
            form={form}
            onSubmit={(values) => saveMutation.mutate(values)}
            className="space-y-4"
          >
            <FormField
              label="SKU"
              htmlFor="product-sku"
              error={form.formState.errors.sku?.message}
              required
            >
              <Input id="product-sku" {...form.register('sku')} />
            </FormField>
            <FormField
              label="Name"
              htmlFor="product-name"
              error={form.formState.errors.name?.message}
              required
            >
              <Input id="product-name" {...form.register('name')} />
            </FormField>
            <FormField
              label="GTIN"
              htmlFor="product-gtin"
              error={gtinLive ?? form.formState.errors.gtin?.message}
            >
              <Input
                id="product-gtin"
                inputMode="numeric"
                placeholder="8, 12, 13 or 14 digits"
                {...form.register('gtin')}
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

      <ConfirmDialog
        open={!!archiveTarget}
        onOpenChange={(open) => !open && setArchiveTarget(null)}
        title={`Archive ${archiveTarget?.name ?? 'product'}?`}
        description="Archived products can no longer be minted into new batches."
        confirmLabel="Archive"
        variant="destructive"
        isLoading={archiveMutation.isPending}
        onConfirm={() =>
          archiveTarget && archiveMutation.mutate(archiveTarget.id)
        }
      />
    </div>
  );
}
