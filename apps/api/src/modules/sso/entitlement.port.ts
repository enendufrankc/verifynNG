import { Injectable, InjectionToken } from '@nestjs/common';

/**
 * Local stand-in for E15's `EntitlementService.hasFeature(tenantId, feature)`
 * (not shipped on `main` yet — E15's worktree is still in progress). Mirrors
 * E04's `ENTITLEMENT_POLICY` token pattern (batches/entitlement.policy.ts) so
 * E15 can bind its real implementation here too once it lands.
 *
 * TODO(E15): bind this token to `EntitlementService.hasFeature` and delete
 * `AllowAllSsoEntitlement`.
 */
export interface SsoEntitlementPort {
  hasFeature(tenantId: string, feature: 'sso'): Promise<boolean>;
}

// NestJS v11's InjectionToken is a type alias, not a class — see E04's
// identical comment on ENTITLEMENT_POLICY for why this is a typed string.
export const SSO_ENTITLEMENT_PORT: InjectionToken<SsoEntitlementPort> =
  'SSO_ENTITLEMENT_PORT';

@Injectable()
export class AllowAllSsoEntitlement implements SsoEntitlementPort {
  async hasFeature(): Promise<boolean> {
    return true;
  }
}
