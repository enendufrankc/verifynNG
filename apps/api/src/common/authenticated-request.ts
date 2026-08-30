import type { Request } from 'express';

/** Request with E02's principal attached by TenantContextGuard. */
export interface AuthenticatedRequest extends Request {
  user?: {
    userId?: string;
    /** @deprecated use userId */
    id?: string;
    tenantId?: string;
    role?: string;
    platformRole?: string;
  };
}
