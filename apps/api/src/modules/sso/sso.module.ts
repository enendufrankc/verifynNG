import { Module, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { AuthModule } from '../auth/auth.module';
import { LoginPolicyRegistry } from '../auth/login-policy-hook';
import { RateLimitModule } from '../rate-limit/rate-limit.module';
import { SsoConfigController } from './sso-config.controller';
import { SsoConfigService } from './sso-config.service';
import { OidcClientFactory } from './oidc-client-factory';
import { AccountLinker } from './account-linker';
import { SsoLoginService } from './sso-login.service';
import { SsoLoginController } from './sso-login.controller';
import { MfaPolicyService } from './mfa-policy.service';
import { MfaPolicyController } from './mfa-policy.controller';
import { MfaPolicyLoginHook } from './mfa-policy-login-hook';
import { EnforceSsoLoginHook } from './enforce-sso-login-hook';
import { BreakGlassService } from './break-glass.service';
import { BreakGlassController } from './break-glass.controller';
import {
  AllowAllSsoEntitlement,
  SSO_ENTITLEMENT_PORT,
} from './entitlement.port';

@Module({
  imports: [AuthModule, RateLimitModule],
  controllers: [
    SsoConfigController,
    SsoLoginController,
    MfaPolicyController,
    BreakGlassController,
  ],
  providers: [
    SsoConfigService,
    OidcClientFactory,
    AccountLinker,
    SsoLoginService,
    MfaPolicyService,
    MfaPolicyLoginHook,
    EnforceSsoLoginHook,
    BreakGlassService,
    PrismaClient,
    { provide: SSO_ENTITLEMENT_PORT, useClass: AllowAllSsoEntitlement },
  ],
  exports: [SsoConfigService, OidcClientFactory, MfaPolicyService],
})
export class SsoModule implements OnModuleInit {
  constructor(
    private readonly loginPolicyRegistry: LoginPolicyRegistry,
    private readonly enforceSsoLoginHook: EnforceSsoLoginHook,
    private readonly mfaPolicyLoginHook: MfaPolicyLoginHook,
  ) {}

  onModuleInit() {
    // Same registration idiom as QuotaService.registerKind() — see
    // login-policy-hook.ts for why this isn't a DI-resolved array.
    this.loginPolicyRegistry.register(this.enforceSsoLoginHook);
    this.loginPolicyRegistry.register(this.mfaPolicyLoginHook);
  }
}
