import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { PLATFORM_ROLE_KEY } from '../decorators/platform-role.decorator';
import { INTERNAL_ONLY_KEY } from '../decorators/internal-only.decorator';

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

    // Check platform role first
    const platformRole = this.reflector.getAllAndOverride<string>(
      PLATFORM_ROLE_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (platformRole) {
      const request = context.switchToHttp().getRequest();
      const user = request.user;
      if (!user || user.platformRole !== platformRole) {
        throw new ForbiddenException();
      }
      return true;
    }

    // Check tenant role hierarchy
    const requiredRoles = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!requiredRoles || requiredRoles.length === 0) return true;

    const request = context.switchToHttp().getRequest();
    const user = request.user;
    if (!user) return false;

    const userRole = user.role;
    const allowedRoles = ROLE_HIERARCHY[userRole] ?? [userRole];
    const hasRole = requiredRoles.some((r) => allowedRoles.includes(r));
    if (!hasRole) {
      throw new ForbiddenException();
    }
    return true;
  }
}
