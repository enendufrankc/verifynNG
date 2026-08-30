import type { Principal, ApiClientPrincipal } from './principal';

declare global {
  namespace Express {
    interface Request {
      user?: Principal;
      tenantId?: string;
      apiClient?: ApiClientPrincipal;
    }
  }
}
