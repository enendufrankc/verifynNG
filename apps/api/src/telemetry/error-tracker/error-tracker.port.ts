export const ERROR_TRACKER = 'ERROR_TRACKER';

export interface ErrorTrackerContext {
  requestId?: string;
  tenantId?: string;
  userId?: string;
  extra?: Record<string, unknown>;
}

export interface ErrorTrackerPort {
  captureException(error: Error | unknown, ctx?: ErrorTrackerContext): void;
  captureMessage(
    message: string,
    level?: 'info' | 'warning' | 'error',
    ctx?: ErrorTrackerContext,
  ): void;
  setUser(userId: string): void;
  setTenant(tenantId: string): void;
}
