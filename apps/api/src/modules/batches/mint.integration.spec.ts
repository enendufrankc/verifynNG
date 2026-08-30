import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { HttpException } from '@nestjs/common';
import type { PrismaClient } from '@prisma/client';
import {
  createTestDatabase,
  dropTestSchema,
  disconnectTestHelper,
} from '@verifynng/db';
import { parseCode, deriveBatchWatermark, watermarkOf } from '@verifynng/core';
import { loadEnv } from '@verifynng/config';
import { MintService } from './mint.service';
import { ManifestService } from './manifest.service';
import { S3Service } from '../../common/s3.service';
import { EventsService } from '../../common/events.service';
import {
  AllowAllEntitlementPolicy,
  DenyAboveEntitlementPolicy,
  type EntitlementPolicy,
} from './entitlement.policy';

// Real Postgres (per-schema, via createTestDatabase) and real MinIO (this
// worktree's compose stack). BullMQ queues are faked: this suite only
// exercises the synchronous mint path (count <= MINT_SYNC_MAX), so nothing
// should ever be enqueued to 'mint', and enqueuing to 'batch-exports' is
// stubbed out so the live api-worker container never picks up a job for a
// batch that lives in an isolated test schema it can't see.

describe('MintService integration (real Postgres + MinIO)', () => {
  let prisma: PrismaClient;
  let schemaName: string;
  let tenantId: string;
  let productId: string;
  let oemId: string;
  let manifestService: ManifestService;
  let events: EventsService;

  beforeAll(async () => {
    const result = await createTestDatabase('mint-integration');
    prisma = result.prisma;
    schemaName = result.schemaName;

    const t = await prisma.tenant.create({
      data: {
        slug: 'mint-integration-tenant',
        name: 'Mint Integration Tenant',
      },
    });
    tenantId = t.id;
    const p = await prisma.product.create({
      data: { tenantId, sku: 'mint-int-sku', name: 'Mint Integration Product' },
    });
    productId = p.id;
    const o = await prisma.oem.create({
      data: { tenantId, name: 'Mint Integration OEM' },
    });
    oemId = o.id;

    const s3 = new S3Service();
    events = new EventsService(new EventEmitter2());
    manifestService = new ManifestService(prisma, s3);
  }, 30000);

  afterAll(async () => {
    await dropTestSchema(schemaName, prisma);
    await disconnectTestHelper();
  });

  function mintService(
    policy: EntitlementPolicy = new AllowAllEntitlementPolicy(),
  ): MintService {
    return new MintService(
      prisma,
      policy,
      manifestService,
      events,
      { add: vi.fn(async () => ({ id: 'job-1' })) } as never,
      { add: vi.fn(async () => ({ id: 'export-1' })) } as never,
    );
  }

  it('mints synchronously, hashes tier-2, and produces a verifiable manifest', async () => {
    const service = mintService();
    const result = await service.mint({
      tenantId,
      productId,
      oemId,
      count: 25,
      idempotencyKey: 'int-sync-25',
      requestedBy: 'owner-1',
    });

    expect(result.mode).toBe('sync');
    expect(result.batch.status).toBe('minted');

    const units = await prisma.unit.findMany({
      where: { batchId: result.batch.id },
      orderBy: { serial: 'asc' },
    });
    expect(units).toHaveLength(25);
    for (const u of units) {
      expect(u.tier2Hash).toMatch(/^[0-9a-f]{64}$/);
      // The raw tier-2 code is never persisted anywhere outside the manifest.
      expect(u.tier2Hash).not.toContain('.');
    }

    const manifest = await manifestService.open(result.batch.id);
    expect(manifest.units).toHaveLength(25);
  }, 30000);

  it('idempotency: repeat POST returns the existing batch with no new units', async () => {
    const key = 'int-idem-same';
    const first = await mintService().mint({
      tenantId,
      productId,
      oemId,
      count: 10,
      idempotencyKey: key,
      requestedBy: 'owner-1',
    });
    const second = await mintService().mint({
      tenantId,
      productId,
      oemId,
      count: 10,
      idempotencyKey: key,
      requestedBy: 'owner-1',
    });

    expect(second.existing).toBe(true);
    expect(second.batch.id).toBe(first.batch.id);
    const count = await prisma.unit.count({
      where: { batchId: first.batch.id },
    });
    expect(count).toBe(10);
  }, 30000);

  it('idempotency conflict: same key with a different count is rejected', async () => {
    const key = 'int-idem-conflict';
    await mintService().mint({
      tenantId,
      productId,
      oemId,
      count: 5,
      idempotencyKey: key,
      requestedBy: 'owner-1',
    });

    await expect(
      mintService().mint({
        tenantId,
        productId,
        oemId,
        count: 6,
        idempotencyKey: key,
        requestedBy: 'owner-1',
      }),
    ).rejects.toThrow();
  }, 30000);

  it('watermark traceability: every unit carries the batch watermark', async () => {
    const env = loadEnv();
    const result = await mintService().mint({
      tenantId,
      productId,
      oemId,
      count: 10,
      idempotencyKey: 'int-watermark',
      requestedBy: 'owner-1',
    });

    const units = await prisma.unit.findMany({
      where: { batchId: result.batch.id },
    });
    for (const u of units) {
      const parsed = parseCode(u.tier1Code);
      expect(parsed).not.toBeNull();
      expect(watermarkOf(parsed!)).toBe(result.batch.watermark);
    }

    const { StaticKeyRing } = await import('@verifynng/core');
    const ring = new StaticKeyRing(env.CORE_KEYS, env.CORE_ACTIVE_KID);
    expect(
      deriveBatchWatermark(ring, {
        tenant: 'mint-integration-tenant',
        batchId: result.batch.id,
      }),
    ).toBe(result.batch.watermark);
  }, 30000);

  it('entitlement denial: no Batch row is created and the API returns 402', async () => {
    const key = 'int-entitlement-402';
    const service = mintService(new DenyAboveEntitlementPolicy(3));

    let caught: unknown;
    try {
      await service.mint({
        tenantId,
        productId,
        oemId,
        count: 10,
        idempotencyKey: key,
        requestedBy: 'owner-1',
      });
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(HttpException);
    expect((caught as HttpException).getStatus()).toBe(402);
    expect((caught as HttpException).getResponse()).toMatchObject({
      error: 'entitlement',
      reason: expect.any(String),
      upgradeHint: expect.any(String),
    });

    const batch = await prisma.batch.findUnique({
      where: { tenantId_idempotencyKey: { tenantId, idempotencyKey: key } },
    });
    expect(batch).toBeNull();
  }, 30000);
});
