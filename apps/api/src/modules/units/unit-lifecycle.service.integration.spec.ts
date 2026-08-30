import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { PrismaClient, Unit } from '@prisma/client';
import {
  createTestDatabase,
  dropTestSchema,
  disconnectTestHelper,
} from '@verifynng/db';
import { UnitLifecycleService } from './unit-lifecycle.service';
import { AuditService } from '../audit/audit.service';

// Real Postgres (per-schema, via createTestDatabase). The 'units' BullMQ
// queue is stubbed — recallBatch's queueing is asserted directly; the actual
// paged decommission logic is RecallProcessor's own concern.
describe('UnitLifecycleService integration (real Postgres)', () => {
  let prisma: PrismaClient;
  let schemaName: string;
  let tenantId: string;
  let otherTenantId: string;
  let batchId: string;
  let productId: string;
  let service: UnitLifecycleService;
  let queueAdd: ReturnType<typeof vi.fn>;
  let serial = 0;

  beforeAll(async () => {
    const result = await createTestDatabase('unit-lifecycle-integration');
    prisma = result.prisma;
    schemaName = result.schemaName;

    const tenant = await prisma.tenant.create({
      data: { slug: 'ul-tenant', name: 'UL Tenant' },
    });
    tenantId = tenant.id;
    const other = await prisma.tenant.create({
      data: { slug: 'ul-tenant-b', name: 'UL Tenant B' },
    });
    otherTenantId = other.id;

    const product = await prisma.product.create({
      data: { tenantId, sku: 'ul-sku', name: 'UL Product' },
    });
    productId = product.id;
    const batch = await prisma.batch.create({
      data: {
        tenantId,
        productId,
        count: 10,
        status: 'shipped',
        idempotencyKey: 'ul-1',
        requestedBy: 'seed',
        watermark: 'wm',
        kid: 'k1',
      },
    });
    batchId = batch.id;

    const events = new EventEmitter2();
    const audit = new AuditService(prisma, events);
    queueAdd = vi.fn(async () => ({ id: 'recall-job-1' }));
    service = new UnitLifecycleService(prisma, events, audit, {
      add: queueAdd,
    } as never);
  }, 30000);

  afterAll(async () => {
    await dropTestSchema(schemaName, prisma);
    await disconnectTestHelper();
  });

  async function makeUnit(): Promise<Unit> {
    serial += 1;
    return prisma.unit.create({
      data: {
        tenantId,
        batchId,
        productId,
        tier1Code: `ul-tier1-${serial}`,
        tier2Hash: `ul-tier2-${serial}`,
        serial,
      },
    });
  }

  it('flags an active unit and records the transition', async () => {
    const unit = await makeUnit();
    const flagged = await service.flag(tenantId, unit.id, {
      actor: { type: 'user', id: 'user-1' },
      reason: 'test',
    });
    expect(flagged.state).toBe('flagged');

    const transitions = await prisma.unitStateTransition.findMany({
      where: { unitId: unit.id },
    });
    expect(transitions).toHaveLength(1);
    expect(transitions[0]).toMatchObject({
      fromState: 'active',
      toState: 'flagged',
      reason: 'test',
    });
  });

  it('rejects flagging a unit that is not active', async () => {
    const unit = await makeUnit();
    await service.flag(tenantId, unit.id, {
      actor: { type: 'user' },
      reason: 'first',
    });
    await expect(
      service.flag(tenantId, unit.id, {
        actor: { type: 'user' },
        reason: 'second',
      }),
    ).rejects.toMatchObject({ status: 409 });
  });

  it('decommissions a flagged unit, then restores it', async () => {
    const unit = await makeUnit();
    await service.flag(tenantId, unit.id, {
      actor: { type: 'user' },
      reason: 'flag',
    });
    const decommissioned = await service.decommission(tenantId, unit.id, {
      actor: { type: 'user' },
      reason: 'decommission',
    });
    expect(decommissioned.state).toBe('decommissioned');

    const restored = await service.restore(tenantId, unit.id, {
      actor: { type: 'user' },
      reason: 'restore with reason',
    });
    expect(restored.state).toBe('active');

    const transitions = await prisma.unitStateTransition.findMany({
      where: { unitId: unit.id },
      orderBy: { createdAt: 'asc' },
    });
    expect(transitions.map((t) => t.toState)).toEqual([
      'flagged',
      'decommissioned',
      'active',
    ]);
  });

  it('rejects decommissioning an already-decommissioned unit', async () => {
    const unit = await makeUnit();
    await service.decommission(tenantId, unit.id, {
      actor: { type: 'user' },
      reason: 'first',
    });
    await expect(
      service.decommission(tenantId, unit.id, {
        actor: { type: 'user' },
        reason: 'second',
      }),
    ).rejects.toMatchObject({ status: 409 });
  });

  it('rejects restoring an active unit', async () => {
    const unit = await makeUnit();
    await expect(
      service.restore(tenantId, unit.id, {
        actor: { type: 'user' },
        reason: 'noop',
      }),
    ).rejects.toMatchObject({ status: 409 });
  });

  it('never resolves a unit belonging to another tenant (404, not 409)', async () => {
    const unit = await makeUnit();
    await expect(
      service.flag(otherTenantId, unit.id, {
        actor: { type: 'user' },
        reason: 'cross-tenant',
      }),
    ).rejects.toMatchObject({ status: 404 });
  });

  it('records its own audit row for system-actor transitions (auto-flag path)', async () => {
    const unit = await makeUnit();
    await service.flag(tenantId, unit.id, {
      actor: { type: 'system' },
      reason: 'auto-flagged: test',
      anomalyId: 'anomaly-1',
    });

    const audits = await prisma.auditLog.findMany({
      where: {
        tenantId,
        targetType: 'unit',
        targetId: unit.id,
        action: 'unit.flag',
      },
    });
    expect(audits).toHaveLength(1);
    expect(audits[0].actorType).toBe('system');
  });

  it('skips its own audit row when the caller already recorded one (recall path)', async () => {
    const unit = await makeUnit();
    await service.decommission(tenantId, unit.id, {
      actor: { type: 'system' },
      reason: 'batch recall',
      recallJobId: 'job-x',
      skipAudit: true,
    });

    const audits = await prisma.auditLog.findMany({
      where: {
        tenantId,
        targetType: 'unit',
        targetId: unit.id,
        action: 'unit.decommission',
      },
    });
    expect(audits).toHaveLength(0);

    const transition = await prisma.unitStateTransition.findFirst({
      where: { unitId: unit.id },
    });
    expect(transition?.recallJobId).toBe('job-x');
  });

  it('enqueues a recall job for the batch', async () => {
    const result = await service.recallBatch(tenantId, batchId, {
      actor: { type: 'user', id: 'owner-1' },
      reason: 'recall test',
    });
    expect(result.jobId).toBe('recall-job-1');
    expect(queueAdd).toHaveBeenCalledWith('recall', {
      tenantId,
      batchId,
      reason: 'recall test',
      actorType: 'user',
      actorId: 'owner-1',
    });
  });

  it('404s recalling a batch from another tenant', async () => {
    await expect(
      service.recallBatch(otherTenantId, batchId, {
        actor: { type: 'user' },
        reason: 'x',
      }),
    ).rejects.toMatchObject({ status: 404 });
  });
});
