import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import type { Principal as AuthPrincipal } from '../modules/auth/types/principal';
import { isApiClientPrincipal } from '../modules/auth/types/principal';

/** E03's view of the caller, derived from E02's authenticated principal. */
export interface Principal {
  userId: string;
  email?: string;
  tenantId?: string;
  role: string;
  platformRole?: string;
}

export type PrincipalRequest = Request & { principal?: Principal };

/**
 * Adapts E02's `req.user` (set by TenantContextGuard) into `req.principal` for
 * E03's TenantStatusGuard and controllers. Never reads request headers.
 */
@Injectable()
export class PrincipalAdapterGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<PrincipalRequest>();
    const user = (req as Request & { user?: AuthPrincipal }).user;
    if (user && !isApiClientPrincipal(user)) {
      req.principal = {
        userId: user.userId,
        tenantId: user.tenantId || undefined,
        role: user.role,
        platformRole: user.platformRole,
      };
    }
    return true;
  }
}
