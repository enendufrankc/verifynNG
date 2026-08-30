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
import { RetentionRunnerService } from './retention-runner.service';

describe('RetentionRunnerService with Postgres', () => {
  let testDb: Awaited<ReturnType<typeof createTestDatabase>>;
  const events = { emit: vi.fn() };
  const offboarding = { runDelete: vi.fn() };
  const dsarStorage = { delete: vi.fn() };
  const runner = new RetentionRunnerService(
    events as never,
    offboarding as never,
    dsarStorage as never,
  );

  beforeAll(async () => {
    testDb = await createTestDatabase('retention-runner');
    await testDb.prisma.tenant.create({
      data: {
        id: 'tenant-1',
        slug: 'tenant-1',
        name: 'Tenant 1',
        status: 'active',
      },
    });
    await testDb.prisma.user.create({
      data: {
        id: 'user-session-test',
        email: 'session-test@verifyng.local',
        displayName: 'Session Test',
      },
    });
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
    /* eslint-disable @typescript-eslint/no-explicit-any */
    const prismaAny = prisma as any;
    const testDbAny = testDb.prisma as any;
    for (const model of [
      'retentionRun',
      'session',
      'scanEvent',
      'probeResult',
      'tenant',
      'legalHold',
      'membership',
      'user',
      'dsarRequest',
    ] as const) {
      for (const method of [
        'create',
        'findFirst',
        'findMany',
        'findUnique',
        'count',
        'deleteMany',
        'delete',
        'update',
      ] as const) {
        if (typeof prismaAny[model][method] === 'function') {
          vi.spyOn(prismaAny[model], method).mockImplementation(
            (args: unknown) => testDbAny[model][method](args),
          );
        }
      }
    }
    vi.spyOn(prisma, '$executeRawUnsafe').mockImplementation(
      (...args: unknown[]) =>
        (testDbAny.$executeRawUnsafe as (...a: unknown[]) => unknown)(
          ...args,
        ) as never,
    );
    /* eslint-enable @typescript-eslint/no-explicit-any */
  }

  it('lists all 8 declared policies', () => {
    const names = runner.listPolicies().map((p) => p.name);
    expect(names).toEqual([
      'scanEvent.geoCity.scrub',
      'scanEvent.userAgent.scrub',
      'session.delete',
      'probeResult.delete',
      'dsarExport.delete',
      'tenant.offboarded.purge',
      'report.photos.delete',
      'usageEvent.delete',
    ]);
  });

  it('refuses a wet run with no prior dry run for that policy, and does not delete anything', async () => {
    proxyPrisma();
    await testDb.prisma.session.create({
      data: {
        userId: 'user-session-test',
        refreshTokenHash: 'hash-refuse-test',
        familyId: 'family-refuse-test',
        expiresAt: new Date(Date.now() - 40 * 86_400_000),
        createdAt: new Date(Date.now() - 40 * 86_400_000),
        revokedAt: new Date(Date.now() - 40 * 86_400_000),
      },
    });

    await expect(
      runner.run({
        dryRun: false,
        policyName: 'session.delete',
        triggeredBy: 'test',
      }),
    ).rejects.toThrow();
    expect(
      await testDb.prisma.session.count({
        where: { refreshTokenHash: 'hash-refuse-test' },
      }),
    ).toBe(1);
  });

  it('session.delete: dry run counts without deleting, wet run deletes only expired/revoked sessions, never an active one', async () => {
    proxyPrisma();
    const old = new Date(Date.now() - 40 * 86_400_000);
    await testDb.prisma.session.create({
      data: {
        userId: 'user-session-test',
        refreshTokenHash: 'hash-expired',
        familyId: 'family-expired',
        createdAt: old,
        expiresAt: old,
        revokedAt: old,
      },
    });
    await testDb.prisma.session.create({
      data: {
        userId: 'user-session-test',
        refreshTokenHash: 'hash-active',
        familyId: 'family-active',
        createdAt: old,
        expiresAt: new Date(Date.now() + 30 * 86_400_000),
      },
    });

    const [dryRun] = await runner.run({
      dryRun: true,
      policyName: 'session.delete',
      triggeredBy: 'test',
    });
    expect(dryRun.matched).toBeGreaterThanOrEqual(1);
    expect(dryRun.affected).toBe(0);
    expect(
      await testDb.prisma.session.count({
        where: { refreshTokenHash: 'hash-expired' },
      }),
    ).toBe(1);

    const [wetRun] = await runner.run({
      dryRun: false,
      policyName: 'session.delete',
      triggeredBy: 'test',
    });
    expect(wetRun.error).toBeNull();
    expect(
      await testDb.prisma.session.count({
        where: { refreshTokenHash: 'hash-expired' },
      }),
    ).toBe(0);
    expect(
      await testDb.prisma.session.count({
        where: { refreshTokenHash: 'hash-active' },
      }),
    ).toBe(1);
  });

  it('scanEvent.geoCity.scrub: scrubs geoCity past the cutoff, keeps verdict/tier/country, and leaves the append-only trigger enabled afterward', async () => {
    proxyPrisma();
    const old = new Date(Date.now() - 200 * 86_400_000);
    await testDb.prisma.scanEvent.create({
      data: {
        tenantId: 'tenant-1',
        tier: 'tier1',
        verdict: 'ok',
        codeRedacted: 'ivoryglow.1.k1.RETAIN…',
        geoCity: 'Lagos',
        geoCountry: 'NG',
        createdAt: old,
      },
    });

    const [dryRun] = await runner.run({
      dryRun: true,
      policyName: 'scanEvent.geoCity.scrub',
      triggeredBy: 'test',
    });
    expect(dryRun.matched).toBeGreaterThanOrEqual(1);
    expect(dryRun.affected).toBe(0);

    const [wetRun] = await runner.run({
      dryRun: false,
      policyName: 'scanEvent.geoCity.scrub',
      triggeredBy: 'test',
    });
    expect(wetRun.error).toBeNull();
    expect(wetRun.affected).toBeGreaterThanOrEqual(1);

    const row = await testDb.prisma.scanEvent.findFirst({
      where: { codeRedacted: 'ivoryglow.1.k1.RETAIN…' },
    });
    expect(row?.geoCity).toBeNull();
    expect(row?.verdict).toBe('ok');
    expect(row?.geoCountry).toBe('NG');

    // The append-only trigger must be re-enabled: a normal update must still fail.
    await expect(
      testDb.prisma.scanEvent.update({
        where: { id: row!.id },
        data: { verdict: 'tampered' },
      }),
    ).rejects.toThrow();
  });

  it('isolates a policy failure from the others when running all policies', async () => {
    proxyPrisma();
    // Force session.delete to have a fresh dry run so its wet leg doesn't
    // get skipped by the freshness gate, then make probeResult.count throw
    // to simulate one policy failing mid-batch.
    await runner.run({ dryRun: true, triggeredBy: 'test' });
    const probeCountSpy = vi
      .spyOn(prisma.probeResult, 'count')
      .mockRejectedValueOnce(new Error('boom'));

    const runs = await runner.run({ dryRun: true, triggeredBy: 'test' });
    const probeRun = runs.find((r) => r.policy === 'probeResult.delete');
    const sessionRun = runs.find((r) => r.policy === 'session.delete');
    expect(probeRun?.error).toBe('boom');
    expect(sessionRun?.error).toBeNull();
    probeCountSpy.mockRestore();
  });
});
