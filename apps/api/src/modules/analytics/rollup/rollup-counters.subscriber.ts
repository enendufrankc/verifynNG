import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaClient } from '@prisma/client';
import { startOfUtcDay } from './aggregate-scan-events';
import { ScanRollupRowRepository } from './scan-rollup-row.repository';

interface EnumerationDetectedEvent {
  ipHash: string;
  tenantSlug: string | null;
  invalidCount: number;
  at: string | Date;
}

interface UnitFlaggedEvent {
  tenantId: string;
  unitId: string;
  batchId: string;
  reason: string;
}

/**
 * Live counters for the two rollup fields that have no ScanEvent
 * representation to recompute from later: `rateLimitHits` (from E06's
 * enumeration-block signal, which is IP-level, not scan-level) and
 * `flaggedUnits` (from E07's per-unit flag). Both fields are additive and
 * ScanRollupJobService never resets them when it recomputes a day, so
 * ordering between this subscriber and the rollup job doesn't matter.
 *
 * `scan.enumeration_detected` carries no productId/batchId/tier/verdict — it
 * isn't about one scan — so its hits land on a dedicated per-tenant-per-day
 * row: productId=null, batchId=null, tier=0 (sentinel, never produced by
 * aggregateScanEvents), verdict='rate-limited'. See
 * docs/analytics-and-metering.md.
 */
@Injectable()
export class RollupCountersSubscriber implements OnModuleInit {
  private readonly logger = new Logger(RollupCountersSubscriber.name);

  constructor(
    private readonly eventEmitter: EventEmitter2,
    @Inject('PRISMA') private readonly prisma: PrismaClient,
    private readonly rowRepo: ScanRollupRowRepository,
  ) {}

  onModuleInit(): void {
    this.eventEmitter.on(
      'scan.enumeration_detected',
      (payload: EnumerationDetectedEvent) =>
        this.onEnumerationDetected(payload).catch((err) =>
          this.logError('scan.enumeration_detected', err),
        ),
    );
    // Dormant until E07 ships unit flagging.
    this.eventEmitter.on('unit.flagged', (payload: UnitFlaggedEvent) =>
      this.onUnitFlagged(payload).catch((err) =>
        this.logError('unit.flagged', err),
      ),
    );
  }

  private async onEnumerationDetected(
    payload: EnumerationDetectedEvent,
  ): Promise<void> {
    if (!payload.tenantSlug) return; // no tenant to attribute the hit to
    const tenant = await this.prisma.tenant.findUnique({
      where: { slug: payload.tenantSlug },
      select: { id: true },
    });
    if (!tenant) return;

    const date = startOfUtcDay(new Date(payload.at));
    const row = await this.rowRepo.findOrCreate({
      tenantId: tenant.id,
      date,
      productId: null,
      batchId: null,
      tier: 0,
      verdict: 'rate-limited',
    });
    await this.prisma.scanRollupDaily.update({
      where: { id: row.id },
      data: { rateLimitHits: { increment: 1 } },
    });
  }

  private async onUnitFlagged(payload: UnitFlaggedEvent): Promise<void> {
    const batch = await this.prisma.batch.findUnique({
      where: { id: payload.batchId },
      select: { productId: true },
    });
    const date = startOfUtcDay(new Date());
    const row = await this.rowRepo.findOrCreate({
      tenantId: payload.tenantId,
      date,
      productId: batch?.productId ?? null,
      batchId: payload.batchId,
      tier: 2,
      verdict: 'flagged',
    });
    await this.prisma.scanRollupDaily.update({
      where: { id: row.id },
      data: { flaggedUnits: { increment: 1 } },
    });
  }

  private logError(event: string, err: unknown): void {
    this.logger.error(
      `rollup counter subscriber failed for ${event}`,
      err instanceof Error ? err.stack : String(err),
    );
  }
}
