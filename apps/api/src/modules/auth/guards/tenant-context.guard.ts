import {
  Injectable,
  CanActivate,
  ExecutionContext,
  Logger,
  UnauthorizedException,
  NotFoundException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { Request } from 'express';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { PLATFORM_ROLE_KEY } from '../decorators/platform-role.decorator';
import { INTERNAL_ONLY_KEY } from '../decorators/internal-only.decorator';
import { TokenService } from '../services/token.service';
import type { UserPrincipal } from '../types/principal';

@Injectable()
export class TenantContextGuard implements CanActivate {
  private readonly logger = new Logger('AuditEvent');

  constructor(
    private reflector: Reflector,
    private tokenService: TokenService,
    private eventEmitter: EventEmitter2,
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
    let decoded: ReturnType<TokenService['verifyAccessToken']>;
    try {
      decoded = this.tokenService.verifyAccessToken(token);
    } catch {
      throw new UnauthorizedException();
    }

    // Validate session is not revoked
    if (
      decoded.sid &&
      (await this.tokenService.isSessionRevoked(decoded.sid))
    ) {
      throw new UnauthorizedException();
    }

    const principal: UserPrincipal = {
      userId: decoded.sub,
      tenantId: decoded.tid,
      role: decoded.role,
      platformRole: decoded.prole,
      sessionId: decoded.sid,
    };
    request.user = principal;
    request.tenantId = decoded.tid;

    // 404 rule: if route has :tenantId param and it doesn't match claims.tid
    // Exceptions: @PlatformRole routes, and any route accessed by a
    // platformRole=support principal — in both cases :tenantId is authoritative.
    const platformRole = this.reflector.getAllAndOverride<string>(
      PLATFORM_ROLE_KEY,
      [context.getHandler(), context.getClass()],
    );
    const isSupport = decoded.prole === 'support';

    const rawRouteTenantId = request.params?.['tenantId'];
    const routeTenantId = Array.isArray(rawRouteTenantId)
      ? rawRouteTenantId[0]
      : rawRouteTenantId;
    if (routeTenantId && routeTenantId !== decoded.tid) {
      if (platformRole || isSupport) {
        // Route param is authoritative
        request.tenantId = routeTenantId;
        if (isSupport) {
          const event = {
            supportUserId: decoded.sub,
            tenantId: routeTenantId,
            route: request.originalUrl ?? request.url,
            at: new Date(),
          };
          this.eventEmitter.emit('support.tenant.accessed', event);
          // E13 will subscribe to the event above for durable audit storage;
          // this line is what makes the access visible in `docker compose logs api`
          // in the meantime (and independently of E13 landing).
          this.logger.log(`support.tenant.accessed ${JSON.stringify(event)}`);
        }
      } else {
        // Never confirm another tenant exists → 404
        throw new NotFoundException();
      }
    }

    return true;
  }
}
