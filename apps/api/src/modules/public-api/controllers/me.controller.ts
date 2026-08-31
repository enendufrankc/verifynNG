import { Get, Inject, Req } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { Request } from 'express';
import { PublicApiController } from '../decorators/public-api-controller.decorator.js';
import { ApiPublicCommonResponses } from '../decorators/api-common-responses.decorator.js';
import { MeResponseDto } from '../dto/responses/me.response.dto.js';
import {
  ENTITLEMENT_SERVICE,
  type EntitlementService,
} from '../../entitlements/entitlement.service.js';

@ApiTags('meta')
@ApiBearerAuth('apiKey')
@ApiPublicCommonResponses()
@PublicApiController('api/v1')
export class MeController {
  constructor(
    @Inject(ENTITLEMENT_SERVICE)
    private readonly entitlements: EntitlementService,
  ) {}

  @Get('me')
  @ApiOperation({ summary: 'Introspect the authenticated API key' })
  @ApiResponse({ status: 200, type: MeResponseDto })
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
