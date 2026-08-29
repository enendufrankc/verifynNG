import {
  createTestDatabase,
  disconnectTestHelper,
  dropTestSchema,
  prisma,
} from '@verifynng/db';
import { ForbiddenException } from '@nestjs/common';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  decidePolicyAcceptance,
  pendingPolicyKinds,
} from './policy-acceptance';
import { TenantStatusGuard } from './tenant-status.guard';

describe('policy acceptance gate with Postgres', () => {
  let testDb: Awaited<ReturnType<typeof createTestDatabase>> | undefined;
  const schemaName = `test_policy_acceptance_${process.pid}`;
  const tenantId = 'tenant-policy-bump';
  const userId = 'user-policy-owner';

  beforeAll(async () => {
    testDb = await createTestDatabase('policy-acceptance');
    await testDb.prisma.tenant.create({
      data: {
        id: tenantId,
        slug: tenantId,
        name: 'Policy Test',
        status: 'active',
      },
    });
    await testDb.prisma.user.create({
      data: {
        id: userId,
        email: `${userId}@verifyng.local`,
        displayName: 'Policy Owner',
      },
    });
    await testDb.prisma.membership.create({
      data: { tenantId, userId, role: 'owner' },
    });
    await testDb.prisma.policyDocument.createMany({
      data: [
        {
          kind: 'aup',
          version: '2026-08-01',
          markdown: 'AUP',
          effectiveFrom: new Date('2026-08-01T00:00:00.000Z'),
        },
        {
          kind: 'tos',
          version: '2026-08-01',
          markdown: 'ToS',
          effectiveFrom: new Date('2026-08-01T00:00:00.000Z'),
        },
      ],
    });
    await testDb.prisma.policyAcceptance.createMany({
      data: [
        { tenantId, userId, kind: 'aup', version: '2026-08-01' },
        { tenantId, userId, kind: 'tos', version: '2026-08-01' },
      ],
    });
  });

  afterAll(async () => {
    if (testDb) {
      await dropTestSchema(testDb.schemaName, testDb.prisma);
    } else {
      await prisma.$executeRawUnsafe(
        `DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`,
      );
    }
    await disconnectTestHelper();
    await prisma.$disconnect();
  });

  it('blocks the owner after a current policy bump, then clears the gate after acceptance', async () => {
    if (!testDb) throw new Error('test database was not initialized');
    const now = new Date();
    const future = new Date(now.getTime() + 24 * 60 * 60 * 1_000);
    await testDb.prisma.policyDocument.create({
      data: {
        kind: 'tos',
        version: '2099-01-01',
        markdown: 'Future ToS',
        effectiveFrom: future,
      },
    });

    const reflector = {
      get: vi.fn(() => undefined),
    } as never;
    const guard = new TenantStatusGuard(reflector);
    const context = () =>
      ({
        switchToHttp: () => ({
          getRequest: () => ({
            path: `/tenants/${tenantId}/settings`,
            params: { tenantId },
            method: 'PATCH',
            principal: { userId, role: 'owner', tenantId },
          }),
        }),
        getHandler: () => function handler() {},
        getClass: () => class Handler {},
      }) as never;
    const tenantFindFirst = vi
      .spyOn(prisma.tenant, 'findFirst')
      .mockImplementation((args) => testDb!.prisma.tenant.findFirst(args));
    const policyFindMany = vi
      .spyOn(prisma.policyDocument, 'findMany')
      .mockImplementation((args) =>
        testDb!.prisma.policyDocument.findMany(args),
      );
    const acceptanceFindMany = vi
      .spyOn(prisma.policyAcceptance, 'findMany')
      .mockImplementation((args) =>
        testDb!.prisma.policyAcceptance.findMany(args),
      );

    await expect(guard.canActivate(context())).resolves.toBe(true);
    expect(policyFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          effectiveFrom: { lte: expect.any(Date) },
        }),
      }),
    );

    await testDb.prisma.policyDocument.create({
      data: {
        kind: 'tos',
        version: '2026-09-01',
        markdown: 'Updated ToS',
        effectiveFrom: new Date(now.getTime() - 1_000),
      },
    });

    const documents = await testDb.prisma.policyDocument.findMany({
      where: { kind: { in: ['aup', 'tos'] }, effectiveFrom: { lte: now } },
      orderBy: { version: 'desc' },
      select: { kind: true, version: true, effectiveFrom: true },
    });
    const accepted = await testDb.prisma.policyAcceptance.findMany({
      where: { tenantId, userId },
      select: { kind: true, version: true },
    });
    const pending = pendingPolicyKinds(documents, accepted, now);
    expect(decidePolicyAcceptance('owner', 'PATCH', pending, false)).toEqual({
      allowed: false,
      error: 'policy_acceptance_required',
      pending: ['tos'],
    });
    await expect(guard.canActivate(context())).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    await expect(guard.canActivate(context())).rejects.toMatchObject({
      response: { error: 'policy_acceptance_required', pending: ['tos'] },
    });

    await testDb.prisma.policyAcceptance.create({
      data: { tenantId, userId, kind: 'tos', version: '2026-09-01' },
    });
    const acceptedAfterBump = await testDb.prisma.policyAcceptance.findMany({
      where: { tenantId, userId },
      select: { kind: true, version: true },
    });
    expect(
      decidePolicyAcceptance(
        'owner',
        'PATCH',
        pendingPolicyKinds(documents, acceptedAfterBump, now),
        false,
      ),
    ).toEqual({ allowed: true });

    await expect(guard.canActivate(context())).resolves.toBe(true);
    expect(acceptanceFindMany).toHaveBeenCalled();
    tenantFindFirst.mockRestore();
    policyFindMany.mockRestore();
    acceptanceFindMany.mockRestore();
  });
});
