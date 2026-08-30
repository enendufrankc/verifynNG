import { Inject, Injectable, Logger } from '@nestjs/common';
import { PrismaClient, UsageSummary } from '@prisma/client';
import { EventsService } from '../../../common/events.service';
import { ALL_USAGE_KINDS, toDottedKind } from '../usage-kind.util';
import {
  currentMonthUtc,
  monthRangeUtc,
  previousMonthUtc,
} from '../month.util';

@Injectable()
export class MeteringMonthCloseService {
  private readonly logger = new Logger(MeteringMonthCloseService.name);

  constructor(
    @Inject('PRISMA') private readonly prisma: PrismaClient,
    private readonly events: EventsService,
  ) {}

  /**
   * Upserts every tenant's running totals for `month` from raw UsageEvents.
   * Never sets finalisedAt — safe to run hourly against the current month.
   */
  async upsertMonth(
    month: string = currentMonthUtc(),
  ): Promise<{ tenantsUpdated: number }> {
    const { start, end } = monthRangeUtc(month);
    const groups = await this.prisma.usageEvent.groupBy({
      by: ['tenantId', 'kind'],
      where: { occurredAt: { gte: start, lt: end } },
      _sum: { quantity: true },
      _count: { _all: true },
    });

    for (const g of groups) {
      await this.prisma.usageSummary.upsert({
        where: {
          tenantId_month_kind: { tenantId: g.tenantId, month, kind: g.kind },
        },
        create: {
          tenantId: g.tenantId,
          month,
          kind: g.kind,
          quantity: g._sum.quantity ?? 0,
          eventCount: g._count._all,
        },
        update: {
          quantity: g._sum.quantity ?? 0,
          eventCount: g._count._all,
        },
      });
    }

    return { tenantsUpdated: new Set(groups.map((g) => g.tenantId)).size };
  }

  /**
   * Locks `month` (default: previous month) for every tenant that has an
   * open UsageSummary row, emitting `usage.summary.finalised` once each.
   * Idempotent: a second call finds no open rows and does nothing.
   */
  async finaliseMonth(
    month: string = previousMonthUtc(),
  ): Promise<{ tenantsFinalised: number }> {
    await this.upsertMonth(month);

    const openRows = await this.prisma.usageSummary.findMany({
      where: { month, finalisedAt: null },
    });
    const byTenant = new Map<string, UsageSummary[]>();
    for (const row of openRows) {
      const list = byTenant.get(row.tenantId) ?? [];
      list.push(row);
      byTenant.set(row.tenantId, list);
    }

    const now = new Date();
    for (const [tenantId, rows] of byTenant) {
      await this.prisma.usageSummary.updateMany({
        where: { tenantId, month, finalisedAt: null },
        data: { finalisedAt: now },
      });

      const kinds: Record<string, number> = {};
      for (const kind of ALL_USAGE_KINDS) kinds[toDottedKind(kind)] = 0;
      for (const row of rows) kinds[toDottedKind(row.kind)] = row.quantity;

      const payload = { tenantId, month, kinds };
      await this.events.emit('usage.summary.finalised', payload);
      this.logger.log(`usage.summary.finalised ${JSON.stringify(payload)}`);
    }

    return { tenantsFinalised: byTenant.size };
  }
}
