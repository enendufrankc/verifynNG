import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { PrismaClient, ScanTier } from '@prisma/client';
import {
  createTestDatabase,
  dropTestSchema,
  disconnectTestHelper,
} from '@verifynng/db';
import { AnomalyEngine } from './anomaly-engine.service';
import { RulesService } from './rules/rules.service';
import { UnitLifecycleService } from '../units/unit-lifecycle.service';
import { AuditService } from '../audit/audit.service';

// Real Postgres (per-schema, via createTestDatabase). Exercises the engine
// end-to-end: scan rows in -> Anomaly + UnitStateTransition + emitted events.
describe('AnomalyEngine integration (real Postgres)', () => {
  let prisma: PrismaClient;
  let schemaName: string;
  let tenantId: string;
  let productId: string;
  let engine: AnomalyEngine;
  let events: EventEmitter2;
  let batchSerial = 0;
  let unitSerial = 0;

  beforeAll(async () => {
    const result = await createTestDatabase('anomaly-engine-integration');
    prisma = result.prisma;
    schemaName = result.schemaName;

    const tenant = await prisma.tenant.create({
      data: { slug: 'ae-tenant', name: 'AE Tenant' },
    });
    tenantId = tenant.id;
    const product = await prisma.product.create({
      data: { tenantId, sku: 'ae-sku', name: 'AE Product' },
    });
    productId = product.id;

    events = new EventEmitter2();
    const audit = new AuditService(prisma, events);
    const lifecycle = new UnitLifecycleService(prisma, events, audit, {
      add: vi.fn(),
    } as never);
    const rules = new RulesService(prisma);
    rules.onModuleInit();
    engine = new AnomalyEngine(prisma, rules, events, lifecycle);
  }, 30000);

  afterAll(async () => {
    await dropTestSchema(schemaName, prisma);
    await disconnectTestHelper();
  });

  async function makeBatch(
    status: string,
    expectedShipDate: Date | null = null,
  ) {
    batchSerial += 1;
    return prisma.batch.create({
      data: {
        tenantId,
        productId,
        count: 10,
        status: status as never,
        idempotencyKey: `ae-batch-${batchSerial}`,
        requestedBy: 'seed',
        watermark: 'wm',
        kid: 'k1',
        expectedShipDate,
      },
    });
  }

  async function makeUnit(batchId: string) {
    unitSerial += 1;
    return prisma.unit.create({
      data: {
        tenantId,
        batchId,
        productId,
        tier1Code: `ae-tier1-${unitSerial}`,
        tier2Hash: `ae-tier2-${unitSerial}`,
        serial: unitSerial,
      },
    });
  }

  async function scan(opts: {
    unitId: string;
    batchId: string;
    tier?: ScanTier;
    geoCity?: string | null;
    geoCountry?: string | null;
    ipHash?: string | null;
    createdAt?: Date;
  }) {
    return prisma.scanEvent.create({
      data: {
        tenantId,
        unitId: opts.unitId,
        batchId: opts.batchId,
        productId,
        tier: opts.tier ?? 'tier2',
        verdict: 'legit',
        source: 'qr',
        codeRedacted: 'redacted…',
        geoCity: opts.geoCity ?? null,
        geoCountry: opts.geoCountry ?? null,
        ipHash: opts.ipHash ?? null,
        createdAt: opts.createdAt ?? new Date(),
      },
    });
  }

  it('geo_dispersion: raises and auto-flags on the third distinct city', async () => {
    const batch = await makeBatch('shipped');
    const unit = await makeUnit(batch.id);

    const s1 = await scan({
      unitId: unit.id,
      batchId: batch.id,
      geoCity: 'Lagos',
      geoCountry: 'NG',
    });
    await engine.evaluate(s1.id);
    expect(
      await prisma.anomaly.count({
        where: { unitId: unit.id, rule: 'geo_dispersion' },
      }),
    ).toBe(0);

    const s2 = await scan({
      unitId: unit.id,
      batchId: batch.id,
      geoCity: 'Accra',
      geoCountry: 'GH',
    });
    await engine.evaluate(s2.id);
    expect(
      await prisma.anomaly.count({
        where: { unitId: unit.id, rule: 'geo_dispersion' },
      }),
    ).toBe(0);

    const s3 = await scan({
      unitId: unit.id,
      batchId: batch.id,
      geoCity: 'Nairobi',
      geoCountry: 'KE',
    });
    await engine.evaluate(s3.id);

    const anomaly = await prisma.anomaly.findFirst({
      where: { unitId: unit.id, rule: 'geo_dispersion' },
    });
    expect(anomaly?.score).toBe(60);

    const refreshed = await prisma.unit.findUniqueOrThrow({
      where: { id: unit.id },
    });
    expect(refreshed.state).toBe('flagged');
  });

  it('dead_code: raises and auto-flags for a tier-2 scan on an unshipped batch', async () => {
    const batch = await makeBatch('delivered');
    const unit = await makeUnit(batch.id);
    const s = await scan({
      unitId: unit.id,
      batchId: batch.id,
      geoCity: 'Lagos',
    });
    await engine.evaluate(s.id);

    const anomaly = await prisma.anomaly.findFirst({
      where: { unitId: unit.id, rule: 'dead_code' },
    });
    expect(anomaly?.score).toBe(70);
    const refreshed = await prisma.unit.findUniqueOrThrow({
      where: { id: unit.id },
    });
    expect(refreshed.state).toBe('flagged');
  });

  it('dead_code: does not fire once the batch has shipped', async () => {
    const batch = await makeBatch('shipped');
    const unit = await makeUnit(batch.id);
    const s = await scan({
      unitId: unit.id,
      batchId: batch.id,
      geoCity: 'Lagos',
    });
    await engine.evaluate(s.id);
    expect(
      await prisma.anomaly.count({
        where: { unitId: unit.id, rule: 'dead_code' },
      }),
    ).toBe(0);
  });

  it('pre_reveal: raises but never auto-flags (alert-only)', async () => {
    // status 'shipped' so dead_code (unshipped-batch rule) doesn't also fire
    // on this scan — isolates pre_reveal's own no-auto-flag behavior.
    const shipDate = new Date(Date.now() + 7 * 86_400_000);
    const batch = await makeBatch('shipped', shipDate);
    const unit = await makeUnit(batch.id);
    const s = await scan({
      unitId: unit.id,
      batchId: batch.id,
      geoCity: 'Lagos',
    });
    await engine.evaluate(s.id);

    const anomaly = await prisma.anomaly.findFirst({
      where: { unitId: unit.id, rule: 'pre_reveal' },
    });
    expect(anomaly?.score).toBe(50);
    const refreshed = await prisma.unit.findUniqueOrThrow({
      where: { id: unit.id },
    });
    expect(refreshed.state).toBe('active');
  });

  it('duplicate_first: raises and auto-flags for two scans far apart within the window', async () => {
    const batch = await makeBatch('shipped');
    const unit = await makeUnit(batch.id);
    const now = new Date();
    const s1 = await scan({
      unitId: unit.id,
      batchId: batch.id,
      geoCity: 'Lagos',
      createdAt: new Date(now.getTime() - 60_000),
    });
    await engine.evaluate(s1.id);
    const s2 = await scan({
      unitId: unit.id,
      batchId: batch.id,
      geoCity: 'Kano',
      createdAt: now,
    });
    await engine.evaluate(s2.id);

    const anomaly = await prisma.anomaly.findFirst({
      where: { unitId: unit.id, rule: 'duplicate_first' },
    });
    expect(anomaly?.score).toBe(80);
    const refreshed = await prisma.unit.findUniqueOrThrow({
      where: { id: unit.id },
    });
    expect(refreshed.state).toBe('flagged');
  });

  it('velocity: raises batch-scoped without flagging, then escalates on a second burst', async () => {
    const batch = await makeBatch('shipped');
    const ipHash = 'velocity-ip-1';
    const units = [];
    for (let i = 0; i < 25; i++) units.push(await makeUnit(batch.id));

    let lastId = '';
    for (const u of units) {
      const s = await scan({ unitId: u.id, batchId: batch.id, ipHash });
      lastId = s.id;
    }
    await engine.evaluate(lastId);

    let anomaly = await prisma.anomaly.findFirst({
      where: { rule: 'velocity', batchId: batch.id },
    });
    expect(anomaly?.score).toBe(40);
    expect(anomaly?.unitId).toBeNull();

    // Second burst of 25 more distinct units within the same window escalates it.
    const moreUnits = [];
    for (let i = 0; i < 25; i++) moreUnits.push(await makeUnit(batch.id));
    for (const u of moreUnits) {
      const s = await scan({ unitId: u.id, batchId: batch.id, ipHash });
      lastId = s.id;
    }
    await engine.evaluate(lastId);

    anomaly = await prisma.anomaly.findFirst({
      where: { rule: 'velocity', batchId: batch.id },
    });
    expect(anomaly?.score).toBe(80);
    expect(anomaly?.unitId).toBeNull(); // never auto-flags — no single unit to flag
  });

  it('is idempotent when the same scanEventId is evaluated twice (job retry safety)', async () => {
    const batch = await makeBatch('delivered');
    const unit = await makeUnit(batch.id);
    const s = await scan({
      unitId: unit.id,
      batchId: batch.id,
      geoCity: 'Lagos',
    });
    await engine.evaluate(s.id);
    await engine.evaluate(s.id);

    const anomalies = await prisma.anomaly.findMany({
      where: { unitId: unit.id, rule: 'dead_code' },
    });
    expect(anomalies).toHaveLength(1);
    expect(anomalies[0].score).toBe(70); // not escalated by the retry
  });
});
