/**
 * E15 seed fixture: gives every tenant that doesn't have a Subscription yet
 * one on `BILLING_SIGNUP_PLAN`, currency picked from Tenant.country (GB →
 * GBP, everything else → NGN) — so a fresh clone's seeded tenants (ivoryglow
 * today, whatever future epics add tomorrow) always have a live subscription
 * without this file needing to know their ids. The plan catalogue itself
 * lives in `packages/db/src/plan-catalogue.ts` (`seedPlans`, re-exported
 * from `@verifynng/db`) so `PlanService.seed()` can reuse the exact same
 * data at runtime.
 *
 * It must agree with `SubscriptionService.startTrial` on both the plan and
 * the trial/no-trial shape: production re-runs `prisma db seed` on every
 * deploy, so a tenant awaiting KYC approval would otherwise be handed a
 * 30-day trial here that the nightly period roll later restricts.
 */
import { PrismaClient } from '@prisma/client';
import { loadEnv } from '@verifynng/config';

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

export async function seedSubscriptions(prisma: PrismaClient): Promise<void> {
  const signupPlan = await prisma.plan.findUniqueOrThrow({
    where: { code: loadEnv().BILLING_SIGNUP_PLAN },
  });
  const isTrial =
    (signupPlan.features as { trialTotalCap?: boolean } | null)
      ?.trialTotalCap === true;

  // Tenant has no Prisma relation to Subscription (Tenant stays owned by
  // E03) — diff existing subscription tenantIds against all tenants in JS.
  const existing = await prisma.subscription.findMany({
    select: { tenantId: true },
  });
  const covered = new Set(existing.map((s) => s.tenantId));

  const allTenants = await prisma.tenant.findMany({
    select: { id: true, country: true },
  });
  const now = new Date();

  for (const tenant of allTenants) {
    if (covered.has(tenant.id)) continue;
    await prisma.subscription.create({
      data: {
        tenantId: tenant.id,
        planId: signupPlan.id,
        status: isTrial ? 'trialing' : 'active',
        currency: tenant.country === 'GB' ? 'GBP' : 'NGN',
        currentPeriodStart: now,
        currentPeriodEnd: new Date(now.getTime() + THIRTY_DAYS_MS),
        trialEndsAt: isTrial ? new Date(now.getTime() + THIRTY_DAYS_MS) : null,
      },
    });
  }
}
