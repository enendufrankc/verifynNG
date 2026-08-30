/**
 * Dev-only anomaly test surface. Present only when NODE_ENV !== 'production'.
 * `seed-scans` back-fills ScanEvent rows directly (bypassing the live verify
 * path) so sweep tests can plant dated evidence without waiting real days —
 * a stand-in for E06's not-yet-built dev scan-replay endpoint (see the
 * comment on E06's issue). `sweep` runs both repeatable sweeps synchronously
 * so a test can assert on the result immediately instead of polling a queue.
 */
import { Body, Controller, Post } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { Public } from '../../common/tenant';
import { RulesService } from './rules/rules.service';
import { AnomalyEngine } from './anomaly-engine.service';
import { runGeoDispersionSweep } from './sweeps/geo-dispersion.sweep';
import { runDeadCodeSweep } from './sweeps/dead-code.sweep';

interface SeedScanDto {
  tenantId: string;
  unitId: string;
  batchId?: string;
  createdAt: string;
  geoCity: string;
  geoCountry?: string;
}

@Controller('v1/_dev/anomaly')
@Public()
export class DevAnomalyController {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly rules: RulesService,
    private readonly engine: AnomalyEngine,
  ) {}

  @Post('seed-scans')
  async seedScans(@Body() body: { scans: SeedScanDto[] }) {
    const created = [];
    for (const s of body.scans) {
      const unit = await this.prisma.unit.findUnique({
        where: { id: s.unitId },
      });
      const row = await this.prisma.scanEvent.create({
        data: {
          tenantId: s.tenantId,
          unitId: s.unitId,
          batchId: s.batchId ?? unit?.batchId ?? null,
          productId: unit?.productId ?? null,
          tier: 'tier2',
          verdict: 'legit',
          source: 'api',
          codeRedacted: 'seeded…',
          geoCity: s.geoCity,
          geoCountry: s.geoCountry ?? null,
          createdAt: new Date(s.createdAt),
        },
      });
      created.push(row.id);
    }
    return { created };
  }

  @Post('sweep')
  async sweep() {
    await runGeoDispersionSweep(this.prisma, this.rules, this.engine);
    await runDeadCodeSweep(this.prisma, this.rules, this.engine);
    return { ok: true };
  }
}
