import { PrismaClient } from '@prisma/client';
import { RulesService } from '../rules/rules.service';
import { AnomalyEngine } from '../anomaly-engine.service';

/**
 * Catches tier-2 scans that arrived before the batch's status caught up
 * (e.g. E05 hadn't yet marked the batch `shipped` when the live check ran).
 * One hit per unit per sweep run, deduped like everything else through
 * `AnomalyEngine.upsertAnomaly`.
 */
export async function runDeadCodeSweep(
  prisma: PrismaClient,
  rules: RulesService,
  engine: AnomalyEngine,
): Promise<void> {
  const tenants = await prisma.tenant.findMany({ select: { id: true } });

  for (const tenant of tenants) {
    const effective = await rules.effective(tenant.id);
    if (!effective.dead_code.enabled) continue;

    const openBatches = await prisma.batch.findMany({
      where: { tenantId: tenant.id, status: { notIn: ['shipped', 'closed'] } },
      select: { id: true, status: true },
    });
    if (openBatches.length === 0) continue;
    const statusByBatch = new Map(openBatches.map((b) => [b.id, b.status]));

    const scans = await prisma.scanEvent.findMany({
      where: {
        tenantId: tenant.id,
        tier: 'tier2',
        batchId: { in: [...statusByBatch.keys()] },
        unitId: { not: null },
      },
      distinct: ['unitId'],
      orderBy: { createdAt: 'desc' },
    });

    for (const scan of scans) {
      if (!scan.unitId) continue;
      await engine.upsertAnomaly({
        tenantId: tenant.id,
        rule: 'dead_code',
        unitId: scan.unitId,
        batchId: scan.batchId,
        keyPart: scan.unitId,
        source: 'sweep',
        score: effective.dead_code.score,
        autoFlagAt: effective.dead_code.autoFlagAt,
        at: new Date(),
        scans: [
          {
            scanEventId: scan.id,
            at: scan.createdAt,
            city: scan.geoCity,
            country: scan.geoCountry,
          },
        ],
        computed: { batchStatus: statusByBatch.get(scan.batchId!) },
        thresholds: effective.dead_code.thresholds,
        summary: `Tier-2 code scanned while batch is '${statusByBatch.get(scan.batchId!)}' (sweep)`,
      });
    }
  }
}
