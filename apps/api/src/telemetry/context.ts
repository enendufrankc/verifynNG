import { AsyncLocalStorage } from 'async_hooks';

export interface RequestContext {
  requestId: string;
  tenantId?: string;
  userId?: string;
  traceId?: string;
  spanId?: string;
}

const storage = new AsyncLocalStorage<RequestContext>();

export function getContext(): RequestContext | undefined {
  return storage.getStore();
}

export function runWithContext<T>(ctx: RequestContext, fn: () => T): T {
  return storage.run(ctx, fn);
}

export function withJobContext<T>(
  job: { id?: string; name?: string; data?: Record<string, unknown> },
  fn: () => T | Promise<T>,
): T | Promise<T> {
  const ctx: RequestContext = {
    requestId:
      (job.data?.requestId as string) ||
      job.id ||
      `job-${job.name || 'unknown'}-${Date.now()}`,
    tenantId: job.data?.tenantId as string | undefined,
    userId: job.data?.userId as string | undefined,
    traceId: job.data?.traceId as string | undefined,
  };
  return storage.run(ctx, fn);
}
