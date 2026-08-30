import { Injectable, InjectionToken } from '@nestjs/common';

export interface EntitlementCheck {
  allowed: boolean;
  reason?: string;
  upgradeHint?: string;
}

export interface EntitlementPolicy {
  canMint(ctx: {
    tenantId: string;
    count: number;
    existingUnitsThisYear: number;
  }): Promise<EntitlementCheck>;
}

// NestJS v11's InjectionToken is a type alias (string | symbol | Type | Abstract
// | Function), not a class — so we declare a string token typed as InjectionToken.
export const ENTITLEMENT_POLICY: InjectionToken<EntitlementPolicy> =
  'ENTITLEMENT_POLICY';

@Injectable()
export class AllowAllEntitlementPolicy implements EntitlementPolicy {
  async canMint(_ctx: {
    tenantId: string;
    count: number;
    existingUnitsThisYear: number;
  }): Promise<EntitlementCheck> {
    return { allowed: true };
  }
}

@Injectable()
export class DenyAboveEntitlementPolicy implements EntitlementPolicy {
  constructor(private limit: number) {}

  async canMint(ctx: {
    tenantId: string;
    count: number;
    existingUnitsThisYear: number;
  }): Promise<EntitlementCheck> {
    if (ctx.count > this.limit) {
      return {
        allowed: false,
        reason: `Count ${ctx.count} exceeds limit ${this.limit}`,
        upgradeHint: 'Upgrade your plan',
      };
    }
    return { allowed: true };
  }
}
