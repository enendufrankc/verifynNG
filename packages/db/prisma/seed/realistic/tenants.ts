import type { PrismaClient } from '@prisma/client';
import type { SeedManifest } from './lib/manifest.js';
import { startStage, endStage } from './lib/timer.js';

export async function seedTenants(
  prisma: PrismaClient,
  manifest: SeedManifest,
): Promise<void> {
  startStage('tenants + users');

  const PASSWORD_HASH = '$2b$10$FAKEHASH_FOR_SEED_REPLACE_WHEN_E02_SHIPS';

  // ── Tenants ────────────────────────────────────────
  const ivoryglow = await prisma.tenant.upsert({
    where: { slug: 'ivoryglow' },
    update: {},
    create: {
      slug: 'ivoryglow',
      name: 'IVORY GLOW',
      legalName: 'Tunnel Light Global Concept Ltd',
      status: 'active',
    },
  });
  manifest.tenants.ivoryglow = { id: ivoryglow.id, slug: 'ivoryglow' };

  const acme = await prisma.tenant.upsert({
    where: { slug: 'acme' },
    update: {},
    create: {
      slug: 'acme',
      name: 'Acme Cosmetics',
      legalName: 'Acme Cosmetics Ltd',
      status: 'active',
    },
  });
  manifest.tenants.acme = { id: acme.id, slug: 'acme' };

  const nkem = await prisma.tenant.upsert({
    where: { slug: 'nkem-naturals' },
    update: {},
    create: {
      slug: 'nkem-naturals',
      name: 'Nkem Naturals',
      legalName: 'Nkem Naturals Ltd',
      status: 'active',
    },
  });
  manifest.tenants['nkem-naturals'] = { id: nkem.id, slug: 'nkem-naturals' };

  // ── Users ──────────────────────────────────────────
  const users = [
    {
      email: 'owner@ivoryglow.com',
      displayName: 'IG Owner',
      tenantId: ivoryglow.id,
      key: 'ig_owner',
    },
    {
      email: 'ops@ivoryglow.com',
      displayName: 'IG Operator',
      tenantId: ivoryglow.id,
      key: 'ig_ops',
    },
    {
      email: 'view@ivoryglow.com',
      displayName: 'IG Viewer',
      tenantId: ivoryglow.id,
      key: 'ig_view',
    },
    {
      email: 'owner@acme.test',
      displayName: 'Acme Owner',
      tenantId: acme.id,
      key: 'acme_owner',
    },
    {
      email: 'ops@acme.test',
      displayName: 'Acme Operator',
      tenantId: acme.id,
      key: 'acme_ops',
    },
    {
      email: 'owner@nkem.test',
      displayName: 'Nkem Owner',
      tenantId: nkem.id,
      key: 'nkem_owner',
    },
    {
      email: 'ops@nkem.test',
      displayName: 'Nkem Operator',
      tenantId: nkem.id,
      key: 'nkem_ops',
    },
    {
      email: 'support@verifyng.local',
      displayName: 'Platform Support',
      tenantId: null,
      key: 'support',
    },
    {
      email: 'dual@acme.test',
      displayName: 'Dual User',
      tenantId: acme.id,
      key: 'dual_acme',
    },
  ];

  for (const u of users) {
    const created = await prisma.user.upsert({
      where: { email: u.email },
      update: {},
      create: {
        email: u.email,
        passwordHash: PASSWORD_HASH,
        displayName: u.displayName,
        tenantId: u.tenantId,
      },
    });
    manifest.users[u.key] = {
      id: created.id,
      email: u.email,
      role: u.key.includes('owner')
        ? 'owner'
        : u.key.includes('ops')
          ? 'operator'
          : u.key.includes('view')
            ? 'viewer'
            : 'support',
      tenantSlug:
        u.tenantId === ivoryglow.id
          ? 'ivoryglow'
          : u.tenantId === acme.id
            ? 'acme'
            : u.tenantId === nkem.id
              ? 'nkem-naturals'
              : 'platform',
    };
  }

  endStage('tenants + users');
}
