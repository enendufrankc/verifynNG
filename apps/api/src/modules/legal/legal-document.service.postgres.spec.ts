import {
  createTestDatabase,
  disconnectTestHelper,
  dropTestSchema,
  prisma,
} from '@verifynng/db';
import { NotFoundException } from '@nestjs/common';
import {
  afterAll,
  beforeAll,
  afterEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { LegalDocumentService } from './legal-document.service';

describe('LegalDocumentService with Postgres', () => {
  let testDb: Awaited<ReturnType<typeof createTestDatabase>>;
  const service = new LegalDocumentService();

  beforeAll(async () => {
    testDb = await createTestDatabase('legal-document');
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
    vi.spyOn(prisma.policyDocument, 'findFirst').mockImplementation(((
      args: never,
    ) => testDb.prisma.policyDocument.findFirst(args)) as never);
    vi.spyOn(prisma.policyDocument, 'findMany').mockImplementation(((
      args: never,
    ) => testDb.prisma.policyDocument.findMany(args)) as never);
    vi.spyOn(prisma.policyDocument, 'create').mockImplementation(((
      args: never,
    ) => testDb.prisma.policyDocument.create(args)) as never);
  }

  it('returns the current published version for a kind and translates terms<->tos', async () => {
    proxyPrisma();
    await testDb.prisma.policyDocument.create({
      data: {
        kind: 'tos',
        locale: 'en',
        version: '2026-08-01',
        markdown: 'Terms body',
        effectiveFrom: new Date('2026-08-01T00:00:00Z'),
      },
    });

    const doc = await service.current('terms');
    expect(doc.kind).toBe('terms');
    expect(doc.version).toBe('2026-08-01');
    expect(doc.bodyMd).toBe('Terms body');
    expect(doc.publishedAt).toBe('2026-08-01T00:00:00.000Z');
  });

  it('never returns a document whose effectiveFrom is in the future', async () => {
    proxyPrisma();
    await testDb.prisma.policyDocument.create({
      data: {
        kind: 'privacy',
        locale: 'en',
        version: '1',
        markdown: 'Privacy v1',
        effectiveFrom: new Date('2020-01-01T00:00:00Z'),
      },
    });
    await testDb.prisma.policyDocument.create({
      data: {
        kind: 'privacy',
        locale: 'en',
        version: '2',
        markdown: 'Privacy v2 (not yet live)',
        effectiveFrom: new Date('2099-01-01T00:00:00Z'),
      },
    });

    const doc = await service.current('privacy');
    expect(doc.version).toBe('1');
  });

  it('throws NotFoundException when no document exists for a kind/locale', async () => {
    proxyPrisma();
    await expect(service.current('cookie', 'fr')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('list() returns all published versions, newest first', async () => {
    proxyPrisma();
    await testDb.prisma.policyDocument.create({
      data: {
        kind: 'aup',
        locale: 'en',
        version: '2026-08-01',
        markdown: 'AUP v1',
        effectiveFrom: new Date('2026-08-01T00:00:00Z'),
      },
    });
    await testDb.prisma.policyDocument.create({
      data: {
        kind: 'aup',
        locale: 'en',
        version: '2026-08-15',
        markdown: 'AUP v2',
        effectiveFrom: new Date('2026-08-15T00:00:00Z'),
      },
    });

    const versions = await service.list('aup');
    expect(versions.map((v) => v.version)).toEqual([
      '2026-08-15',
      '2026-08-01',
    ]);
  });

  it('publish() creates a new row and returns it as a DTO', async () => {
    proxyPrisma();
    const doc = await service.publish({
      kind: 'subprocessors',
      version: '1',
      bodyMd: 'Subprocessor list body',
      publishedById: 'user-support-1',
    });

    expect(doc.kind).toBe('subprocessors');
    expect(doc.version).toBe('1');
    expect(doc.bodyMd).toBe('Subprocessor list body');

    const stored = await testDb.prisma.policyDocument.findFirst({
      where: { kind: 'subprocessors', version: '1' },
    });
    expect(stored?.publishedById).toBe('user-support-1');
    expect(stored?.locale).toBe('en');
    expect(stored?.requiresReacceptance).toBe(false);
  });
});
