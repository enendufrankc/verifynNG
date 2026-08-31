import { Injectable, InjectionToken } from '@nestjs/common';
import { loadEnv } from '@verifynng/config';

export type EntitlementFeature = 'publicApi' | 'webhooks';

export interface EntitlementLimits {
  apiRateLimitPerMin: number;
  maxApiKeys: number;
}

/**
 * E15 (Billing & Entitlements) hasn't shipped yet — E16 depends on
 * `EntitlementService.hasFeature('publicApi' | 'webhooks')` and
 * `.limitsFor(tenantId)` per docs/epics/E16-public-api-webhooks.md.
 * This stub is permissive (every tenant has every feature, flat env-driven
 * limits) so E16 can ship against the published interface today. E15 binds
 * its real `PlanEntitlementService` to `ENTITLEMENT_SERVICE` when it lands —
 * filed on E15's issue, mirrors E04's `ENTITLEMENT_POLICY` token pattern
 * (apps/api/src/modules/batches/entitlement.policy.ts).
 */
export interface EntitlementService {
  hasFeature(tenantId: string, feature: EntitlementFeature): Promise<boolean>;
  limitsFor(tenantId: string): Promise<EntitlementLimits>;
}

// NestJS v11's InjectionToken is a type alias (string | symbol | Type | Abstract
// | Function), not a class — declared as a string token typed as InjectionToken,
// matching E04's ENTITLEMENT_POLICY convention.
export const ENTITLEMENT_SERVICE: InjectionToken<EntitlementService> =
  'ENTITLEMENT_SERVICE';

@Injectable()
export class StubEntitlementService implements EntitlementService {
  async hasFeature(
    _tenantId: string,
    _feature: EntitlementFeature,
  ): Promise<boolean> {
    return true;
  }

  async limitsFor(_tenantId: string): Promise<EntitlementLimits> {
    const env = loadEnv();
    return {
      apiRateLimitPerMin: env.PUBLIC_API_DEFAULT_RPM,
      maxApiKeys: env.PUBLIC_API_MAX_KEYS_DEFAULT,
    };
  }
}
