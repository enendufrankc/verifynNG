'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import {
  Badge,
  Button,
  ConfirmDialog,
  DataTable,
  EmptyState,
  PageHeader,
  useToast,
} from '@verifyng/ui';
import { CreditCardIcon } from 'lucide-react';
import { useAuth } from '@/lib/auth-store';
import { useTenantPath } from '@/lib/tenant-path';
import { queryKeys } from '@/lib/query';
import { ApiError } from '@/lib/api-client';
import {
  listPaymentMethods,
  removePaymentMethod,
  type PaymentMethod,
} from '@/lib/billing';

export default function PaymentMethodsPage() {
  const { activeTenantId } = useAuth();
  const tenantPath = useTenantPath();
  const tenantId = activeTenantId ?? '';
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [removeTarget, setRemoveTarget] = useState<PaymentMethod | null>(null);

  const methodsQuery = useQuery({
    queryKey: queryKeys.billing.paymentMethods(tenantId),
    queryFn: () => listPaymentMethods(tenantPath),
    enabled: !!tenantId,
  });

  const removeMutation = useMutation({
    mutationFn: (id: string) => removePaymentMethod(tenantPath, id),
    onSuccess: () => {
      setRemoveTarget(null);
      queryClient.invalidateQueries({
        queryKey: queryKeys.billing.paymentMethods(tenantId),
      });
    },
    onError: (error: unknown) => {
      toast({
        title:
          error instanceof ApiError ? error.message : 'Could not remove card',
        variant: 'destructive',
      });
    },
  });

  const columns: ColumnDef<PaymentMethod>[] = [
    {
      accessorKey: 'cardBrand',
      header: 'Card',
      cell: ({ row }) =>
        `${row.original.cardBrand ?? row.original.provider} •••• ${row.original.cardLast4 ?? '----'}`,
    },
    {
      accessorKey: 'expMonth',
      header: 'Expires',
      cell: ({ row }) =>
        row.original.expMonth && row.original.expYear
          ? `${String(row.original.expMonth).padStart(2, '0')}/${row.original.expYear}`
          : '—',
    },
    {
      accessorKey: 'isDefault',
      header: 'Default',
      cell: ({ row }) =>
        row.original.isDefault ? <Badge>Default</Badge> : null,
    },
    {
      accessorKey: 'createdAt',
      header: 'Added',
      cell: ({ row }) => new Date(row.original.createdAt).toLocaleDateString(),
    },
  ];

  return (
    <div className="space-y-s6">
      <PageHeader
        title="Payment methods"
        description="Cards saved from a successful checkout. The first card saved becomes the default used for recurring and retry charges."
        actions={
          <Button variant="outline" asChild>
            <Link href="/billing">Back to overview</Link>
          </Button>
        }
      />

      <DataTable
        columns={columns}
        data={methodsQuery.data ?? []}
        isLoading={methodsQuery.isLoading}
        emptyState={
          <EmptyState
            icon={CreditCardIcon}
            title="No payment methods yet"
            description="A card is saved automatically the first time an invoice is paid through checkout."
            action={
              <Button asChild>
                <Link href="/billing/invoices">View invoices</Link>
              </Button>
            }
          />
        }
        rowActions={(method) => (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setRemoveTarget(method)}
          >
            Remove
          </Button>
        )}
      />

      <ConfirmDialog
        open={!!removeTarget}
        onOpenChange={(open) => !open && setRemoveTarget(null)}
        title="Remove this card?"
        description="Future recurring and retry charges won't be able to use it. This can't be undone."
        confirmLabel="Remove"
        variant="destructive"
        isLoading={removeMutation.isPending}
        onConfirm={() => removeTarget && removeMutation.mutate(removeTarget.id)}
      />
    </div>
  );
}
