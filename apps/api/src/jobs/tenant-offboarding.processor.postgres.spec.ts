import {
  createTestDatabase,
  disconnectTestHelper,
  dropTestSchema,
  prisma,
} from '@verifynng/db';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { TenantOffboardingProcessor } from './tenant-offboarding.processor';
import { TenantS3Service } from '../modules/tenants/s3.service';
import { TenantEventBus } from '../modules/tenants/tenant-events';
import { defaultRetentionPolicy } from '../modules/tenants/retention-policy';

describe('TenantOffboardingProcessor.runDelete with Postgres and MinIO', () => {
  let testDb: Awaited<ReturnType<typeof createTestDatabase>> | undefined;
  const tenantId = 'tenant-offboarding-delete';
  const storage = new TenantS3Service({
    get: (key: string, fallback?: unknown) => process.env[key] ?? fallback,
  } as never);
  const events = new TenantEventBus();
  const processor = new TenantOffboardingProcessor(
    storage,
    events,
    defaultRetentionPolicy,
  );

  beforeAll(async () => {
    testDb = await createTestDatabase('tenant-offboarding-delete');
    await testDb.prisma.tenant.create({
      data: {
        id: tenantId,
        slug: tenantId,
        name: 'Offboard Delete Test',
        status: 'offboarded',
      },
    });
    const product = await testDb.prisma.product.create({
      data: { tenantId, sku: 'sku-1', name: 'Product One' },
    });
    const batch = await testDb.prisma.batch.create({
      data: {
        tenantId,
        productId: product.id,
        count: 1,
        status: 'minted',
        idempotencyKey: 'offboard-test',
        requestedBy: 'test',
        watermark: 'TEST',
        kid: 'k1',
      },
    });
    const unit = await testDb.prisma.unit.create({
      data: {
        tenantId,
        batchId: batch.id,
        productId: product.id,
        serial: 1,
        tier1Code: 'tier1-offboard-1',
        tier2Hash: 'tier2-offboard-1',
      },
    });
    await testDb.prisma.scanEvent.create({
      data: {
        tenantId,
        unitId: unit.id,
        tier: 'tier1',
        verdict: 'ok',
        codeRedacted: 'ivoryglow.1.k1.ABCD…',
        ipHash: 'hash-offboard-1',
        ipPrefix: '203.0.113.0/24',
        userAgent: 'integration-test',
        geoCity: 'Lagos',
      },
    });
    await storage.put(
      `tenants/${tenantId}/verification/keep-out.txt`,
      Buffer.from('should be deleted'),
      'text/plain',
    );
  });

  afterAll(async () => {
    if (testDb) await dropTestSchema(testDb.schemaName, testDb.prisma);
    await disconnectTestHelper();
    await prisma.$disconnect();
  });

  it('purges tenant-owned product/batch/unit rows and the MinIO prefix, keeping anonymised scan events', async () => {
    if (!testDb) throw new Error('test database was not initialized');

    const spies = [
      vi
        .spyOn(prisma, '$executeRawUnsafe')
        .mockImplementation(((q: string) => testDb!.prisma.$executeRawUnsafe(q)) as never),
      vi
        .spyOn(prisma.scanEvent, 'updateMany')
        .mockImplementation(((args: never) => testDb!.prisma.scanEvent.updateMany(args)) as never),
      vi
        .spyOn(prisma.scanEvent, 'deleteMany')
        .mockImplementation(((args: never) => testDb!.prisma.scanEvent.deleteMany(args)) as never),
      vi
        .spyOn(prisma.unit, 'deleteMany')
        .mockImplementation(((args: never) => testDb!.prisma.unit.deleteMany(args)) as never),
      vi
        .spyOn(prisma.batch, 'deleteMany')
        .mockImplementation(((args: never) => testDb!.prisma.batch.deleteMany(args)) as never),
      vi
        .spyOn(prisma.product, 'deleteMany')
        .mockImplementation(((args: never) => testDb!.prisma.product.deleteMany(args)) as never),
      vi
        .spyOn(prisma.oem, 'deleteMany')
        .mockImplementation(((args: never) => testDb!.prisma.oem.deleteMany(args)) as never),
    ];
    const emitSpy = vi.spyOn(events, 'emit');

    await processor.runDelete(tenantId);

    expect(await testDb.prisma.unit.count({ where: { tenantId } })).toBe(0);
    expect(await testDb.prisma.batch.count({ where: { tenantId } })).toBe(0);
    expect(await testDb.prisma.product.count({ where: { tenantId } })).toBe(0);
    const remainingScanEvents = await testDb.prisma.scanEvent.findMany({
      where: { tenantId },
    });
    expect(remainingScanEvents).toHaveLength(1);
    expect(remainingScanEvents[0].unitId).toBeNull();
    expect(remainingScanEvents[0].ipHash).toBeNull();

    await expect(
      storage.head(`tenants/${tenantId}/verification/keep-out.txt`),
    ).rejects.toBeDefined();

    expect(emitSpy).toHaveBeenCalledWith(
      'tenant.deleted',
      expect.objectContaining({ tenantId }),
    );

    spies.forEach((spy) => spy.mockRestore());
  });
});
