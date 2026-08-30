import { Injectable } from '@nestjs/common';
import { Anomaly, AnomalyStatus, PrismaClient } from '@prisma/client';

export interface AnomalySummary {
  open: number;
  acknowledged: number;
  byRule: Record<string, number>;
}

/**
 * Read-only anomaly lookups shared across E07's own API and consumers in
 * other epics (E08 report detail, E12 analytics) — kept in its own module so
 * it has no dependency on the rest of AnomalyModule (BullMQ, rules) and can
 * be imported by UnitsModule without a circular module graph.
 */
@Injectable()
export class AnomalyQueryService {
  constructor(private readonly prisma: PrismaClient) {}

  forUnit(unitId: string): Promise<Anomaly[]> {
    return this.prisma.anomaly.findMany({
      where: { unitId },
      orderBy: { createdAt: 'desc' },
    });
  }

  forBatch(batchId: string): Promise<Anomaly[]> {
    return this.prisma.anomaly.findMany({
      where: { batchId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async summary(tenantId: string): Promise<AnomalySummary> {
    const [open, acknowledged, byRuleRows] = await Promise.all([
      this.prisma.anomaly.count({
        where: { tenantId, status: 'open' as AnomalyStatus },
      }),
      this.prisma.anomaly.count({
        where: { tenantId, status: 'acknowledged' as AnomalyStatus },
      }),
      this.prisma.anomaly.groupBy({
        by: ['rule'],
        where: { tenantId, status: { in: ['open', 'acknowledged'] } },
        _count: { rule: true },
      }),
    ]);

    const byRule: Record<string, number> = {};
    for (const row of byRuleRows) byRule[row.rule] = row._count.rule;

    return { open, acknowledged, byRule };
  }
}
