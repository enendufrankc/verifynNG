import { ConflictException, Inject, Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import {
  Invoice,
  Plan,
  PrismaClient,
  Subscription,
  SubscriptionStatus,
} from '@prisma/client';
import { EventsService } from '../../common/events.service';
import { TenantLifecycleService } from '../tenants/tenant-lifecycle.service';
import { IllegalSubscriptionTransition } from './errors';
import { InvoiceService } from './invoice.service';
import type { PlanFeatures } from './entitlement.service';

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

export interface ChangePlanPreview {
  currentPlanCode: string;
  targetPlanCode: string;
  direction: 'upgrade' | 'downgrade' | 'unchanged';
  currency: string;
  remainingFraction: number;
  creditMinor: number;
  chargeMinor: number;
  netMinor: number;
  effective: 'now' | 'period_end';
  blockedByUnitsCap: { used: number; limit: number } | null;
}

// `legal[from]` = statuses `from` may move to. `* -> cancelled` per the
// epic spec is expressed by including 'cancelled' in every non-terminal row.
const LEGAL_TRANSITIONS: Record<SubscriptionStatus, SubscriptionStatus[]> = {
  trialing: ['active', 'restricted', 'cancelled'],
  active: ['past_due', 'restricted', 'cancelled'],
  past_due: ['active', 'restricted', 'cancelled'],
  restricted: ['active', 'cancelled'],
  cancelled: [],
};

function addMonthsUtc(date: Date, months: number): Date {
  const d = new Date(date);
  d.setUTCMonth(d.getUTCMonth() + months);
  return d;
}

@Injectable()
export class SubscriptionService {
  private readonly logger = new Logger(SubscriptionService.name);

  constructor(
    @Inject('PRISMA') private readonly prisma: PrismaClient,
    @Inject(EventsService) private readonly events: EventsService,
    @Inject(TenantLifecycleService)
    private readonly tenantLifecycle: TenantLifecycleService,
    @Inject(InvoiceService) private readonly invoices: InvoiceService,
  ) {}

  async getForTenant(tenantId: string): Promise<Subscription | null> {
    return this.prisma.subscription.findUnique({ where: { tenantId } });
  }

  /**
   * Bootstraps a tenant's first (trial) subscription. Idempotent — a tenant
   * that already has one is left untouched, since this is invoked both
   * directly (fresh-clone seeding) and via the `tenant.verified` listener
   * below, which can fire more than once for the same tenant (e.g. a
   * restricted -> active transition also emits `tenant.verified`; see
   * `TenantLifecycleService.transition`'s event-naming ternary).
   */
  async startTrial(tenantId: string): Promise<Subscription> {
    const existing = await this.getForTenant(tenantId);
    if (existing) return existing;

    const [tenant, trialPlan] = await Promise.all([
      this.prisma.tenant.findUniqueOrThrow({ where: { id: tenantId } }),
      this.prisma.plan.findUniqueOrThrow({ where: { code: 'free-trial' } }),
    ]);
    const now = new Date();
    const trialEndsAt = new Date(now.getTime() + THIRTY_DAYS_MS);

    const subscription = await this.prisma.subscription.create({
      data: {
        tenantId,
        planId: trialPlan.id,
        status: 'trialing',
        currency: tenant.country === 'GB' ? 'GBP' : 'NGN',
        currentPeriodStart: now,
        currentPeriodEnd: trialEndsAt,
        trialEndsAt,
      },
    });
    await this.events.emit('subscription.changed', {
      tenantId,
      subscriptionId: subscription.id,
      fromPlanCode: null,
      toPlanCode: trialPlan.code,
      fromStatus: null,
      toStatus: 'trialing',
      effectiveAt: now.toISOString(),
    });
    return subscription;
  }

  // `TenantLifecycleService.transition` only fires `tenant.verified` on a
  // real event bus as of this epic (see tenant-events.ts) — it previously
  // logged only. Also fires on restricted -> active (E15's own
  // reactivation), which is why startTrial() above is idempotent.
  @OnEvent('tenant.verified')
  async onTenantVerified(payload: { tenantId: string }): Promise<void> {
    await this.startTrial(payload.tenantId);
  }

  async cancel(tenantId: string): Promise<Subscription> {
    return this.transition(tenantId, 'cancelled');
  }

  /**
   * Generic state-machine transition. Entering/leaving `restricted` also
   * drives Tenant.status via E03's TenantLifecycleService — `restricted` is
   * billing's own write-lock and must round-trip through the tenant guard
   * (see docs/epics/E15-billing-entitlements.md "restricted vs suspended").
   */
  async transition(
    tenantId: string,
    status: SubscriptionStatus,
    reason?: string,
  ): Promise<Subscription> {
    const current = await this.prisma.subscription.findUniqueOrThrow({
      where: { tenantId },
    });
    if (!LEGAL_TRANSITIONS[current.status].includes(status)) {
      throw new IllegalSubscriptionTransition(current.status, status);
    }
    const plan = await this.prisma.plan.findUniqueOrThrow({
      where: { id: current.planId },
    });
    const now = new Date();
    const updated = await this.prisma.subscription.update({
      where: { tenantId },
      data: {
        status,
        restrictedAt: status === 'restricted' ? now : current.restrictedAt,
        cancelledAt: status === 'cancelled' ? now : current.cancelledAt,
      },
    });

    if (status === 'restricted') {
      await this.tenantLifecycle.transition(
        tenantId,
        'restricted',
        'system:billing',
        reason ?? 'dunning_exhausted',
      );
    } else if (status === 'active' && current.status === 'restricted') {
      await this.tenantLifecycle.transition(
        tenantId,
        'active',
        'system:billing',
      );
    }

    await this.events.emit('subscription.changed', {
      tenantId,
      subscriptionId: updated.id,
      fromPlanCode: plan.code,
      toPlanCode: plan.code,
      fromStatus: current.status,
      toStatus: status,
      effectiveAt: now.toISOString(),
    });
    if (status === 'restricted') {
      await this.events.emit('subscription.restricted', {
        tenantId,
        subscriptionId: updated.id,
        reason: reason ?? 'dunning_exhausted',
        at: now.toISOString(),
      });
    }
    if (status === 'active' && current.status === 'restricted') {
      await this.events.emit('subscription.reactivated', {
        tenantId,
        subscriptionId: updated.id,
        at: now.toISOString(),
      });
    }
    return updated;
  }

  /**
   * Pure proration math shared by `previewChangePlan` and `changePlan` — the
   * remaining fraction of the *current* billing period, priced at both the
   * old and new plan's monthly fee. See docs/billing-pricing-and-
   * proration.md for worked NGN/GBP examples this mirrors.
   */
  private calculateProration(
    sub: Subscription,
    currentPlan: Plan,
    targetPlan: Plan,
    now: Date,
  ): { remainingFraction: number; creditMinor: number; chargeMinor: number } {
    const totalMs =
      sub.currentPeriodEnd.getTime() - sub.currentPeriodStart.getTime();
    const remainingMs = Math.max(
      0,
      sub.currentPeriodEnd.getTime() - now.getTime(),
    );
    const remainingFraction =
      totalMs > 0 ? Math.min(1, remainingMs / totalMs) : 0;

    const oldFeeMinor =
      sub.currency === 'NGN'
        ? currentPlan.monthlyPriceNgnMinor
        : currentPlan.monthlyPriceGbpMinor;
    const newFeeMinor =
      sub.currency === 'NGN'
        ? targetPlan.monthlyPriceNgnMinor
        : targetPlan.monthlyPriceGbpMinor;

    return {
      remainingFraction,
      creditMinor: Math.round(oldFeeMinor * remainingFraction),
      chargeMinor: Math.round(newFeeMinor * remainingFraction),
    };
  }

  /**
   * Read-only proration preview for the web-admin change-plan modal (T11).
   * Never persists or throws on an over-cap downgrade — surfaces
   * `blockedByUnitsCap` instead so the UI can show it and let the owner
   * decide whether to pass `force` to `changePlan`.
   */
  async previewChangePlan(
    tenantId: string,
    planCode: string,
    now: Date = new Date(),
  ): Promise<ChangePlanPreview> {
    const sub = await this.prisma.subscription.findUniqueOrThrow({
      where: { tenantId },
      include: { plan: true },
    });
    const targetPlan = await this.prisma.plan.findUniqueOrThrow({
      where: { code: planCode },
    });

    if (targetPlan.id === sub.planId) {
      return {
        currentPlanCode: sub.plan.code,
        targetPlanCode: targetPlan.code,
        direction: 'unchanged',
        currency: sub.currency,
        remainingFraction: 0,
        creditMinor: 0,
        chargeMinor: 0,
        netMinor: 0,
        effective: 'now',
        blockedByUnitsCap: null,
      };
    }

    const isUpgrade = targetPlan.sortOrder > sub.plan.sortOrder;
    let blockedByUnitsCap: { used: number; limit: number } | null = null;
    if (!isUpgrade) {
      const used = await this.prisma.unit.count({ where: { tenantId } });
      const features = (targetPlan.features ?? {}) as PlanFeatures;
      if (!features.customPricing && used > targetPlan.includedUnitsPerYear) {
        blockedByUnitsCap = { used, limit: targetPlan.includedUnitsPerYear };
      }
    }

    if (!isUpgrade) {
      return {
        currentPlanCode: sub.plan.code,
        targetPlanCode: targetPlan.code,
        direction: 'downgrade',
        currency: sub.currency,
        remainingFraction: 0,
        creditMinor: 0,
        chargeMinor: 0,
        netMinor: 0,
        effective: 'period_end',
        blockedByUnitsCap,
      };
    }

    const { remainingFraction, creditMinor, chargeMinor } =
      this.calculateProration(sub, sub.plan, targetPlan, now);
    return {
      currentPlanCode: sub.plan.code,
      targetPlanCode: targetPlan.code,
      direction: 'upgrade',
      currency: sub.currency,
      remainingFraction,
      creditMinor,
      chargeMinor,
      netMinor: chargeMinor - creditMinor,
      effective: 'now',
      blockedByUnitsCap: null,
    };
  }

  /**
   * Upgrade (target plan's `sortOrder` higher than the current plan's) takes
   * effect immediately: `Subscription.planId` switches now (so entitlement
   * checks are re-based to the new plan's `includedUnitsPerYear` on the very
   * next mint call) and an immediate `proration` invoice is issued for the
   * net of (charge for the remaining period at the new fee) minus (credit
   * for the remaining period at the old fee) — zero net produces no invoice.
   * A `trialing` subscription that upgrades also moves to `active`; an
   * `active`/`past_due` one keeps its status.
   *
   * Downgrade is scheduled at `currentPeriodEnd` via `pendingPlanId`
   * (`runPeriodRoll` already applies it) and is blocked with a
   * `ConflictException` if the tenant's current unit count already exceeds
   * the target plan's `includedUnitsPerYear`, unless `force` is passed
   * (owner acknowledging the overage).
   *
   * Either direction is rejected for a custom-priced (enterprise) plan on
   * either side of the change — same rule `InvoiceService.generateForPeriod`
   * already applies: those are invoiced manually by support, not through
   * this catalogue.
   */
  async changePlan(
    tenantId: string,
    planCode: string,
    opts: { force?: boolean; now?: Date } = {},
  ): Promise<{ subscription: Subscription; prorationInvoice: Invoice | null }> {
    const now = opts.now ?? new Date();
    const sub = await this.prisma.subscription.findUniqueOrThrow({
      where: { tenantId },
      include: { plan: true },
    });
    if (!['trialing', 'active', 'past_due'].includes(sub.status)) {
      throw new ConflictException('subscription_not_changeable');
    }
    const targetPlan = await this.prisma.plan.findUniqueOrThrow({
      where: { code: planCode },
    });
    if (targetPlan.id === sub.planId) {
      return { subscription: sub, prorationInvoice: null };
    }

    const currentFeatures = (sub.plan.features ?? {}) as PlanFeatures;
    const targetFeatures = (targetPlan.features ?? {}) as PlanFeatures;
    if (currentFeatures.customPricing || targetFeatures.customPricing) {
      throw new ConflictException(
        'enterprise_plans_are_invoiced_manually_by_support',
      );
    }

    const isUpgrade = targetPlan.sortOrder > sub.plan.sortOrder;

    if (!isUpgrade) {
      if (!opts.force) {
        const used = await this.prisma.unit.count({ where: { tenantId } });
        if (used > targetPlan.includedUnitsPerYear) {
          throw new ConflictException({
            error: 'downgrade_exceeds_target_plan',
            used,
            limit: targetPlan.includedUnitsPerYear,
          });
        }
      }
      const updated = await this.prisma.subscription.update({
        where: { tenantId },
        data: { pendingPlanId: targetPlan.id },
      });
      await this.events.emit('subscription.changed', {
        tenantId,
        subscriptionId: updated.id,
        fromPlanCode: sub.plan.code,
        toPlanCode: targetPlan.code,
        fromStatus: sub.status,
        toStatus: sub.status,
        effectiveAt: sub.currentPeriodEnd.toISOString(),
      });
      return { subscription: updated, prorationInvoice: null };
    }

    const { creditMinor, chargeMinor } = this.calculateProration(
      sub,
      sub.plan,
      targetPlan,
      now,
    );
    const netMinor = chargeMinor - creditMinor;
    const newStatus = sub.status === 'trialing' ? 'active' : sub.status;

    const updated = await this.prisma.subscription.update({
      where: { tenantId },
      data: { planId: targetPlan.id, status: newStatus, pendingPlanId: null },
    });

    let prorationInvoice: Invoice | null = null;
    if (netMinor > 0) {
      const draft = await this.invoices.generateProration(tenantId, {
        currency: sub.currency,
        periodStart: sub.currentPeriodStart,
        periodEnd: sub.currentPeriodEnd,
        oldPlanName: sub.plan.name,
        newPlanName: targetPlan.name,
        creditMinor,
        chargeMinor,
      });
      prorationInvoice = await this.invoices.issue(draft.id);
    }

    await this.events.emit('subscription.changed', {
      tenantId,
      subscriptionId: updated.id,
      fromPlanCode: sub.plan.code,
      toPlanCode: targetPlan.code,
      fromStatus: sub.status,
      toStatus: newStatus,
      effectiveAt: now.toISOString(),
    });

    return { subscription: updated, prorationInvoice };
  }

  /**
   * Nightly `billing.period-roll`: expires trials whose `trialEndsAt` has
   * passed (-> restricted, reason `trial_expired`) and rolls
   * active/past_due subscriptions whose `currentPeriodEnd` has passed to
   * the next month, applying a scheduled downgrade (`pendingPlanId`, set by
   * `changePlan`) if one is due.
   */
  async runPeriodRoll(
    now: Date = new Date(),
  ): Promise<{ trialsExpired: number; periodsRolled: number }> {
    const expiredTrials = await this.prisma.subscription.findMany({
      where: { status: 'trialing', trialEndsAt: { lte: now } },
    });
    for (const sub of expiredTrials) {
      await this.transition(sub.tenantId, 'restricted', 'trial_expired');
    }

    const dueForRoll = await this.prisma.subscription.findMany({
      where: {
        status: { in: ['active', 'past_due'] },
        currentPeriodEnd: { lte: now },
      },
    });
    for (const sub of dueForRoll) {
      // billing.invoice-run: bill the period that's ending before rolling
      // forward. Best-effort — a tenant whose E12 usage isn't finalised yet
      // (or has no rows at all) must not block every other tenant's roll;
      // it simply gets invoiced on the next nightly pass once it is.
      try {
        const period = `${sub.currentPeriodStart.getUTCFullYear()}-${String(
          sub.currentPeriodStart.getUTCMonth() + 1,
        ).padStart(2, '0')}`;
        const invoice = await this.invoices.generateForPeriod(
          sub.tenantId,
          period,
        );
        await this.invoices.issue(invoice.id);
      } catch (err) {
        this.logger.warn(
          `billing.invoice-run skipped for tenant ${sub.tenantId}: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }

      await this.prisma.subscription.update({
        where: { tenantId: sub.tenantId },
        data: {
          currentPeriodStart: sub.currentPeriodEnd,
          currentPeriodEnd: addMonthsUtc(sub.currentPeriodEnd, 1),
          ...(sub.pendingPlanId
            ? { planId: sub.pendingPlanId, pendingPlanId: null }
            : {}),
        },
      });
    }

    return {
      trialsExpired: expiredTrials.length,
      periodsRolled: dueForRoll.length,
    };
  }
}
