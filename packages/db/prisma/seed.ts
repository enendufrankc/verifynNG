import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  // Create the ivoryglow tenant. `id` is pinned to the slug because
  // @TenantId() is still E02's placeholder — it returns the literal string
  // 'ivoryglow' rather than resolving the :tenantId path param against a
  // real session, so every tenant-scoped query needs a tenant whose `id`
  // is that exact string until E02 ships real auth.
  const tenant = await prisma.tenant.upsert({
    where: { slug: 'ivoryglow' },
    update: {},
    create: {
      id: 'ivoryglow',
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

  // Create the Guiba OEM (E04)
  await prisma.oem.upsert({
    where: {
      tenantId_name: { tenantId: tenant.id, name: 'Guiba OEM (China)' },
    },
    update: {},
    create: {
      tenantId: tenant.id,
      name: 'Guiba OEM (China)',
      country: 'CN',
      status: 'active',
    },
  });

  console.log(`Seeded tenant ${tenant.name} with ${products.length} products`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
