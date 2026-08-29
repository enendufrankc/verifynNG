import {
  createTestDatabase,
  disconnectTestHelper,
  dropTestSchema,
} from '@verifynng/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  decidePolicyAcceptance,
  pendingPolicyKinds,
} from './policy-acceptance';

describe('policy acceptance gate with Postgres', () => {
  let testDb: Awaited<ReturnType<typeof createTestDatabase>>;
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
      await disconnectTestHelper();
    }
  });

  it('blocks the owner after a current policy bump, then clears the gate after acceptance', async () => {
    const now = new Date();
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
  });
});
