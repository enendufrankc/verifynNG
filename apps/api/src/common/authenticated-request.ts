import type { Request } from 'express';

/**
 * Request with E02's principal attached by TenantContextGuard, typed loosely so
 * E13 code can read `userId`/`tenantId`/`platformRole` without narrowing the
 * UserPrincipal | ApiClientPrincipal union at every call site.
 */
export type AuthenticatedRequest = Omit<Request, 'user'> & {
  user?: {
    userId?: string;
    /** @deprecated use userId */
    id?: string;
    tenantId?: string | null;
    role?: string;
    platformRole?: string;
  };
};
