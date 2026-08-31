import { Module } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { SsoConfigController } from './sso-config.controller';
import { SsoConfigService } from './sso-config.service';
import { OidcClientFactory } from './oidc-client-factory';
import {
  AllowAllSsoEntitlement,
  SSO_ENTITLEMENT_PORT,
} from './entitlement.port';

@Module({
  controllers: [SsoConfigController],
  providers: [
    SsoConfigService,
    OidcClientFactory,
    PrismaClient,
    { provide: SSO_ENTITLEMENT_PORT, useClass: AllowAllSsoEntitlement },
  ],
  exports: [SsoConfigService, OidcClientFactory],
})
export class SsoModule {}
