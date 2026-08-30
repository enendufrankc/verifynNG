import { Inject, Injectable } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import type { TopCountry } from '../rollup/aggregate-scan-events';
import { rangeWindows, type RangeKey } from '../range.util';

export interface OverviewMetrics {
  scans: number;
  tier1Scans: number;
  tier2Verifies: number;
  suspiciousPct: number;
  flaggedUnits: number;
  distinctCountries: number;
}

export interface OverviewResponse extends OverviewMetrics {
  deltas: OverviewMetrics;
}

export interface BatchRow {
  batchId: string;
  productId: string | null;
  scans: number;
  tier2Verifies: number;
  suspicious: number;
  flagged: number;
  topCountry: string | null;
}

export interface ProductRow {
  productId: string;
  scans: number;
  tier2Verifies: number;
  suspicious: number;
  flagged: number;
  topCountry: string | null;
}

export interface GeoRow {
  country: string;
  city?: string;
  scans: number;
  tier2Verifies: number;
  suspicious: number;
}

export interface VerdictSeriesPoint {
  date: string; // YYYY-MM-DD
  verdict: string;
  count: number;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Reads ONLY the E12 rollup tables — never ScanEvent. See
 * scan-rollup-guard.spec.ts, which fails the build if that stops being true.
 */
@Injectable()
export class AnalyticsReadService {
  constructor(@Inject('PRISMA') private readonly prisma: PrismaClient) {}

  async overview(tenantId: string, range: RangeKey): Promise<OverviewResponse> {
    const { start, end, priorStart, priorEnd } = rangeWindows(range);
    const [current, prior] = await Promise.all([
      this.windowMetrics(tenantId, start, end),
      this.windowMetrics(tenantId, priorStart, priorEnd),
    ]);
    return {
      ...current,
      deltas: {
        scans: current.scans - prior.scans,
        tier1Scans: current.tier1Scans - prior.tier1Scans,
        tier2Verifies: current.tier2Verifies - prior.tier2Verifies,
        suspiciousPct: round2(current.suspiciousPct - prior.suspiciousPct),
        flaggedUnits: current.flaggedUnits - prior.flaggedUnits,
        distinctCountries: current.distinctCountries - prior.distinctCountries,
      },
    };
  }

  private async windowMetrics(
    tenantId: string,
    start: Date,
    end: Date,
  ): Promise<OverviewMetrics> {
    const rows = await this.prisma.scanRollupDaily.findMany({
      where: { tenantId, date: { gte: start, lt: end } },
    });

    let scans = 0;
    let tier1Scans = 0;
    let tier2Verifies = 0;
    let suspicious = 0;
    let flaggedUnits = 0;
    const countries = new Set<string>();

    for (const r of rows) {
      scans += r.count;
      if (r.tier === 1) tier1Scans += r.count;
      if (r.tier === 2) tier2Verifies += r.count;
      if (r.verdict === 'suspicious') suspicious += r.count;
      flaggedUnits += r.flaggedUnits;
      for (const c of r.topCountries as unknown as TopCountry[])
        countries.add(c.country);
    }

    return {
      scans,
      tier1Scans,
      tier2Verifies,
      suspiciousPct: scans > 0 ? round2((suspicious / scans) * 100) : 0,
      flaggedUnits,
      distinctCountries: countries.size,
    };
  }

  async byBatch(
    tenantId: string,
    range: RangeKey,
    sort?: string,
  ): Promise<BatchRow[]> {
    const { start, end } = rangeWindows(range);
    const [batches, rows] = await Promise.all([
      this.prisma.batch.findMany({
        where: { tenantId },
        select: { id: true, productId: true },
      }),
      this.prisma.scanRollupDaily.findMany({
        where: {
          tenantId,
          date: { gte: start, lt: end },
          batchId: { not: null },
        },
      }),
    ]);

    const byBatch = new Map<
      string,
      {
        productId: string | null;
        scans: number;
        tier2Verifies: number;
        suspicious: number;
        flagged: number;
        countries: Map<string, number>;
      }
    >();
    // Every one of the tenant's batches gets a row, even with zero scans in
    // range — CSV export row count must match the batches table (AC7).
    for (const batch of batches) {
      byBatch.set(batch.id, {
        productId: batch.productId,
        scans: 0,
        tier2Verifies: 0,
        suspicious: 0,
        flagged: 0,
        countries: new Map(),
      });
    }
    for (const r of rows) {
      const key = r.batchId as string;
      let b = byBatch.get(key);
      if (!b) {
        b = {
          productId: r.productId,
          scans: 0,
          tier2Verifies: 0,
          suspicious: 0,
          flagged: 0,
          countries: new Map(),
        };
        byBatch.set(key, b);
      }
      b.scans += r.count;
      if (r.tier === 2) b.tier2Verifies += r.count;
      if (r.verdict === 'suspicious') b.suspicious += r.count;
      b.flagged += r.flaggedUnits;
      for (const c of r.topCountries as unknown as TopCountry[]) {
        b.countries.set(c.country, (b.countries.get(c.country) ?? 0) + c.count);
      }
    }

    const result: BatchRow[] = [...byBatch.entries()].map(([batchId, b]) => ({
      batchId,
      productId: b.productId,
      scans: b.scans,
      tier2Verifies: b.tier2Verifies,
      suspicious: b.suspicious,
      flagged: b.flagged,
      topCountry: topEntry(b.countries),
    }));
    return sortRows(result, sort, 'scans');
  }

