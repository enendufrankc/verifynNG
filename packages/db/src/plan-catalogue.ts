/**
 * E15 plan catalogue. Amounts are placeholders agreed with product —
 * changing them is a data edit + SEED_VERSION bump, not a code change (see
 * docs/epics/E15-billing-entitlements.md "Plan seed"). Shared between
 * `prisma/seed.ts` (fresh-clone bootstrap) and `PlanService.seed()`
 * (runtime re-seed) so the two can never drift.
 */
import type { Prisma, PrismaClient } from '@prisma/client';

export const SEED_VERSION = 1;

export interface PlanSeed {
  code: string;
  name: string;
  monthlyPriceNgnMinor: number;
  monthlyPriceGbpMinor: number;
  includedUnitsPerYear: number;
  includedScansPerMonth: number;
  overageUnitPriceNgnMinor: number;
  overageUnitPriceGbpMinor: number;
  overageScanPriceNgnMinor: number;
  overageScanPriceGbpMinor: number;
  features: Prisma.InputJsonValue;
  sortOrder: number;
}

export const PLANS: PlanSeed[] = [
  {
    code: 'free-trial',
    name: 'Free trial',
    monthlyPriceNgnMinor: 0,
    monthlyPriceGbpMinor: 0,
    includedUnitsPerYear: 500, // total for the trial, not per year — see trialTotalCap
    includedScansPerMonth: 5000,
    overageUnitPriceNgnMinor: 0,
    overageUnitPriceGbpMinor: 0,
    overageScanPriceNgnMinor: 0,
    overageScanPriceGbpMinor: 0,
    features: {
      publicApi: false,
      webhooks: false,
      sso: false,
      customPages: false,
      maxApiKeys: 1,
      apiRateLimitPerMin: 60,
      trialTotalCap: true,
    },
    sortOrder: 0,
  },
  {
    code: 'starter',
    name: 'Starter',
    monthlyPriceNgnMinor: 4_500_000, // ₦45,000
    monthlyPriceGbpMinor: 2_500, // £25
    includedUnitsPerYear: 10_000,
    includedScansPerMonth: 50_000,
    overageUnitPriceNgnMinor: 800, // ₦8
    overageUnitPriceGbpMinor: 40, // £0.40
    overageScanPriceNgnMinor: 50, // ₦0.50
    overageScanPriceGbpMinor: 3, // £0.03
    features: {
      publicApi: false,
      webhooks: false,
      sso: false,
      customPages: false,
      maxApiKeys: 3,
      apiRateLimitPerMin: 120,
    },
    sortOrder: 1,
  },
  {
    code: 'growth',
    name: 'Growth',
    monthlyPriceNgnMinor: 18_000_000, // ₦180,000
    monthlyPriceGbpMinor: 10_000, // £100
    includedUnitsPerYear: 100_000,
    includedScansPerMonth: 500_000,
    overageUnitPriceNgnMinor: 800,
    overageUnitPriceGbpMinor: 40,
    overageScanPriceNgnMinor: 50,
    overageScanPriceGbpMinor: 3,
    features: {
      publicApi: true,
      webhooks: true,
      sso: false,
      customPages: true,
      maxApiKeys: 10,
      apiRateLimitPerMin: 600,
    },
    sortOrder: 2,
  },
  {
    code: 'enterprise',
    name: 'Enterprise',
    monthlyPriceNgnMinor: 0, // custom — see features.customPricing
    monthlyPriceGbpMinor: 0,
    includedUnitsPerYear: 0, // unlimited; entitlement check skips the cap when customPricing is set
    includedScansPerMonth: 0,
    overageUnitPriceNgnMinor: 0,
    overageUnitPriceGbpMinor: 0,
    overageScanPriceNgnMinor: 0,
    overageScanPriceGbpMinor: 0,
    features: {
      publicApi: true,
      webhooks: true,
      sso: true,
      customPages: true,
      maxApiKeys: 100,
      apiRateLimitPerMin: 6000,
      customPricing: true,
    },
    sortOrder: 3,
  },
];

export async function seedPlans(prisma: PrismaClient): Promise<void> {
  for (const plan of PLANS) {
    await prisma.plan.upsert({
      where: { code: plan.code },
      update: plan,
      create: plan,
    });
  }
}
