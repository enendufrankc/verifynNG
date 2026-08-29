import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  NotFoundException,
  Inject,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { PLATFORM_ROLE_KEY } from '../decorators/platform-role.decorator';
import { INTERNAL_ONLY_KEY } from '../decorators/internal-only.decorator';
import { TokenService } from '../services/token.service';
import { Request } from 'express';

@Injectable()
export class TenantContextGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private tokenService: TokenService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
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
    const authHeader = request.headers.authorization;

    // Check for ApiClient bearer token (vk_ prefix)
    if (authHeader?.startsWith('Bearer vk_')) {
      throw new UnauthorizedException();
    }

    if (!authHeader?.startsWith('Bearer ')) {
      throw new UnauthorizedException();
    }

    const token = authHeader.slice(7);
    let decoded: any;
    try {
      decoded = this.tokenService.verifyAccessToken(token);
    } catch {
      throw new UnauthorizedException();
    }

    // Validate session is not revoked
    if (decoded.sid) {
      const session = await this.tokenService['prisma'].session.findUnique({
        where: { id: decoded.sid },
      });
      if (session?.revokedAt) {
        throw new UnauthorizedException();
      }
    }

    (request as any).user = decoded;
    (request as any).tenantId = decoded.tid;

    // 404 rule: if route has :tenantId param and it doesn't match claims.tid
    // Exception: @PlatformRole routes where :tenantId is authoritative
    const platformRole = this.reflector.getAllAndOverride<string>(
      PLATFORM_ROLE_KEY,
      [context.getHandler(), context.getClass()],
    );

    const routeTenantId = request.params?.['tenantId'];
    if (routeTenantId && routeTenantId !== decoded.tid) {
      if (platformRole) {
        // For platform role, route param is authoritative
        (request as any).tenantId = routeTenantId;
      } else {
        // Never confirm another tenant exists → 404
        throw new NotFoundException();
      }
    }

    return true;
  }
}
