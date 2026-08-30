import { PrismaClient, type TenantRole } from '@prisma/client';
import * as argon2 from 'argon2';

const prisma = new PrismaClient();

const DEV_PASSWORD = 'Passw0rd!Passw0rd!';

async function hashDevPassword(): Promise<string> {
  return argon2.hash(DEV_PASSWORD, { type: argon2.argon2id });
}

async function upsertMember(
  email: string,
  displayName: string,
  tenantId: string,
  role: TenantRole,
  passwordHash: string,
) {
  const user = await prisma.user.upsert({
    where: { email },
    update: {},
    create: { email, displayName, passwordHash },
  });
  await prisma.membership.upsert({
    where: { userId_tenantId: { userId: user.id, tenantId } },
    update: {},
    create: { userId: user.id, tenantId, role },
  });
  return user;
}

async function main() {
  // Create the ivoryglow tenant
  const tenant = await prisma.tenant.upsert({
    where: { slug: 'ivoryglow' },
    update: {},
    create: {
      slug: 'ivoryglow',
      name: 'IVORY GLOW',
      legalName: 'Tunnel Light Global Concept Ltd',
      status: 'active',
    },
  });

  // Create the three IVORY GLOW products (from legacy/verify-platform/cli.js)
  const products = [
    {
      sku: 'ig004',
      name: 'IVORY GLOW Turmeric & Curcumin Shower Gel 1000ml',
    },
    {
      sku: 'ig005',
      name: 'IVORY GLOW Retinol & Amino Acids Shower Gel 1000ml',
    },
    {
      sku: 'ig006',
      name: 'IVORY GLOW Vitamin C & B3 Shower Gel + Collagen Peptide 24 1000ml',
    },
  ];

  for (const p of products) {
    await prisma.product.upsert({
      where: { tenantId_sku: { tenantId: tenant.id, sku: p.sku } },
      update: {},
      create: {
        tenantId: tenant.id,
        sku: p.sku,
        name: p.name,
      },
    });
  }

  // ── E02 Identity & Access — dev users ────────────────────────
  const passwordHash = await hashDevPassword();

  await upsertMember(
    'owner@ivoryglow.local',
    'Ivory Glow Owner',
    tenant.id,
    'owner',
    passwordHash,
  );
  await upsertMember(
    'operator@ivoryglow.local',
    'Ivory Glow Operator',
    tenant.id,
    'operator',
    passwordHash,
  );
  await upsertMember(
    'viewer@ivoryglow.local',
    'Ivory Glow Viewer',
    tenant.id,
    'viewer',
    passwordHash,
  );

  await prisma.user.upsert({
    where: { email: 'support@verifyng.local' },
    update: {},
    create: {
      email: 'support@verifyng.local',
      displayName: 'Platform Support',
      passwordHash,
      platformRole: 'support',
    },
  });

  console.log(
    `Seeded tenant ${tenant.name} with ${products.length} products, 3 ivoryglow members, and 1 support user`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
