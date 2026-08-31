import { Body, Controller, Delete, Get, Post, Put, Req } from '@nestjs/common';
import { Roles } from '../auth/decorators/roles.decorator';
import { TenantId } from '../auth/decorators/tenant-id.decorator';
import type { AuthenticatedRequest } from '../../common/authenticated-request.js';
import {
  SsoConfigService,
  type UpsertSsoConfigDto,
} from './sso-config.service';
import { OidcClientFactory } from './oidc-client-factory';

@Controller('tenants/:tenantId/sso')
export class SsoConfigController {
  constructor(
    private readonly ssoConfig: SsoConfigService,
    private readonly oidcClientFactory: OidcClientFactory,
  ) {}

  @Get()
  @Roles('owner')
  get(@TenantId() tenantId: string) {
    return this.ssoConfig.get(tenantId);
  }

  @Post('test')
  @Roles('owner')
  test(@TenantId() tenantId: string) {
    return this.oidcClientFactory.testConnection(tenantId);
  }

  @Put()
  @Roles('owner')
  upsert(
    @TenantId() tenantId: string,
    @Body() dto: UpsertSsoConfigDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.ssoConfig.upsert(tenantId, req.user?.userId, req.ip, dto);
  }

  @Delete()
  @Roles('owner')
  disable(@TenantId() tenantId: string, @Req() req: AuthenticatedRequest) {
    return this.ssoConfig.disable(tenantId, req.user?.userId, req.ip);
  }
}
