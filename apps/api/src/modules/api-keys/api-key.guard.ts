import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import { ApiKeyService } from './api-key.service.js';

/**
 * Authenticates `/api/v1/**` requests via `Authorization: Bearer vk_live_…`
 * or `vk_test_…`. Mounted only on PublicApiModule controllers (all marked
 * `@Public()` so the global TenantContextGuard/RolesGuard short-circuit —
 * see docs/epics/E16-public-api-webhooks.md "Two routers, one app").
 *
 * Note: E02's own `ApiClient` model also mints `vk_<8hex>_<64hex>` bearer
 * tokens for `@InternalOnly()` routes. The two never collide: hex digits
 * are 0-9a-f, so a key continuing `vk_live_`/`vk_test_` can never be an
 * E02 ApiClient key, and vice versa.
 */
@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(private readonly apiKeyService: ApiKeyService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const authHeader = request.headers.authorization;
    if (!authHeader?.startsWith('Bearer vk_')) {
      throw new UnauthorizedException();
    }

    const rawKey = authHeader.slice(7);
    const verified = await this.apiKeyService.verify(rawKey);
    if (!verified) throw new UnauthorizedException();

    request.apiKey = verified;
    request.tenantId = verified.tenantId;
    return true;
  }
}
