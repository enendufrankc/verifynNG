import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { PrismaClient } from '@prisma/client';
import {
  createTestDatabase,
  dropTestSchema,
  disconnectTestHelper,
} from '@verifynng/db';
import { EventsService } from '../../../common/events.service';
import { ScanRollupRowRepository } from '../rollup/scan-rollup-row.repository';
import { ScanRollupJobService } from './scan-rollup.service';
import { ReconcileService } from './reconcile.service';

describe('Scan rollup integration (real Postgres)', () => {
  let prisma: PrismaClient;
  let schemaName: string;
  let tenantId: string;
  let scanRollup: ScanRollupJobService;
  let reconcile: ReconcileService;

  beforeAll(async () => {
    const result = await createTestDatabase('rollup-integration');
    prisma = result.prisma;
    schemaName = result.schemaName;

    const t = await prisma.tenant.create({
      data: {
        slug: 'rollup-integration-tenant',
        name: 'Rollup Integration Tenant',
      },
    });
    tenantId = t.id;

    scanRollup = new ScanRollupJobService(
      prisma,
      new ScanRollupRowRepository(prisma),
    );
    reconcile = new ReconcileService(
      prisma,
      scanRollup,
      new EventsService(new EventEmitter2()),
    );
  }, 30000);

  afterAll(async () => {
    await dropTestSchema(schemaName, prisma);
    await disconnectTestHelper();
  });

  async function makeScanEvent(
    overrides: Partial<{
      createdAt: Date;
      tier: 'tier1' | 'tier2';
      verdict: string;
      ipHash: string;
      geoCountry: string;
    }> = {},
  ) {
    return prisma.scanEvent.create({
      data: {
        tenantId,
        tier: overrides.tier ?? 'tier2',
        verdict: overrides.verdict ?? 'authentic',
        codeRedacted: 'ivoryglow.2.k1.xxxx…',
        ipHash: overrides.ipHash ?? 'ip-1',
        geoCountry: overrides.geoCountry ?? 'NG',
        createdAt: overrides.createdAt ?? new Date(),
      },
    });
  }

  it('incremental rollup: sum(count) equals count(ScanEvent) for the tenant', async () => {
    await makeScanEvent({ verdict: 'authentic' });
    await makeScanEvent({ verdict: 'authentic' });
    await makeScanEvent({ verdict: 'suspicious' });

    const result = await scanRollup.runIncremental();
    expect(result.eventsProcessed).toBeGreaterThanOrEqual(3);

    const [rollupSum, eventCount] = await Promise.all([
      prisma.scanRollupDaily.aggregate({
        where: { tenantId },
        _sum: { count: true },
      }),
      prisma.scanEvent.count({ where: { tenantId } }),
    ]);
    expect(rollupSum._sum.count).toBe(eventCount);
  });

  it('is idempotent: running again with no new events writes nothing', async () => {
    const result = await scanRollup.runIncremental();
    expect(result.eventsProcessed).toBe(0);
    expect(result.rowsWritten).toBe(0);
  });

  it('reconcile corrects a late-arriving event backdated into an already-rolled-up day', async () => {
    const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
    await makeScanEvent({ createdAt: twoDaysAgo, verdict: 'authentic' });
    // Establish the baseline via reconcile (not runIncremental): its checkpoint
    // has already moved past `twoDaysAgo` from earlier tests in this file, so
    // an incremental pass would never pick this backdated event up at all —
    // that gap is exactly what the nightly reconcile exists to close.
    await reconcile.run();

    const before = await prisma.scanRollupDaily.aggregate({
      where: { tenantId },
      _sum: { count: true },
    });

    // A second "late" event lands with a createdAt inside the same
    // already-rolled-up day — out-of-order delivery, corrected on the next
    // reconcile pass.
    await makeScanEvent({ createdAt: twoDaysAgo, verdict: 'authentic' });

    const reconcileResult = await reconcile.run();
    expect(reconcileResult.rowsWritten).toBeGreaterThan(0);

    const after = await prisma.scanRollupDaily.aggregate({
      where: { tenantId },
      _sum: { count: true },
    });
    expect(after._sum.count).toBe((before._sum.count ?? 0) + 1);
  });

  it('produces the same rollups as a from-scratch rebuild of the same day', async () => {
    const day = new Date('2026-08-20T12:00:00.000Z');
    await makeScanEvent({
      createdAt: day,
      verdict: 'authentic',
      ipHash: 'ip-a',
    });
    await makeScanEvent({
      createdAt: day,
      verdict: 'authentic',
      ipHash: 'ip-b',
    });
    await makeScanEvent({ createdAt: day, verdict: 'flagged', ipHash: 'ip-a' });

    await scanRollup.recomputeDay(tenantId, day);
    const first = await prisma.scanRollupDaily.findMany({
      where: { tenantId, date: new Date('2026-08-20T00:00:00.000Z') },
      orderBy: { verdict: 'asc' },
    });

    // Rebuild from scratch again — must converge to the same counts.
    await scanRollup.recomputeDay(tenantId, day);
    const second = await prisma.scanRollupDaily.findMany({
      where: { tenantId, date: new Date('2026-08-20T00:00:00.000Z') },
      orderBy: { verdict: 'asc' },
    });

    expect(
      second.map((r) => ({
        verdict: r.verdict,
        count: r.count,
        distinctIpCount: r.distinctIpCount,
      })),
    ).toEqual(
      first.map((r) => ({
        verdict: r.verdict,
        count: r.count,
        distinctIpCount: r.distinctIpCount,
      })),
    );
  });
});
