import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import {
  createTestDatabase,
  dropTestSchema,
  disconnectTestHelper,
} from './test-helpers';
import { scanEventAppendOnlyExtension } from './scan-event-extension';
import { tenant, scanEvent, resetFactoryCounter } from './testing/factories';

function createExtendedClient(databaseUrl: string) {
  return new PrismaClient({
    datasources: { db: { url: databaseUrl } },
  }).$extends(scanEventAppendOnlyExtension());
}

describe('ScanEvent append-only', () => {
  let plainPrisma: PrismaClient;
  let extendedPrisma: ReturnType<typeof createExtendedClient>;
  let schemaName: string;
  let databaseUrl: string;
  let tenantId: string;

  beforeAll(async () => {
    const result = await createTestDatabase('scan-event-immutable-test');
    plainPrisma = result.prisma;
    schemaName = result.schemaName;
    databaseUrl = result.databaseUrl;
    extendedPrisma = createExtendedClient(databaseUrl);
    resetFactoryCounter();

    const t = await tenant(plainPrisma);
    tenantId = t.id;
  });

  afterAll(async () => {
    await extendedPrisma.$disconnect();
    await dropTestSchema(schemaName, plainPrisma);
    await disconnectTestHelper();
  });

  it('the Prisma extension throws on update before reaching Postgres', async () => {
    const se = await scanEvent(plainPrisma, { tenantId });
    await expect(
      extendedPrisma.scanEvent.update({
        where: { id: se.id },
        data: { verdict: 'ok' },
      }),
    ).rejects.toThrow('ScanEvent is append-only');
  });

  it('the Prisma extension throws on delete before reaching Postgres', async () => {
    const se = await scanEvent(plainPrisma, { tenantId });
    await expect(
      extendedPrisma.scanEvent.delete({ where: { id: se.id } }),
    ).rejects.toThrow('ScanEvent is append-only');
  });

  it('the extension throws on updateMany/deleteMany too', async () => {
    await expect(
      extendedPrisma.scanEvent.updateMany({
        where: { tenantId },
        data: { verdict: 'ok' },
      }),
    ).rejects.toThrow('ScanEvent is append-only');
    await expect(
      extendedPrisma.scanEvent.deleteMany({ where: { tenantId } }),
    ).rejects.toThrow('ScanEvent is append-only');
  });

  it('the Postgres trigger rejects a raw UPDATE that bypasses the extension', async () => {
    const se = await scanEvent(plainPrisma, { tenantId });
    await expect(
      plainPrisma.$executeRawUnsafe(
        `UPDATE "ScanEvent" SET verdict = 'ok' WHERE id = $1`,
        se.id,
      ),
    ).rejects.toThrow('ScanEvent is append-only');
  });

  it('the Postgres trigger rejects a raw DELETE that bypasses the extension', async () => {
    const se = await scanEvent(plainPrisma, { tenantId });
    await expect(
      plainPrisma.$executeRawUnsafe(
        `DELETE FROM "ScanEvent" WHERE id = $1`,
        se.id,
      ),
    ).rejects.toThrow('ScanEvent is append-only');
  });
});
