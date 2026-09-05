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
  apiKeys: {
    list: (tenantId: string) => ['api-keys', 'list', tenantId] as const,
  },
  webhooks: {
    list: (tenantId: string) => ['webhooks', 'list', tenantId] as const,
    deliveries: (tenantId: string, endpointId: string, status?: string) =>
      ['webhooks', 'deliveries', tenantId, endpointId, status] as const,
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
  billing: {
    plans: () => ['billing', 'plans'] as const,
    subscription: (tenantId: string) =>
      ['billing', 'subscription', tenantId] as const,
    status: (tenantId: string) => ['billing', 'status', tenantId] as const,
    usageVsPlan: (tenantId: string) =>
      ['billing', 'usage-vs-plan', tenantId] as const,
    changePlanPreview: (tenantId: string, planCode: string) =>
      ['billing', 'change-plan-preview', tenantId, planCode] as const,
    invoices: (tenantId: string) => ['billing', 'invoices', tenantId] as const,
    invoice: (tenantId: string, invoiceId: string) =>
      ['billing', 'invoice', tenantId, invoiceId] as const,
    paymentMethods: (tenantId: string) =>
      ['billing', 'payment-methods', tenantId] as const,
    platformSubscriptions: (filters: string) =>
      ['billing', 'platform-subscriptions', filters] as const,
    supportInvoices: (tenantId: string) =>
      ['billing', 'support-invoices', tenantId] as const,
  },
  analytics: {
    overview: (tenantId: string, range: string) =>
      ['analytics', 'overview', tenantId, range] as const,
    verdicts: (tenantId: string, range: string) =>
      ['analytics', 'verdicts', tenantId, range] as const,
    batches: (tenantId: string, range: string) =>
      ['analytics', 'batches', tenantId, range] as const,
    products: (tenantId: string, range: string) =>
      ['analytics', 'products', tenantId, range] as const,
    geo: (tenantId: string, range: string, groupBy: string) =>
      ['analytics', 'geo', tenantId, range, groupBy] as const,
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
