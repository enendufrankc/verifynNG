import { useInfiniteQuery } from '@tanstack/react-query';

export const queryKeys = {
  team: {
    list: (tenantId: string) => ['team', 'list', tenantId] as const,
    detail: (tenantId: string, userId: string) =>
      ['team', 'detail', tenantId, userId] as const,
  },
  settings: {
    security: (tenantId: string) => ['settings', 'security', tenantId] as const,
    sessions: (tenantId: string) => ['settings', 'sessions', tenantId] as const,
  },
  products: {
    list: (tenantId: string) => ['products', 'list', tenantId] as const,
  },
  oems: {
    list: (tenantId: string) => ['oems', 'list', tenantId] as const,
  },
  batches: {
    list: (tenantId: string) => ['batches', 'list', tenantId] as const,
    detail: (tenantId: string, batchId: string) =>
      ['batches', 'detail', tenantId, batchId] as const,
    units: (tenantId: string, batchId: string) =>
      ['batches', 'units', tenantId, batchId] as const,
    job: (tenantId: string, jobId: string) =>
      ['batches', 'job', tenantId, jobId] as const,
  },
  deliveries: {
    list: (tenantId: string) => ['deliveries', 'list', tenantId] as const,
    forBatch: (tenantId: string, batchId: string) =>
      ['deliveries', 'for-batch', tenantId, batchId] as const,
    detail: (tenantId: string, deliveryId: string) =>
      ['deliveries', 'detail', tenantId, deliveryId] as const,
    receiptsForBatch: (tenantId: string, batchId: string) =>
      ['deliveries', 'receipts', tenantId, batchId] as const,
  },
  oemPortal: {
    list: () => ['oem-portal', 'list'] as const,
    detail: (deliveryId: string) =>
      ['oem-portal', 'detail', deliveryId] as const,
  },
};

export function usePagedQuery<TItem>(
  key: readonly unknown[],
  fetcher: (cursor?: string) => Promise<{
    items: TItem[];
    nextCursor?: string;
  }>,
) {
  return useInfiniteQuery({
    queryKey: key,
    queryFn: ({ pageParam }) => fetcher(pageParam as string | undefined),
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    initialPageParam: undefined as string | undefined,
  });
}
