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
  reports: {
    list: (tenantId: string, filters?: string) =>
      ['reports', 'list', tenantId, filters] as const,
    summary: (tenantId: string) => ['reports', 'summary', tenantId] as const,
    detail: (tenantId: string, id: string) =>
      ['reports', 'detail', tenantId, id] as const,
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