  async byProduct(
    tenantId: string,
    range: RangeKey,
    sort?: string,
  ): Promise<ProductRow[]> {
    const { start, end } = rangeWindows(range);
    const [products, rows] = await Promise.all([
      this.prisma.product.findMany({
        where: { tenantId },
        select: { id: true },
      }),
      this.prisma.scanRollupDaily.findMany({
        where: {
          tenantId,
          date: { gte: start, lt: end },
          productId: { not: null },
        },
      }),
    ]);

    const byProduct = new Map<
      string,
      {
        scans: number;
        tier2Verifies: number;
        suspicious: number;
        flagged: number;
        countries: Map<string, number>;
      }
    >();
    for (const product of products) {
      byProduct.set(product.id, {
        scans: 0,
        tier2Verifies: 0,
        suspicious: 0,
        flagged: 0,
        countries: new Map(),
      });
    }
    for (const r of rows) {
      const key = r.productId as string;
      let p = byProduct.get(key);
      if (!p) {
        p = {
          scans: 0,
          tier2Verifies: 0,
          suspicious: 0,
          flagged: 0,
          countries: new Map(),
        };
        byProduct.set(key, p);
      }
      p.scans += r.count;
      if (r.tier === 2) p.tier2Verifies += r.count;
      if (r.verdict === 'suspicious') p.suspicious += r.count;
      p.flagged += r.flaggedUnits;
      for (const c of r.topCountries as unknown as TopCountry[]) {
        p.countries.set(c.country, (p.countries.get(c.country) ?? 0) + c.count);
      }
    }

    const result: ProductRow[] = [...byProduct.entries()].map(
      ([productId, p]) => ({
        productId,
        scans: p.scans,
        tier2Verifies: p.tier2Verifies,
        suspicious: p.suspicious,
        flagged: p.flagged,
        topCountry: topEntry(p.countries),
      }),
    );
    return sortRows(result, sort, 'scans');
  }

  async geo(
    tenantId: string,
    range: RangeKey,
    groupBy: 'country' | 'city' = 'country',
    entity?: { batchId?: string; productId?: string },
  ): Promise<GeoRow[]> {
    const { start, end } = rangeWindows(range);
    const rows = await this.prisma.scanRollupDaily.findMany({
      where: {
        tenantId,
        date: { gte: start, lt: end },
        ...(entity?.batchId ? { batchId: entity.batchId } : {}),
        ...(entity?.productId ? { productId: entity.productId } : {}),
      },
    });

    const totals = new Map<string, GeoRow>();
    for (const r of rows) {
      for (const c of r.topCountries as unknown as TopCountry[]) {
        if (groupBy === 'city' && !c.city) continue;
        const key = groupBy === 'city' ? `${c.country}|${c.city}` : c.country;
        let t = totals.get(key);
        if (!t) {
          t = {
            country: c.country,
            city: groupBy === 'city' ? c.city : undefined,
            scans: 0,
            tier2Verifies: 0,
            suspicious: 0,
          };
          totals.set(key, t);
        }
        t.scans += c.count;
        if (r.tier === 2) t.tier2Verifies += c.count;
        if (r.verdict === 'suspicious') t.suspicious += c.count;
      }
    }
    return [...totals.values()].sort((a, b) => b.scans - a.scans);
  }

  async verdictSeries(
    tenantId: string,
    range: RangeKey,
    entity?: { batchId?: string; productId?: string },
  ): Promise<VerdictSeriesPoint[]> {
    const { start, end } = rangeWindows(range);
    const groups = await this.prisma.scanRollupDaily.groupBy({
      by: ['date', 'verdict'],
      where: {
        tenantId,
        date: { gte: start, lt: end },
        ...(entity?.batchId ? { batchId: entity.batchId } : {}),
        ...(entity?.productId ? { productId: entity.productId } : {}),
      },
      _sum: { count: true },
    });
    return groups
      .map((g) => ({
        date: g.date.toISOString().slice(0, 10),
        verdict: g.verdict,
        count: g._sum.count ?? 0,
      }))
      .sort((a, b) =>
        a.date === b.date
          ? a.verdict.localeCompare(b.verdict)
          : a.date.localeCompare(b.date),
      );
  }
}

function topEntry(counts: Map<string, number>): string | null {
  let best: string | null = null;
  let bestCount = -1;
  for (const [country, count] of counts) {
    if (count > bestCount) {
      best = country;
      bestCount = count;
    }
  }
  return best;
}

function sortRows<T extends { scans: number }>(
  rows: T[],
  sort: string | undefined,
  defaultKey: keyof T,
): T[] {
  const key = (sort as keyof T | undefined) ?? defaultKey;
  return [...rows].sort((a, b) => {
    const av = a[key];
    const bv = b[key];
    if (typeof av === 'number' && typeof bv === 'number') return bv - av;
    return String(bv).localeCompare(String(av));
  });
}
