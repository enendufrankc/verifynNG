'use client';

import { useState } from 'react';
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
import { FileTextIcon, PlusIcon } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-store';
import { useTenantPath } from '@/lib/tenant-path';
import { apiClient, ApiError } from '@/lib/api-client';
import { listProducts } from '@/lib/products';
import {
  createProductPage,
  listProductPages,
  type ProductPage,
} from '@/lib/product-pages';

export default function ProductPagesListPage() {
  const { role, activeTenantId } = useAuth();
  const tenantPath = useTenantPath();
  const canWrite = role === 'operator' || role === 'owner';
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const router = useRouter();

  const tenantQuery = useQuery({
    queryKey: ['tenant', activeTenantId],
    queryFn: () =>
      apiClient.get<{ slug: string }>(`/tenants/${activeTenantId}`),
    enabled: !!activeTenantId,
  });

  const [dialogOpen, setDialogOpen] = useState(false);
  const [productId, setProductId] = useState('');
  const [slug, setSlug] = useState('');

  const pagesQuery = useQuery({
    queryKey: ['product-pages'],
    queryFn: listProductPages,
  });

  const productsQuery = useQuery({
    queryKey: ['products-for-page-create'],
    queryFn: () => listProducts(tenantPath),
    enabled: dialogOpen,
  });

  const productNameById = new Map(
    (productsQuery.data ?? []).map((p) => [p.id, `${p.name} (${p.sku})`]),
  );

  const createMutation = useMutation({
    mutationFn: () => createProductPage({ productId, slug }),
    onSuccess: (page) => {
      setDialogOpen(false);
      queryClient.invalidateQueries({ queryKey: ['product-pages'] });
      router.push(`/pages/${page.id}`);
    },
    onError: (error: unknown) => {
      toast({
        title:
          error instanceof ApiError ? error.message : 'Could not create page',
        variant: 'destructive',
      });
    },
  });

  const columns: ColumnDef<ProductPage>[] = [
    {
      accessorKey: 'slug',
      header: 'Slug',
      cell: ({ row }) => (
        <Link
          href={`/pages/${row.original.id}`}
          className="text-brand-text underline"
        >
          {row.original.slug}
        </Link>
      ),
    },
    {
      accessorKey: 'productId',
      header: 'Product',
      cell: ({ row }) =>
        productNameById.get(row.original.productId) ?? row.original.productId,
    },
    {
      accessorKey: 'status',
      header: 'Status',
      cell: ({ row }) => (
        <Badge
          variant={
            row.original.status === 'published' ? 'default' : 'secondary'
          }
        >
          {row.original.status}
        </Badge>
      ),
    },
    {
      accessorKey: 'publishedAt',
      header: 'Last published',
      cell: ({ row }) =>
        row.original.publishedAt
          ? new Date(row.original.publishedAt).toLocaleString()
          : '—',
    },
    {
      id: 'view',
      header: '',
      cell: ({ row }) =>
        row.original.status === 'published' ? (
          <a
            href={`${process.env.NEXT_PUBLIC_VERIFY_URL ?? ''}/p/${tenantQuery.data?.slug}/${row.original.slug}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-brand-text text-sm underline"
          >
            View
          </a>
        ) : null,
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Pages"
        description="Product pages tenants build from typed blocks and publish to /p/**."
        actions={
          canWrite ? (
            <Button onClick={() => setDialogOpen(true)}>
              <PlusIcon className="mr-2 h-4 w-4" />
              Create page
            </Button>
          ) : undefined
        }
      />

      <DataTable
        columns={columns}
        data={pagesQuery.data ?? []}
        isLoading={pagesQuery.isLoading}
        emptyState={
          <EmptyState icon={FileTextIcon} title="No product pages yet" />
        }
      />

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create a product page</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <FormField label="Product" required>
              <select
                className="border-border w-full rounded-md border px-3 py-2 text-sm"
                value={productId}
                onChange={(e) => setProductId(e.target.value)}
              >
                <option value="">Select a product…</option>
                {(productsQuery.data ?? []).map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.sku})
                  </option>
                ))}
              </select>
            </FormField>
            <FormField
              label="URL slug"
              required
              description="e.g. turmeric-curcumin"
            >
              <Input value={slug} onChange={(e) => setSlug(e.target.value)} />
            </FormField>
          </div>
          <DialogFooter>
            <Button
              type="button"
              disabled={!productId || !slug || createMutation.isPending}
              onClick={() => createMutation.mutate()}
            >
              {createMutation.isPending ? 'Creating…' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
