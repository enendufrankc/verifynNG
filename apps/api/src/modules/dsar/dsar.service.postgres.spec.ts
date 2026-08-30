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
import { DsarService } from './dsar.service';
import type { ReportLookupPort } from './report-lookup.port';

describe('DsarService with Postgres', () => {
  let testDb: Awaited<ReturnType<typeof createTestDatabase>>;
  const events = { emit: vi.fn() };
  const queue = {
    enqueueConsumerExport: vi.fn(),
    enqueueConsumerErase: vi.fn(),
    enqueueTenantExport: vi.fn(),
  };
  const storage = {
    presignGet: vi.fn().mockResolvedValue('https://minio.test/signed'),
  };
  const emailCache = { set: vi.fn(), takeAndClear: vi.fn() };
  const notifications = { send: vi.fn() };
  let reportLookup: ReportLookupPort;

  const service = () =>
    new DsarService(
      events as never,
      queue as never,
      storage as never,
      emailCache as never,
      notifications as never,
      reportLookup,
    );

  beforeAll(async () => {
    testDb = await createTestDatabase('dsar');
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  afterAll(async () => {
    await dropTestSchema(testDb.schemaName, testDb.prisma);
    await disconnectTestHelper();
    await prisma.$disconnect();
  });

  function proxyPrisma() {
    vi.spyOn(prisma.dsarRequest, 'create').mockImplementation(((args: never) =>
      testDb.prisma.dsarRequest.create(args)) as never);
    vi.spyOn(prisma.dsarRequest, 'findUnique').mockImplementation(((
      args: never,
    ) => testDb.prisma.dsarRequest.findUnique(args)) as never);
    vi.spyOn(prisma.dsarRequest, 'findFirst').mockImplementation(((
      args: never,
    ) => testDb.prisma.dsarRequest.findFirst(args)) as never);
    vi.spyOn(prisma.dsarRequest, 'update').mockImplementation(((args: never) =>
      testDb.prisma.dsarRequest.update(args)) as never);
  }

  it('requestConsumer() creates no row and sends no mail when the reference does not match a report', async () => {
    proxyPrisma();
    reportLookup = { findByReference: vi.fn().mockResolvedValue(null) };
    await service().requestConsumer({
      referenceNumber: 'RPT-UNKNOWN',
      email: 'alice@example.test',
      action: 'export',
    });
    expect(notifications.send).not.toHaveBeenCalled();
    expect(
      await testDb.prisma.dsarRequest.count({
        where: { lookupRef: 'RPT-UNKNOWN' },
      }),
    ).toBe(0);
  });

  it('requestConsumer() creates no row when the email does not match the report contact', async () => {
    proxyPrisma();
    reportLookup = {
      findByReference: vi.fn().mockResolvedValue({
        tenantId: 'tenant-1',
        contactEmail: 'real-owner@example.test',
      }),
    };
    await service().requestConsumer({
      referenceNumber: 'RPT-1',
      email: 'wrong-guess@example.test',
      action: 'export',
    });
    expect(notifications.send).not.toHaveBeenCalled();
    expect(
      await testDb.prisma.dsarRequest.count({ where: { lookupRef: 'RPT-1' } }),
    ).toBe(0);
  });

  it('requestConsumer() creates a pending_verification row and sends dsar.verify on a real match', async () => {
    proxyPrisma();
    reportLookup = {
      findByReference: vi.fn().mockResolvedValue({
        tenantId: 'tenant-1',
        contactEmail: 'Alice@Example.test',
      }),
    };
    await service().requestConsumer({
      referenceNumber: 'RPT-2',
      email: 'alice@example.test',
      action: 'export',
    });
    const created = await testDb.prisma.dsarRequest.findFirst({
      where: { lookupRef: 'RPT-2' },
    });
    expect(created?.status).toBe('pending_verification');
    expect(created?.tenantId).toBe('tenant-1');
    expect(notifications.send).toHaveBeenCalledWith(
      'dsar.verify',
      { email: 'alice@example.test' },
      expect.objectContaining({ expiresIn: '30 minutes' }),
      { tenantId: 'tenant-1' },
    );
    expect(emailCache.set).toHaveBeenCalledWith(
      created!.id,
      'alice@example.test',
      1800,
    );
  });

  it('verifyConsumer() moves a matching token to verified and enqueues fulfilment', async () => {
    proxyPrisma();
    reportLookup = {
      findByReference: vi.fn().mockResolvedValue({
        tenantId: 'tenant-1',
        contactEmail: 'bob@example.test',
      }),
    };
    await service().requestConsumer({
      referenceNumber: 'RPT-3',
      email: 'bob@example.test',
      action: 'erase',
    });
    const [, , mailData] = notifications.send.mock.calls[0];
    const token = new URL(mailData.verifyUrl).searchParams.get('token')!;

    const result = await service().verifyConsumer(token);
    expect(result).toEqual({ status: 'verified' });
    const updated = await testDb.prisma.dsarRequest.findFirst({
      where: { lookupRef: 'RPT-3' },
    });
    expect(updated?.status).toBe('verified');
    expect(queue.enqueueConsumerErase).toHaveBeenCalledWith({
      dsarRequestId: updated!.id,
    });
  });

  it('verifyConsumer() rejects a wrong token without changing status', async () => {
    proxyPrisma();
    reportLookup = {
      findByReference: vi.fn().mockResolvedValue({
        tenantId: 'tenant-1',
        contactEmail: 'carol@example.test',
      }),
    };
    await service().requestConsumer({
      referenceNumber: 'RPT-4',
      email: 'carol@example.test',
      action: 'export',
    });
    const created = await testDb.prisma.dsarRequest.findFirst({
      where: { lookupRef: 'RPT-4' },
    });

    await expect(
      service().verifyConsumer(`${created!.id}.wrong-secret`),
    ).rejects.toThrow('invalid_token');
    const unchanged = await testDb.prisma.dsarRequest.findUnique({
      where: { id: created!.id },
    });
    expect(unchanged?.status).toBe('pending_verification');
  });

  it('downloadConsumerExportUrl() returns a presigned URL for a completed request with the right token', async () => {
    proxyPrisma();
    reportLookup = {
      findByReference: vi.fn().mockResolvedValue({
        tenantId: 'tenant-1',
        contactEmail: 'dana@example.test',
      }),
    };
    await service().requestConsumer({
      referenceNumber: 'RPT-5',
      email: 'dana@example.test',
      action: 'export',
    });
    const [, , mailData] = notifications.send.mock.calls[0];
    const token = new URL(mailData.verifyUrl).searchParams.get('token')!;
    const [id, secret] = token.split('.');
    await testDb.prisma.dsarRequest.update({
      where: { id },
      data: {
        status: 'completed',
        exportObjectKey: `${id}.json`,
        exportExpiresAt: new Date(Date.now() + 3600_000),
      },
    });

    const url = await service().downloadConsumerExportUrl(id, secret);
    expect(url).toBe('https://minio.test/signed');
    expect(storage.presignGet).toHaveBeenCalledWith(`${id}.json`, 900);
  });
});
