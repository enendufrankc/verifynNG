import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestDatabase, dropTestSchema } from '@verifynng/db';
import type { PrismaClient } from '@prisma/client';
import { AccountLinker } from './account-linker';

describe('AccountLinker (integration)', () => {
  let prisma: PrismaClient;
  let schemaName: string;
  let linker: AccountLinker;

  beforeAll(async () => {
    const db = await createTestDatabase('account-linker-spec');
    prisma = db.prisma;
    schemaName = db.schemaName;
    linker = new AccountLinker(prisma);
  }, 30_000);

  afterAll(async () => {
    await dropTestSchema(schemaName, prisma);
  });

  async function makeTenant(slug: string) {
    return prisma.tenant.create({ data: { slug, name: slug } });
  }

  const config = {
    allowedDomains: ['ivoryglow.com'],
    jitProvisioning: true,
    jitDefaultRole: 'viewer',
  };

  it('resolves an existing SsoIdentity by (tenantId, provider, sub) without touching email', async () => {
    const tenant = await makeTenant('al-identity');
    const user = await prisma.user.create({
      data: { email: 'owner@ivoryglow.com', displayName: 'Owner' },
    });
    await prisma.membership.create({
      data: { userId: user.id, tenantId: tenant.id, role: 'owner' },
    });
    await prisma.ssoIdentity.create({
      data: {
        tenantId: tenant.id,
        userId: user.id,
        provider: 'fake',
        subject: 'fake-owner-sub',
        email: 'owner@ivoryglow.com',
      },
    });

    // Email changed at the IdP — sub is still the same, so this must still link,
    // not create a duplicate account or reject.
    const result = await linker.resolve(
      tenant.id,
      'fake',
      {
        sub: 'fake-owner-sub',
        email: 'new-address@ivoryglow.com',
        domain: 'ivoryglow.com',
      },
      config,
    );

    expect(result).toMatchObject({
      outcome: 'linked',
      userId: user.id,
      membershipCreated: false,
      role: 'owner',
    });
  });

  it('links an existing User by email when a Membership already exists', async () => {
    const tenant = await makeTenant('al-email-link');
    const user = await prisma.user.create({
      data: { email: 'ops@ivoryglow.com', displayName: 'Ops' },
    });
    await prisma.membership.create({
      data: { userId: user.id, tenantId: tenant.id, role: 'operator' },
    });

    const result = await linker.resolve(
      tenant.id,
      'fake',
      {
        sub: 'fake-ops-sub',
        email: 'ops@ivoryglow.com',
        domain: 'ivoryglow.com',
      },
      config,
    );

    expect(result).toMatchObject({
      outcome: 'linked',
      userId: user.id,
      membershipCreated: false,
      role: 'operator',
    });
    await expect(
      prisma.ssoIdentity.findUnique({
        where: {
          tenantId_provider_subject: {
            tenantId: tenant.id,
            provider: 'fake',
            subject: 'fake-ops-sub',
          },
        },
      }),
    ).resolves.toMatchObject({ userId: user.id });
  });

  it('JIT-provisions a new user + membership when the domain is allowed and JIT is on', async () => {
    const tenant = await makeTenant('al-jit');

    const result = await linker.resolve(
      tenant.id,
      'fake',
      {
        sub: 'fake-newhire-sub',
        email: 'newhire@ivoryglow.com',
        domain: 'ivoryglow.com',
      },
      config,
    );

    expect(result).toMatchObject({
      outcome: 'jit',
      membershipCreated: true,
      role: 'viewer',
    });
    if (result.outcome !== 'jit') throw new Error('expected jit');
    await expect(
      prisma.membership.findUnique({
        where: {
          userId_tenantId: { userId: result.userId, tenantId: tenant.id },
        },
      }),
    ).resolves.toMatchObject({ createdVia: 'jit', role: 'viewer' });
  });

  it('rejects domain_not_allowed when the domain is not in allowedDomains, even with JIT on', async () => {
    const tenant = await makeTenant('al-domain-denied');

    const result = await linker.resolve(
      tenant.id,
      'fake',
      {
        sub: 'fake-outsider-sub',
        email: 'outsider@gmail.com',
        domain: 'gmail.com',
      },
      config,
    );

    expect(result).toEqual({
      outcome: 'rejected',
      reason: 'domain_not_allowed',
    });
  });

  it('rejects jit_disabled when the domain is allowed but JIT is off', async () => {
    const tenant = await makeTenant('al-jit-disabled');

    const result = await linker.resolve(
      tenant.id,
      'fake',
      {
        sub: 'fake-someone-sub',
        email: 'someone@ivoryglow.com',
        domain: 'ivoryglow.com',
      },
      { ...config, jitProvisioning: false },
    );

    expect(result).toEqual({ outcome: 'rejected', reason: 'jit_disabled' });
  });

  it('a user belonging to two tenants links independently in each', async () => {
    const tenantA = await makeTenant('al-multi-a');
    const tenantB = await makeTenant('al-multi-b');
    const user = await prisma.user.create({
      data: { email: 'multi@ivoryglow.com', displayName: 'Multi' },
    });
    await prisma.membership.create({
      data: { userId: user.id, tenantId: tenantA.id, role: 'viewer' },
    });
    await prisma.membership.create({
      data: { userId: user.id, tenantId: tenantB.id, role: 'operator' },
    });

    const resultA = await linker.resolve(
      tenantA.id,
      'fake',
      {
        sub: 'fake-multi-sub',
        email: 'multi@ivoryglow.com',
        domain: 'ivoryglow.com',
      },
      config,
    );
    const resultB = await linker.resolve(
      tenantB.id,
      'fake',
      {
        sub: 'fake-multi-sub',
        email: 'multi@ivoryglow.com',
        domain: 'ivoryglow.com',
      },
      config,
    );

    expect(resultA).toMatchObject({
      outcome: 'linked',
      userId: user.id,
      role: 'viewer',
    });
    expect(resultB).toMatchObject({
      outcome: 'linked',
      userId: user.id,
      role: 'operator',
    });
  });
});
