import { Inject, Injectable } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import {
  aggregateScanEvents,
  startOfUtcDay,
} from '../rollup/aggregate-scan-events';
import {
  ScanRollupRowRepository,
  toInputJson,
} from '../rollup/scan-rollup-row.repository';

const GLOBAL_CHECKPOINT_ID = 'global:scan';
const DEFAULT_BATCH_LIMIT = 5000;

@Injectable()
export class ScanRollupJobService {
  constructor(
    @Inject('PRISMA') private readonly prisma: PrismaClient,
    private readonly rowRepo: ScanRollupRowRepository,
  ) {}

  /**
   * Reads ScanEvents after the checkpoint, then fully recomputes every
   * (tenant, day) the new events touched — distinctIpCount can't be derived
   * incrementally, so each touched day is recomputed from scratch off the
   * full day's ScanEvents rather than merged in.
   */
  async runIncremental(
    limit = DEFAULT_BATCH_LIMIT,
  ): Promise<{
    rowsWritten: number;
    touchedDays: number;
    eventsProcessed: number;
  }> {
    const checkpoint = await this.prisma.rollupCheckpoint.findUnique({
      where: { id: GLOBAL_CHECKPOINT_ID },
    });
    const since = checkpoint?.lastEventAt ?? new Date(0);
    const sinceId = checkpoint?.lastEventId ?? '';

    const newEvents = await this.prisma.scanEvent.findMany({
      where: {
        OR: [
          { createdAt: { gt: since } },
          { createdAt: since, id: { gt: sinceId } },
        ],
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take: limit,
      select: { tenantId: true, createdAt: true, id: true },
    });

    if (newEvents.length === 0) {
      return { rowsWritten: 0, touchedDays: 0, eventsProcessed: 0 };
    }

    const touched = new Set<string>(); // `${tenantId}|${isoDay}`
    for (const e of newEvents) {
      touched.add(`${e.tenantId}|${startOfUtcDay(e.createdAt).toISOString()}`);
    }

    let rowsWritten = 0;
    for (const key of touched) {
      const [tenantId, dateIso] = key.split('|');
      rowsWritten += await this.recomputeDay(tenantId, new Date(dateIso));
    }

    const last = newEvents[newEvents.length - 1];
    await this.prisma.rollupCheckpoint.upsert({
      where: { id: GLOBAL_CHECKPOINT_ID },
      create: {
        id: GLOBAL_CHECKPOINT_ID,
        lastEventAt: last.createdAt,
        lastEventId: last.id,
      },
      update: { lastEventAt: last.createdAt, lastEventId: last.id },
    });

    return {
      rowsWritten,
      touchedDays: touched.size,
      eventsProcessed: newEvents.length,
    };
  }

  /**
   * Full from-scratch recompute of one tenant's one UTC day from raw
   * ScanEvent. Used by both the incremental job (for touched days) and the
   * nightly reconcile job (unconditionally, for the last 3 days). Never
   * touches `rateLimitHits`/`flaggedUnits` — those are maintained live by
   * RollupCountersSubscriber off events with no ScanEvent representation.
   */
  async recomputeDay(tenantId: string, date: Date): Promise<number> {
    const dayStart = startOfUtcDay(date);
    const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);

    const events = await this.prisma.scanEvent.findMany({
      where: { tenantId, createdAt: { gte: dayStart, lt: dayEnd } },
      select: {
        tenantId: true,
        createdAt: true,
        productId: true,
        batchId: true,
        tier: true,
        verdict: true,
        ipHash: true,
        geoCountry: true,
        geoCity: true,
      },
    });

    const rows = aggregateScanEvents(
      events.map((e) => ({ ...e, tier: e.tier as 'tier1' | 'tier2' })),
    );

    for (const row of rows) {
      const existing = await this.rowRepo.findOrCreate({
        tenantId: row.tenantId,
        date: row.date,
        productId: row.productId,
        batchId: row.batchId,
        tier: row.tier,
        verdict: row.verdict,
      });
      await this.prisma.scanRollupDaily.update({
        where: { id: existing.id },
        data: {
          count: row.count,
          distinctIpCount: row.distinctIpCount,
          topCountries: toInputJson(row.topCountries),
          computedAt: new Date(),
        },
      });
    }

    return rows.length;
  }
}
