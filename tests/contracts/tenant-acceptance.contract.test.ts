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

/**
 * Contract: the E03 surface E19's LegalDocumentService.needsReacceptance()
 * and the tenant re-acceptance flow depend on —
 * TenantLifecycleService.pendingAcceptances()/currentVersions()/
 * acceptPolicy() and the PolicyDocument/PolicyAcceptance models. E19
 * doesn't own these (see docs/superpowers/plans/2026-08-30-e19-legal-documents-milestone1.md
 * "Key decisions" for why it reuses rather than duplicates them). If E03
 * ever changes these signatures, this is the test that catches it before
 * it silently breaks re-acceptance gating.
 */
describe('Contract: E03 TenantLifecycleService (consumed by E19)', () => {
  let testDb: Awaited<ReturnType<typeof createTestDatabase>>;
  const tenantId = 'contract-tenant';
  const userId = 'contract-user';

  beforeAll(async () => {
    testDb = await createTestDatabase('contract-tenant-acceptance');
    await testDb.prisma.tenant.create({
      data: {
        id: tenantId,
        slug: tenantId,
        name: 'Contract Tenant',
        status: 'active',
      },
    });
    await testDb.prisma.user.create({
      data: {
        id: userId,
        email: `${userId}@verifyng.local`,
        displayName: 'Contract User',
      },
    });
    await testDb.prisma.policyDocument.create({
      data: {
        kind: 'tos',
        version: '2026-08-01',
        markdown: 'ToS v1',
        effectiveFrom: new Date('2026-08-01T00:00:00Z'),
      },
    });
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
    for (const method of ['findMany', 'findFirst', 'upsert'] as const) {
      if (
        typeof (prisma.policyDocument as never as Record<string, unknown>)[
          method
        ] === 'function'
      ) {
        vi.spyOn(prisma.policyDocument, method as never).mockImplementation(((
          args: never,
        ) =>
          (
            testDb.prisma.policyDocument as never as Record<
              string,
              (a: never) => unknown
            >
          )[method](args)) as never);
      }
    }
    for (const method of ['findMany', 'upsert'] as const) {
      vi.spyOn(prisma.policyAcceptance, method).mockImplementation(((
        args: never,
      ) =>
        (
          testDb.prisma.policyAcceptance as never as Record<
            string,
            (a: never) => unknown
          >
        )[method](args)) as never);
    }
  }

  it('pendingAcceptances() reports an unaccepted current version', async () => {
    proxyPrisma();
    const { TenantLifecycleService } = await import(
      '../../apps/api/src/modules/tenants/tenant-lifecycle.service'
    );
    const service = new TenantLifecycleService(
      { presignPut: vi.fn() } as never,
      { emit: vi.fn() } as never,
      { enqueueExport: vi.fn(), enqueueDelete: vi.fn() } as never,
    );

    const current = await service.currentVersions();
    expect(current.tos).toBe('2026-08-01');

    const pending = await service.pendingAcceptances(userId, tenantId);
    expect(pending).toContain('tos');
  });

  it('acceptPolicy() writes a PolicyAcceptance row that needsReacceptance() can compare against', async () => {
    proxyPrisma();
    const { TenantLifecycleService } = await import(
      '../../apps/api/src/modules/tenants/tenant-lifecycle.service'
    );
    const service = new TenantLifecycleService(
      { presignPut: vi.fn() } as never,
      { emit: vi.fn() } as never,
      { enqueueExport: vi.fn(), enqueueDelete: vi.fn() } as never,
    );

    await service.acceptPolicy(userId, tenantId, 'tos', '2026-08-01');
    const pending = await service.pendingAcceptances(userId, tenantId);
    expect(pending).not.toContain('tos');

    const row = await testDb.prisma.policyAcceptance.findFirst({
      where: { tenantId, userId, kind: 'tos' },
    });
    expect(row?.version).toBe('2026-08-01');
  });
});
