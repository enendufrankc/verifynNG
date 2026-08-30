import { Inject, Injectable } from '@nestjs/common';
import { Prisma, PrismaClient, ScanRollupDaily } from '@prisma/client';

export interface ScanRollupKey {
  tenantId: string;
  date: Date;
  productId: string | null;
  batchId: string | null;
  tier: number;
  verdict: string;
}

/**
 * `@@unique([tenantId, date, productId, batchId, tier, verdict])` is a
 * Postgres unique index over nullable columns — Postgres treats every NULL
 * as distinct, so it never actually dedupes rows where productId/batchId are
 * null (and Prisma's generated compound-unique WhereUniqueInput doesn't even
 * accept null for those fields). Rows with a null productId/batchId — the
 * rate-limited aggregate row, batch-less scans — are found/created with an
 * explicit findFirst instead. Not atomic for that path; safe because the
 * only concurrent writers are the (single-flight-locked) incremental job,
 * the nightly reconcile job, and the rare live counter subscriber.
 */
@Injectable()
export class ScanRollupRowRepository {
  constructor(@Inject('PRISMA') private readonly prisma: PrismaClient) {}

  async findOrCreate(key: ScanRollupKey): Promise<ScanRollupDaily> {
    if (key.productId !== null && key.batchId !== null) {
      return this.prisma.scanRollupDaily.upsert({
        where: {
          tenantId_date_productId_batchId_tier_verdict: {
            tenantId: key.tenantId,
            date: key.date,
            productId: key.productId,
            batchId: key.batchId,
            tier: key.tier,
            verdict: key.verdict,
          },
        },
        create: { ...key, count: 0, distinctIpCount: 0, topCountries: [] },
        update: {},
      });
    }

    const existing = await this.prisma.scanRollupDaily.findFirst({
      where: key,
    });
    if (existing) return existing;
    return this.prisma.scanRollupDaily.create({
      data: { ...key, count: 0, distinctIpCount: 0, topCountries: [] },
    });
  }
}

export function toInputJson(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}
