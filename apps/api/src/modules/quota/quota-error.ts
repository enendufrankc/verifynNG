/**
 * QuotaExceededError — thrown when a tenant exceeds a quota.
 * Caught by QuotaExceededFilter which returns HTTP 429 with Retry-After.
 */

export class QuotaExceededError extends Error {
  constructor(
    public readonly tenantId: string,
    public readonly kind: string,
    public readonly limit: number,
    public readonly used: number,
    public readonly resetsAt: Date,
    public readonly key?: string,
  ) {
    super(
      `Quota exceeded: ${kind} for tenant ${tenantId} (${used}/${limit})`,
    );
    this.name = 'QuotaExceededError';
  }
}
