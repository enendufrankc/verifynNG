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
import { ConsentService } from './consent.service';

describe('ConsentService with Postgres', () => {
  let testDb: Awaited<ReturnType<typeof createTestDatabase>>;
  const events = { emit: vi.fn() };
  const service = new ConsentService(events as never);

  beforeAll(async () => {
    testDb = await createTestDatabase('consent');
  });

  afterEach(() => {
    vi.restoreAllMocks();
    events.emit.mockClear();
  });

  afterAll(async () => {
    await dropTestSchema(testDb.schemaName, testDb.prisma);
    await disconnectTestHelper();
    await prisma.$disconnect();
  });

  function proxyPrisma() {
    vi.spyOn(prisma.consentRecord, 'create').mockImplementation(((
      args: never,
    ) => testDb.prisma.consentRecord.create(args)) as never);
    vi.spyOn(prisma.consentRecord, 'findMany').mockImplementation(((
      args: never,
    ) => testDb.prisma.consentRecord.findMany(args)) as never);
    vi.spyOn(prisma.consentRecord, 'findFirst').mockImplementation(((
      args: never,
    ) => testDb.prisma.consentRecord.findFirst(args)) as never);
  }

  it('record() writes a row and emits consent.recorded', async () => {
    proxyPrisma();
    const record = await service.record({
      subjectType: 'user',
      subjectRef: 'user-1',
      purpose: 'marketing',
      granted: true,
      source: 'admin_preferences',
      tenantId: 'tenant-1',
    });

    expect(record.granted).toBe(true);
    expect(events.emit).toHaveBeenCalledWith(
      'consent.recorded',
      expect.objectContaining({
        consentRecordId: record.id,
        tenantId: 'tenant-1',
        subjectType: 'user',
        subjectRef: 'user-1',
        purpose: 'marketing',
        granted: true,
        source: 'admin_preferences',
      }),
    );
  });

  it('has() returns false when no record exists', async () => {
    proxyPrisma();
    await expect(
      service.has('user', 'user-never-consented', 'marketing'),
    ).resolves.toBe(false);
  });

  it('has() returns whatever the latest record says, even if it revokes an earlier grant', async () => {
    proxyPrisma();
    await service.record({
      subjectType: 'user',
      subjectRef: 'user-2',
      purpose: 'marketing',
      granted: true,
      source: 'signup',
    });
    await expect(service.has('user', 'user-2', 'marketing')).resolves.toBe(
      true,
    );

    await service.record({
      subjectType: 'user',
      subjectRef: 'user-2',
      purpose: 'marketing',
      granted: false,
      source: 'admin_preferences',
    });
    await expect(service.has('user', 'user-2', 'marketing')).resolves.toBe(
      false,
    );
  });

  it('history() returns every record for a subject, newest first', async () => {
    proxyPrisma();
    await service.record({
      subjectType: 'consumer',
      subjectRef: 'hash-abc',
      purpose: 'contact_followup',
      granted: true,
      source: 'report_form',
    });
    await service.record({
      subjectType: 'consumer',
      subjectRef: 'hash-abc',
      purpose: 'contact_followup',
      granted: false,
      source: 'import',
    });

    const history = await service.history('consumer', 'hash-abc');
    expect(history).toHaveLength(2);
    expect(history[0].granted).toBe(false);
    expect(history[1].granted).toBe(true);
  });
});
