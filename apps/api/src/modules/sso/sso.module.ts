import { Module } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { AuthModule } from '../auth/auth.module';
import { SsoConfigController } from './sso-config.controller';
import { SsoConfigService } from './sso-config.service';
import { OidcClientFactory } from './oidc-client-factory';
import { AccountLinker } from './account-linker';
import { SsoLoginService } from './sso-login.service';
import { SsoLoginController } from './sso-login.controller';
import {
  AllowAllSsoEntitlement,
  SSO_ENTITLEMENT_PORT,
} from './entitlement.port';

@Module({
  imports: [AuthModule], // TokenService, for issuing sessions on a successful SSO login
  controllers: [SsoConfigController, SsoLoginController],
  providers: [
    SsoConfigService,
    OidcClientFactory,
    AccountLinker,
    SsoLoginService,
    PrismaClient,
    { provide: SSO_ENTITLEMENT_PORT, useClass: AllowAllSsoEntitlement },
  ],
  exports: [SsoConfigService, OidcClientFactory],
})
export class SsoModule {}
