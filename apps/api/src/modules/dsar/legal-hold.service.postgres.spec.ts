import {
  createTestDatabase,
  disconnectTestHelper,
  dropTestSchema,
  prisma,
} from '@verifynng/db';
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { LegalHoldService } from './legal-hold.service';

describe('LegalHoldService with Postgres', () => {
  let testDb: Awaited<ReturnType<typeof createTestDatabase>>;
  const service = new LegalHoldService();

  beforeAll(async () => {
    testDb = await createTestDatabase('legal-hold');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  afterAll(async () => {
    await dropTestSchema(testDb.schemaName, testDb.prisma);
    await disconnectTestHelper();
    await prisma.$disconnect();
  });

  function proxyPrisma() {
    vi.spyOn(prisma.legalHold, 'create').mockImplementation(((args: never) =>
      testDb.prisma.legalHold.create(args)) as never);
    vi.spyOn(prisma.legalHold, 'findFirst').mockImplementation(((args: never) =>
      testDb.prisma.legalHold.findFirst(args)) as never);
    vi.spyOn(prisma.legalHold, 'update').mockImplementation(((args: never) =>
      testDb.prisma.legalHold.update(args)) as never);
  }

  it('isHeld() is false with no hold', async () => {
    proxyPrisma();
    await expect(service.isHeld('report', 'report-1')).resolves.toBe(false);
  });

  it('isHeld() is true once a hold is created, and false after it is released', async () => {
    proxyPrisma();
    const hold = await service.create({
      scope: 'report',
      ref: 'report-2',
      reason: 'active counterfeit investigation',
      createdById: 'support-1',
    });
    await expect(service.isHeld('report', 'report-2')).resolves.toBe(true);

    await service.release(hold.id);
    await expect(service.isHeld('report', 'report-2')).resolves.toBe(false);
  });

  it('isHeld() ignores holds for a different scope', async () => {
    proxyPrisma();
    await service.create({
      scope: 'tenant',
      ref: 'tenant-x',
      reason: 'dispute',
      createdById: 'support-1',
    });
    await expect(service.isHeld('report', 'tenant-x')).resolves.toBe(false);
  });
});
