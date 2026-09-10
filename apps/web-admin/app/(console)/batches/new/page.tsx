'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { z } from 'zod';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
  Button,
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
import { AlertTriangleIcon } from 'lucide-react';
import { useAuth } from '@/lib/auth-store';
import { useTenantPath } from '@/lib/tenant-path';
import { queryKeys } from '@/lib/query';
import { ApiError } from '@/lib/api-client';
import { Form, useZodForm } from '@/lib/forms';
import { listProducts } from '@/lib/products';
import { listOems } from '@/lib/oems';
import { mintBatch, type BatchDetail } from '@/lib/batches';

const MINT_SYNC_MAX = 5000;
const MINT_MAX_COUNT = 1_000_000;
const IDEMPOTENCY_KEY_STORAGE_KEY = 'verifyng.mint-batch.idempotency-key';

const mintSchema = z.object({
  productId: z.string().min(1, 'Select a product'),
  oemId: z.string().min(1, 'Select an OEM'),
  count: z.coerce
    .number()
    .int()
    .min(1, 'Must mint at least 1 unit')
    .max(MINT_MAX_COUNT, `Cannot exceed ${MINT_MAX_COUNT.toLocaleString()}`),
});
type MintInput = z.infer<typeof mintSchema>;

function isJobModeResponse(
  body: BatchDetail | { batch: BatchDetail; jobId: string },
): body is { batch: BatchDetail; jobId: string } {
  return 'batch' in body;
}

export default function NewBatchPage() {
  const { activeTenantId } = useAuth();
  const tenantPath = useTenantPath();
  const router = useRouter();
  const { toast } = useToast();

  const productsQuery = useQuery({
    queryKey: queryKeys.products.list(activeTenantId ?? ''),
    queryFn: () => listProducts(tenantPath),
    enabled: !!activeTenantId,
  });
  const oemsQuery = useQuery({
    queryKey: queryKeys.oems.list(activeTenantId ?? ''),
    queryFn: () => listOems(tenantPath),
    enabled: !!activeTenantId,
  });

  const form = useZodForm<MintInput>(mintSchema, {
    productId: '',
    oemId: '',
    count: 20,
  });

  // Kept in sessionStorage so a refresh before the POST resolves reuses the
  // same key instead of accidentally minting a second batch.
  const [idempotencyKey] = useState(() => {
    if (typeof window === 'undefined') return crypto.randomUUID();
    const existing = window.sessionStorage.getItem(IDEMPOTENCY_KEY_STORAGE_KEY);
    if (existing) return existing;
    const generated = crypto.randomUUID();
    window.sessionStorage.setItem(IDEMPOTENCY_KEY_STORAGE_KEY, generated);
    return generated;
  });

  const count = form.watch('count');
  const willRunInBackground = Number(count) > MINT_SYNC_MAX;

  const mintMutation = useMutation({
    mutationFn: (input: MintInput) =>
      mintBatch(tenantPath, { ...input, idempotencyKey }),
    onSuccess: (result) => {
      window.sessionStorage.removeItem(IDEMPOTENCY_KEY_STORAGE_KEY);
      const batchId = isJobModeResponse(result) ? result.batch.id : result.id;
      router.push(`/batches/${batchId}`);
    },
    onError: (error: unknown) => {
      toast({
        title: error instanceof ApiError ? error.message : 'Mint failed',
        description:
          error instanceof ApiError && error.status === 402
            ? 'This tenant has reached its minting entitlement.'
            : undefined,
        variant: 'destructive',
      });
    },
  });

  const productOptions = useMemo(
    () => productsQuery.data?.filter((p) => !p.archivedAt) ?? [],
    [productsQuery.data],
  );
  const oemOptions = useMemo(
    () => oemsQuery.data?.filter((o) => o.status === 'active') ?? [],
    [oemsQuery.data],
  );

  return (
    <div className="space-y-s6 max-w-xl">
      <PageHeader
        title="Mint batch"
        description="Generate a new batch of tier-1/tier-2 unit codes."
      />

      <Form
        form={form}
        onSubmit={(values) => mintMutation.mutate(values)}
        className="space-y-s6"
      >
        <div className="border-border bg-surface p-s5 sm:p-s6 space-y-s6 rounded-md border">
          <section className="space-y-s5">
            <h2 className="text-fg-muted text-xs font-semibold tracking-wider uppercase">
              What to mint
            </h2>

            <FormField
              label="Product"
              htmlFor="mint-product"
              error={form.formState.errors.productId?.message}
              required
            >
              <Select
                onValueChange={(value) => form.setValue('productId', value)}
              >
                <SelectTrigger id="mint-product">
                  <SelectValue placeholder="Select a product" />
                </SelectTrigger>
                <SelectContent>
                  {productOptions.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.sku} — {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormField>

            <FormField
              label="OEM"
              htmlFor="mint-oem"
              error={form.formState.errors.oemId?.message}
              required
            >
              <Select onValueChange={(value) => form.setValue('oemId', value)}>
                <SelectTrigger id="mint-oem">
                  <SelectValue placeholder="Select an OEM" />
                </SelectTrigger>
                <SelectContent>
                  {oemOptions.map((o) => (
                    <SelectItem key={o.id} value={o.id}>
                      {o.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormField>
          </section>

          <section className="border-border pt-s6 space-y-s5 border-t">
            <h2 className="text-fg-muted text-xs font-semibold tracking-wider uppercase">
              How many
            </h2>

            <FormField
              label="Count"
              htmlFor="mint-count"
              error={form.formState.errors.count?.message}
              required
            >
              <Input
                id="mint-count"
                type="number"
                inputMode="numeric"
                className="font-mono"
                min={1}
                max={MINT_MAX_COUNT}
                {...form.register('count')}
              />
            </FormField>

            {willRunInBackground && (
              <div className="border-border bg-surface-sunken text-fg-muted gap-s2 p-s3 flex rounded-sm border text-sm">
                <AlertTriangleIcon className="h-4 w-4 shrink-0" />
                <span>
                  Batches over {MINT_SYNC_MAX.toLocaleString()} units run in the
                  background — you&apos;ll be redirected to the batch detail
                  page to watch progress.
                </span>
              </div>
            )}
          </section>
        </div>

        <div
          data-testid="mint-form-footer"
          className="border-border bg-surface p-s4 sticky bottom-0 z-10 rounded-md border sm:static sm:border-0 sm:bg-transparent sm:p-0"
        >
          <Button
            type="submit"
            className="w-full sm:w-auto"
            disabled={mintMutation.isPending}
          >
            {mintMutation.isPending ? 'Minting\u2026' : 'Mint batch'}
          </Button>
        </div>
      </Form>
    </div>
  );
}
