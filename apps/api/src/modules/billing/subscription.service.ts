import { Inject, Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { PrismaClient, Subscription, SubscriptionStatus } from '@prisma/client';
import { EventsService } from '../../common/events.service';
import { TenantLifecycleService } from '../tenants/tenant-lifecycle.service';
import { IllegalSubscriptionTransition } from './errors';

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

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
  constructor(
    @Inject('PRISMA') private readonly prisma: PrismaClient,
    @Inject(EventsService) private readonly events: EventsService,
    @Inject(TenantLifecycleService)
    private readonly tenantLifecycle: TenantLifecycleService,
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
