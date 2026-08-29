import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

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

  // ── E14: Seed default notification routing rules for ivoryglow ──
  const defaultRules = [
    {
      eventName: 'anomaly.detected',
      templateId: 'anomaly.alert',
      channels: ['email'],
      roles: ['owner'],
    },
    {
      eventName: 'report.created',
      templateId: 'report.received',
      channels: ['email'],
      roles: ['owner', 'operator'],
    },
    {
      eventName: 'batch.minted',
      templateId: 'batch.minted',
      channels: ['email'],
      roles: ['owner'],
    },
    {
      eventName: 'manifest.delivered',
      templateId: 'manifest.delivered',
      channels: ['email'],
      roles: ['owner'],
    },
    {
      eventName: 'receipt.mismatch',
      templateId: 'receipt.mismatch',
      channels: ['email', 'sms'],
      roles: ['owner'],
    },
  ];

  for (const rule of defaultRules) {
    await prisma.notificationRoutingRule.upsert({
      where: {
        tenantId_eventName_templateId: {
          tenantId: tenant.id,
          eventName: rule.eventName,
          templateId: rule.templateId,
        },
      },
      update: {},
      create: {
        tenantId: tenant.id,
        eventName: rule.eventName,
        templateId: rule.templateId,
        channels: rule.channels as any,
        roles: rule.roles,
        enabled: true,
      },
    });
  }

  console.log(
    `Seeded tenant ${tenant.name} with ${products.length} products and ${defaultRules.length} notification rules`,
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
