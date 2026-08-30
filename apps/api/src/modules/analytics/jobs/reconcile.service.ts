import { Inject, Injectable } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { EventsService } from '../../../common/events.service';
import { ScanRollupJobService } from './scan-rollup.service';
import { startOfUtcDay } from '../rollup/aggregate-scan-events';

const RECONCILE_WINDOW_DAYS = 3;

@Injectable()
export class ReconcileService {
  constructor(
    // Explicit @Inject(...) on the non-string-token params — see
    // RollupCountersSubscriber's constructor comment (tsx/esbuild decorator
    // metadata gap; jobs:run only, nest build/tsc is unaffected).
    @Inject('PRISMA') private readonly prisma: PrismaClient,
    @Inject(ScanRollupJobService)
    private readonly scanRollup: ScanRollupJobService,
    @Inject(EventsService) private readonly events: EventsService,
  ) {}

  /**
   * Unconditionally recomputes the last N days for every tenant with any
   * ScanEvent activity in that window — corrects late-arriving events and
   * any drift the incremental job's checkpoint missed.
   */
  async run(
    now: Date = new Date(),
  ): Promise<{ rowsWritten: number; durationMs: number }> {
    const startedAt = Date.now();
    const today = startOfUtcDay(now);
    const windowStart = new Date(
      today.getTime() - RECONCILE_WINDOW_DAYS * 24 * 60 * 60 * 1000,
    );

    const tenants = await this.prisma.scanEvent.findMany({
      where: { createdAt: { gte: windowStart } },
      distinct: ['tenantId'],
      select: { tenantId: true },
    });

    let rowsWritten = 0;
    for (const { tenantId } of tenants) {
      for (let offset = 0; offset < RECONCILE_WINDOW_DAYS; offset++) {
        const date = new Date(today.getTime() - offset * 24 * 60 * 60 * 1000);
        rowsWritten += await this.scanRollup.recomputeDay(tenantId, date);
      }
    }

    const durationMs = Date.now() - startedAt;
    await this.events.emit('analytics.rollup.completed', {
      date: today.toISOString(),
      rowsWritten,
      durationMs,
    });

    return { rowsWritten, durationMs };
  }
}
