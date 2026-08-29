import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { PLATFORM_ROLE_KEY } from '../decorators/platform-role.decorator';
import { INTERNAL_ONLY_KEY } from '../decorators/internal-only.decorator';
import { isApiClientPrincipal } from '../types/principal';

const ROLE_HIERARCHY: Record<string, string[]> = {
  owner: ['owner', 'operator', 'viewer'],
  operator: ['operator', 'viewer'],
  viewer: ['viewer'],
};

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    // Skip if @InternalOnly — handled by its own guard
    const isInternal = this.reflector.getAllAndOverride(INTERNAL_ONLY_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isInternal !== undefined) return true;

    const request = context.switchToHttp().getRequest<Request>();
    const user = request.user;

    // Dedicated support-only routes (e.g. /internal/api-clients): only the
    // platform role matters, tenant membership is irrelevant.
    const platformRole = this.reflector.getAllAndOverride<string>(
      PLATFORM_ROLE_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (platformRole) {
      if (
        !user ||
        isApiClientPrincipal(user) ||
        user.platformRole !== platformRole
      ) {
        throw new ForbiddenException();
      }
      return true;
    }

    // Check tenant role hierarchy
    const requiredRoles = this.reflector.getAllAndOverride<string[]>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!requiredRoles || requiredRoles.length === 0) return true;

    if (!user || isApiClientPrincipal(user)) return false;

    // Platform support role bypasses ordinary tenant-role checks — TenantContextGuard
    // has already made the route's :tenantId param authoritative for this request.
    if (user.platformRole === 'support') return true;

    const allowedRoles = ROLE_HIERARCHY[user.role] ?? [user.role];
    const hasRole = requiredRoles.some((r) => allowedRoles.includes(r));
    if (!hasRole) {
      throw new ForbiddenException();
    }
    return true;
  }
}
