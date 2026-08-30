import { PrismaClient } from '@prisma/client';
import { RulesService } from '../rules/rules.service';
import { evaluateGeoDispersion } from '../rules/pure-rules';
import { asThresholds } from '../rules/rule-types';
import { AnomalyEngine } from '../anomaly-engine.service';

/**
 * Catches slow-burn geo dispersion that never crossed the threshold on any
 * single `scan.recorded` evaluation (e.g. scans arrived one per day, so the
 * event-triggered check never saw more than one new city at a time).
 */
export async function runGeoDispersionSweep(
  prisma: PrismaClient,
  rules: RulesService,
  engine: AnomalyEngine,
): Promise<void> {
  const tenants = await prisma.tenant.findMany({ select: { id: true } });

  for (const tenant of tenants) {
    const effective = await rules.effective(tenant.id);
    if (!effective.geo_dispersion.enabled) continue;
    const { distinctCities, windowDays } = effective.geo_dispersion.thresholds;
    const windowStart = new Date(Date.now() - windowDays * 86_400_000);

    const hits = await prisma.$queryRaw<Array<{ unitId: string }>>`
      SELECT "unitId"
      FROM "ScanEvent"
      WHERE "tenantId" = ${tenant.id}
        AND "tier" = 'tier2'
        AND "unitId" IS NOT NULL
        AND "geoCity" IS NOT NULL
        AND "createdAt" >= ${windowStart}
      GROUP BY "unitId"
      HAVING COUNT(DISTINCT "geoCity") >= ${distinctCities}
    `;

    for (const { unitId } of hits) {
      const scansForUnit = await prisma.scanEvent.findMany({
        where: { unitId, tier: 'tier2', createdAt: { gte: windowStart } },
        orderBy: { createdAt: 'asc' },
      });
      const result = evaluateGeoDispersion(
        scansForUnit.map((s) => ({
          scanEventId: s.id,
          geoCity: s.geoCity,
          geoCountry: s.geoCountry,
          createdAt: s.createdAt,
        })),
        asThresholds<{ distinctCities: number; windowDays: number }>(
          effective.geo_dispersion.thresholds,
        ),
        new Date(),
      );
      if (!result) continue;

      const unit = await prisma.unit.findUnique({
        where: { id: unitId },
        select: { batchId: true },
      });

      await engine.upsertAnomaly({
        tenantId: tenant.id,
        rule: 'geo_dispersion',
        unitId,
        batchId: unit?.batchId ?? null,
        keyPart: unitId,
        source: 'sweep',
        score: effective.geo_dispersion.score,
        autoFlagAt: effective.geo_dispersion.autoFlagAt,
        at: new Date(),
        scans: result.cities.map((c) => ({
          scanEventId: c.scanEventId,
          at: c.at,
          city: c.city,
          country: c.country,
        })),
        thresholds: effective.geo_dispersion.thresholds,
        summary: `Verified from ${result.cities.length} distinct cities within the window (sweep)`,
      });
    }
  }
}
