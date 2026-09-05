import { Inject, Injectable } from '@nestjs/common';
import { Plan, PrismaClient } from '@prisma/client';
import type {
  EntitlementCheck,
  EntitlementPolicy,
} from '../batches/entitlement.policy';

export interface PlanFeatures {
  publicApi?: boolean;
  webhooks?: boolean;
  sso?: boolean;
  customPages?: boolean;
  maxApiKeys?: number;
  apiRateLimitPerMin?: number;
  trialTotalCap?: boolean;
  hardCap?: boolean;
  customPricing?: boolean;
}

export interface PlanLimits {
  apiRateLimitPerMin: number;
  maxApiKeys: number;
}

const DEFAULT_LIMITS: PlanLimits = { apiRateLimitPerMin: 60, maxApiKeys: 1 };

/**
 * Implements E04's `EntitlementPolicy` (apps/api/src/modules/batches/
 * entitlement.policy.ts) — the real, shipped shape (`canMint(ctx):
 * Promise<EntitlementCheck>`), not the `assertCanMint`/throwing form the
 * epic doc sketched before E04 landed. `ctx.existingUnitsThisYear` is
 * computed by the caller (MintService, a synchronous `Unit` count per
 * request) — no separate counter is needed here.
 */
@Injectable()
export class EntitlementService implements EntitlementPolicy {
  constructor(@Inject('PRISMA') private readonly prisma: PrismaClient) {}

  private async planForTenant(tenantId: string): Promise<Plan | null> {
    const sub = await this.prisma.subscription.findUnique({
      where: { tenantId },
      include: { plan: true },
    });
    return sub?.plan ?? null;
  }

  async canMint(ctx: {
    tenantId: string;
    count: number;
    existingUnitsThisYear: number;
  }): Promise<EntitlementCheck> {
    const plan = await this.planForTenant(ctx.tenantId);
    // No subscription yet (e.g. a tenant created outside the normal
    // activation flow, before `startTrial` ran) — fail open rather than
    // block minting on a billing gap that isn't the tenant's fault.
    if (!plan) return { allowed: true };

    const features = (plan.features ?? {}) as PlanFeatures;
    if (features.customPricing) return { allowed: true };

    const isHardCap =
      features.trialTotalCap === true || features.hardCap === true;
    if (!isHardCap) return { allowed: true }; // paid plans: overage allowed by default

    const projected = ctx.existingUnitsThisYear + ctx.count;
    if (projected > plan.includedUnitsPerYear) {
      return {
        allowed: false,
        reason: `Plan limit of ${plan.includedUnitsPerYear} units reached (${ctx.existingUnitsThisYear} used).`,
        upgradeHint: '/billing/change-plan',
        code: 'plan_limit',
        limit: plan.includedUnitsPerYear,
        used: ctx.existingUnitsThisYear,
      };
    }
    return { allowed: true };
  }

  async hasFeature(
    tenantId: string,
    feature: keyof PlanFeatures,
  ): Promise<boolean> {
    const plan = await this.planForTenant(tenantId);
    if (!plan) return false;
    return Boolean((plan.features as PlanFeatures)[feature]);
  }

  async limitsFor(tenantId: string): Promise<PlanLimits> {
    const plan = await this.planForTenant(tenantId);
    if (!plan) return DEFAULT_LIMITS;
    const features = plan.features as PlanFeatures;
    return {
      apiRateLimitPerMin:
        features.apiRateLimitPerMin ?? DEFAULT_LIMITS.apiRateLimitPerMin,
      maxApiKeys: features.maxApiKeys ?? DEFAULT_LIMITS.maxApiKeys,
    };
  }
}
