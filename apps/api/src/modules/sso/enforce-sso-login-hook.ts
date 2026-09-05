import { ForbiddenException, Injectable } from '@nestjs/common';
import type { LoginPolicyHook } from '../auth/login-policy-hook';
import { SsoConfigService } from './sso-config.service';

/**
 * E02 `LoginPolicyHook.beforePasswordLogin`. Blocks `POST auth/login` for an
 * enforce-SSO tenant — the owner keeps the separate break-glass path
 * (password + TOTP) so a broken IdP never locks a tenant out entirely.
 */
@Injectable()
export class EnforceSsoLoginHook implements LoginPolicyHook {
  constructor(private readonly ssoConfig: SsoConfigService) {}

  async beforePasswordLogin(ctx: {
    tenantId: string;
    tenantSlug: string;
  }): Promise<void> {
    const config = await this.ssoConfig.getRaw(ctx.tenantId);
    if (config?.enabled && config.enforceSso) {
      throw new ForbiddenException({
        code: 'sso_required',
        ssoStartUrl: `/auth/sso/${ctx.tenantSlug}/start`,
      });
    }
  }
}
