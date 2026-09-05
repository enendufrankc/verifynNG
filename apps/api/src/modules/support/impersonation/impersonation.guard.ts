import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { PLATFORM_ROLE_KEY } from '../../auth/decorators/platform-role.decorator';
import { IS_PUBLIC_KEY } from '../../auth/decorators/public.decorator';
import { ROLES_KEY } from '../../auth/decorators/roles.decorator';
import type { UserPrincipal } from '../../auth/types/principal';
import { isApiClientPrincipal } from '../../auth/types/principal';
import { ImpersonationService } from './impersonation.service';

// Mirrors RolesGuard's own ROLE_HIERARCHY (apps/api/src/modules/auth/guards/
// roles.guard.ts) — not exported there, so duplicated rather than reaching
// into another epic's file for a private const.
const ROLE_HIERARCHY: Record<string, string[]> = {
  owner: ['owner', 'operator', 'viewer'],
  operator: ['operator', 'viewer'],
  viewer: ['viewer'],
};

export type RequestWithImpersonation = Request & {
  tenantId?: string;
  impersonation?: {
    id: string;
    supportUserId: string;
    supportEmail: string;
    mode: 'read' | 'write';
  };
};

/**
 * A platformRole=support principal can already read any tenant's data via
 * ordinary tenant routes by design (see TenantContextGuard's `isSupport`
 * branch and RolesGuard's `platformRole === 'support'` bypass —
 * apps/api/src/modules/metering/usage.controller.ts documents relying on
 * exactly this for its own cross-tenant summary read). That's the platform
 * oversight model, not impersonation, and this guard leaves it alone.
 *
 * What it *is* is the enforcement point the epic goal names ("the first
 * impersonation is a shared password"): the same bypass currently also lets
 * support MUTATE any tenant's data, unaudited, with no expiry. So every
 * non-GET request on an ordinary tenant route (not a @PlatformRole() route)
 * from a support principal now requires an active *write*-mode
 * ImpersonationSession for that (support user, tenant) pair — no session, or
 * a read-mode session, both 403 with `impersonation_read_only` (matches
 * AC2's documented toast/response exactly). A GET also tags the request with
 * the active session (if any) so AuditInterceptor can stamp `impersonatedBy`
 * on anything audited during it, but never blocks a GET itself.
 */
@Injectable()
export class ImpersonationGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly impersonationService: ImpersonationService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    // Platform-admin routes (/v1/platform/**) are not "acting as a tenant" —
    // support's own platformRole gate already covers those.
    const platformRole = this.reflector.getAllAndOverride<string>(
      PLATFORM_ROLE_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (platformRole) return true;

    const req = context.switchToHttp().getRequest<RequestWithImpersonation>();
    const user = req.user as UserPrincipal | undefined;
    if (
      !user ||
      isApiClientPrincipal(user) ||
      user.platformRole !== 'support'
    ) {
      return true;
    }

    const tenantId = req.tenantId;
    if (!tenantId) return true;

    const active = await this.impersonationService.resolveActiveFor(
      user.userId,
      tenantId,
    );
    if (active) {
      req.impersonation = {
        id: active.id,
        supportUserId: active.supportUserId,
        supportEmail: active.supportEmail,
        mode: active.mode,
      };
    }

    if (req.method === 'GET') return true;

    if (!active || active.mode !== 'write') {
      throw new ForbiddenException({ error: 'impersonation_read_only' });
    }

    // RolesGuard's own `platformRole === 'support'` branch bypasses @Roles()
    // entirely (see its comment), so a write-mode session's role='operator'
    // JWT claim would otherwise still reach an owner-only route uninterrupted.
    // "Impersonation never grants owner" (docs/support-impersonation-policy.md)
    // is enforced here instead, against the granted 'operator' ceiling.
    const requiredRoles = this.reflector.getAllAndOverride<string[]>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (requiredRoles?.length) {
      const allowed = ROLE_HIERARCHY['operator'];
      if (!requiredRoles.some((r) => allowed.includes(r))) {
        throw new ForbiddenException({ error: 'impersonation_owner_only' });
      }
    }

    return true;
  }
}
