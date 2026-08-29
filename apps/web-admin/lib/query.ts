import { useInfiniteQuery } from '@tanstack/react-query';

export const queryKeys = {
  team: {
    list: (tenantId: string) => ['team', 'list', tenantId] as const,
    detail: (tenantId: string, userId: string) =>
      ['team', 'detail', tenantId, userId] as const,
  },
  settings: {
    security: (tenantId: string) =>
      ['settings', 'security', tenantId] as const,
    sessions: (tenantId: string) =>
      ['settings', 'sessions', tenantId] as const,
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
