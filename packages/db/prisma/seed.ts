import { PrismaClient } from '@prisma/client';
import { seedPolicies } from './seed/policies';

const prisma = new PrismaClient();

async function main() {
  await seedPolicies(prisma);
  if (process.argv.includes('--policies-bump')) {
    await prisma.policyDocument.upsert({
      where: { kind_version: { kind: 'tos', version: '2026-09-01' } },
      update: {},
      create: {
        kind: 'tos',
        version: '2026-09-01',
        effectiveFrom: new Date('2026-09-01T00:00:00Z'),
        markdown:
          'Updated terms: the platform may suspend service on evidence of counterfeiting, abuse, or unlawful use, and may share verification outcomes with law enforcement where required.',
      },
    });
    console.log(
      'Seeded a newer ToS version (2026-09-01) to test the policy-acceptance gate.',
    );
  }
  // Create the ivoryglow tenant
  const tenant = await prisma.tenant.upsert({
    where: { slug: 'ivoryglow' },
    update: {},
    create: {
      slug: 'ivoryglow',
      name: 'IVORY GLOW',
      legalName: 'Tunnel Light Global Concept Ltd',
      trademarkNumber: 'NG/TM/O/2020/11950',
      country: 'NG',
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
