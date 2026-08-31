import { Get, Inject, Req } from '@nestjs/common';
import type { Request } from 'express';
import { PublicApiController } from '../decorators/public-api-controller.decorator.js';
import {
  ENTITLEMENT_SERVICE,
  type EntitlementService,
} from '../../entitlements/entitlement.service.js';

@PublicApiController('api/v1')
export class MeController {
  constructor(
    @Inject(ENTITLEMENT_SERVICE)
    private readonly entitlements: EntitlementService,
  ) {}

  @Get('me')
  async me(@Req() req: Request) {
    const apiKey = req.apiKey!;
    const { apiRateLimitPerMin } = await this.entitlements.limitsFor(
      apiKey.tenantId,
    );
    return {
      tenantId: apiKey.tenantId,
      keyPrefix: apiKey.prefix,
      scopes: apiKey.scopes,
      rateLimit: { perMinute: apiRateLimitPerMin },
    };
  }
}
