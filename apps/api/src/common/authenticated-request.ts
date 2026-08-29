import type { Request } from 'express';

/**
 * Request shape once E02 attaches req.user. Until then, user is undefined
 * and callers fall back to placeholder tenant/actor values.
 */
export interface AuthenticatedRequest extends Request {
  user?: {
    id?: string;
    tenantId?: string;
    role?: string;
  };
}
