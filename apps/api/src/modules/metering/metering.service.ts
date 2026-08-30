import { Inject, Injectable } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { EventsService } from '../../common/events.service';
import { MeterInput, MeterPort } from './meter.port';

function isUniqueConstraintError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === 'P2002'
  );
}

@Injectable()
export class MeteringService implements MeterPort {
  constructor(
    // Explicit @Inject(EventsService) — see RollupCountersSubscriber's
    // constructor comment (tsx/esbuild decorator metadata gap; jobs:run
    // only, nest build/tsc is unaffected).
    @Inject('PRISMA') private readonly prisma: PrismaClient,
    @Inject(EventsService) private readonly events: EventsService,
  ) {}

  /**
   * Writes one immutable UsageEvent and emits `usage.recorded`. Idempotent on
   * (tenantId, kind, idempotencyKey) via the DB unique constraint — a repeat
   * call with the same key is a silent no-op (no duplicate event, no re-emit).
   */
  async record(input: MeterInput): Promise<void> {
    if (input.quantity < 1) {
      throw new Error('MeterPort.record: quantity must be >= 1');
    }

    let usageEvent;
    try {
      usageEvent = await this.prisma.usageEvent.create({
        data: {
          tenantId: input.tenantId,
          kind: input.kind,
          quantity: input.quantity,
          occurredAt: input.occurredAt ?? new Date(),
          ref: input.ref ?? null,
          idempotencyKey: input.idempotencyKey ?? null,
        },
      });
    } catch (error) {
      if (isUniqueConstraintError(error)) return;
      throw error;
    }

    await this.events.emit('usage.recorded', {
      tenantId: usageEvent.tenantId,
      usageEventId: usageEvent.id,
      kind: usageEvent.kind,
      quantity: usageEvent.quantity,
      occurredAt: usageEvent.occurredAt,
      ref: usageEvent.ref ?? undefined,
    });
  }
}
