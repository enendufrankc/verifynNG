import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaClient, Unit, UnitState } from '@prisma/client';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { AuditService } from '../audit/audit.service.js';

export interface LifecycleActor {
  // 'apikey' added by E16 (docs/epics/E16-public-api-webhooks.md) for
  // POST /api/v1/units/:id/{flag,decommission,restore} — additive only,
  // matches AuditActorType. See issue #5 for the heads-up comment.
  type: 'user' | 'system' | 'apikey';
  id?: string;
}

export interface LifecycleCtx {
  actor: LifecycleActor;
  reason: string;
  anomalyId?: string;
  /** Set only by the batch-recall job: threaded onto UnitStateTransition.recallJobId. */
  recallJobId?: string;
  /**
   * Batch recall already gets one audit row from the HTTP endpoint's
   * `@Audited('batch.recall')` — skip the per-unit system-actor audit this
   * service would otherwise write for each of possibly thousands of units.
   */
  skipAudit?: boolean;
}

const TRANSITIONS: Record<
  'flag' | 'decommission' | 'restore',
  { from: UnitState[]; to: UnitState }
> = {
  flag: { from: ['active'], to: 'flagged' },
  decommission: { from: ['active', 'flagged'], to: 'decommissioned' },
  restore: { from: ['flagged', 'decommissioned'], to: 'active' },
};

/**
 * UnitLifecycleService — the sole writer of `Unit.state`. Every transition is
 * recorded in `UnitStateTransition` and emitted as a domain event; illegal
 * transitions (e.g. flagging an already-decommissioned unit) are rejected
 * with a 409 rather than silently no-op'd, so callers can surface it.
 */
@Injectable()
export class UnitLifecycleService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly eventEmitter: EventEmitter2,
    private readonly auditService: AuditService,
    @InjectQueue('units') private readonly unitsQueue: Queue,
  ) {}

  async flag(
    tenantId: string,
    unitId: string,
    ctx: LifecycleCtx,
  ): Promise<Unit> {
    return this.transition(
      'flag',
      tenantId,
      unitId,
      ctx,
      'unit.flag',
      'unit.flagged',
    );
  }

  async decommission(
    tenantId: string,
    unitId: string,
    ctx: LifecycleCtx,
  ): Promise<Unit> {
    return this.transition(
      'decommission',
      tenantId,
      unitId,
      ctx,
      'unit.decommission',
      'unit.decommissioned',
    );
  }

  async restore(
    tenantId: string,
    unitId: string,
    ctx: LifecycleCtx,
  ): Promise<Unit> {
    return this.transition(
      'restore',
      tenantId,
      unitId,
      ctx,
      'unit.restore',
      'unit.restored',
    );
  }

  async recallBatch(
    tenantId: string,
    batchId: string,
    ctx: LifecycleCtx,
  ): Promise<{ jobId: string }> {
    const batch = await this.prisma.batch.findFirst({
      where: { id: batchId, tenantId },
      select: { id: true },
    });
    if (!batch) throw new NotFoundException();

    const job = await this.unitsQueue.add('recall', {
      tenantId,
      batchId,
      reason: ctx.reason,
      actorType: ctx.actor.type,
      actorId: ctx.actor.id ?? null,
    });
    return { jobId: job.id! };
  }

  private async transition(
    kind: 'flag' | 'decommission' | 'restore',
    tenantId: string,
    unitId: string,
    ctx: LifecycleCtx,
    auditAction: string,
    eventName: string,
  ): Promise<Unit> {
    const rule = TRANSITIONS[kind];

    const unit = await this.prisma.unit.findFirst({
      where: { id: unitId, tenantId },
    });
    if (!unit) throw new NotFoundException();

    if (!rule.from.includes(unit.state)) {
      throw new ConflictException(
        `cannot ${kind} a unit in state '${unit.state}'`,
      );
    }

    const fromState = unit.state;
    const updated = await this.prisma.$transaction(async (tx) => {
      const u = await tx.unit.update({
        where: { id: unitId },
        data: { state: rule.to },
      });
      await tx.unitStateTransition.create({
        data: {
          tenantId,
          unitId,
          fromState,
          toState: rule.to,
          reason: ctx.reason,
          actorType: ctx.actor.type,
          actorId: ctx.actor.id ?? null,
          anomalyId: ctx.anomalyId ?? null,
          recallJobId: ctx.recallJobId ?? null,
        },
      });
      return u;
    });

    this.eventEmitter.emit(eventName, {
      tenantId,
      unitId,
      batchId: unit.batchId,
      reason: ctx.reason,
      anomalyId: ctx.anomalyId,
      actorType: ctx.actor.type,
      ...(ctx.recallJobId ? { recallJobId: ctx.recallJobId } : {}),
    });

    // HTTP-triggered actions are recorded by the controller's @Audited
    // interceptor; system-triggered actions (auto-flag, recall job) have no
    // request to decorate, so this service records them directly.
    if (ctx.actor.type === 'system' && !ctx.skipAudit) {
      await this.auditService.record({
        tenantId,
        actor: { type: 'system', id: ctx.actor.id },
        action: auditAction,
        target: { type: 'unit', id: unitId },
        payload: {
          reason: ctx.reason,
          anomalyId: ctx.anomalyId,
          fromState,
          toState: rule.to,
        },
      });
    }

    return updated;
  }
}
