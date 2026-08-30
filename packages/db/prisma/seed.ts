import {
  PrismaClient,
  type NotificationChannel,
  type TenantRole,
} from '@prisma/client';
import * as argon2 from 'argon2';
import { seedPolicies } from './seed/policies';
import { seedLegalDocuments } from './seed/legal-documents';
import { seedAnalyticsFixtures } from './seed/e12-analytics-fixtures';
import { seedOemDelivery } from './seed/e05-oem';

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
  await seedPolicies(prisma);
  await seedLegalDocuments(prisma);
  if (process.argv.includes('--policies-bump')) {
    await prisma.policyDocument.upsert({
      where: {
        kind_locale_version: {
          kind: 'tos',
          locale: 'en',
          version: '2026-09-01',
        },
      },
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
      id: 'ivoryglow',
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

  const productIds: string[] = [];
  for (const p of products) {
    const product = await prisma.product.upsert({
      where: { tenantId_sku: { tenantId: tenant.id, sku: p.sku } },
      update: {},
      create: {
        tenantId: tenant.id,
        sku: p.sku,
        name: p.name,
      },
    });
    productIds.push(product.id);
  }

  // Create the Guiba OEM (E04)
  const oem = await prisma.oem.upsert({
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
        channels: rule.channels as NotificationChannel[],
        roles: rule.roles,
        enabled: true,
      },
    });
  }

  // ── E02 Identity & Access — dev users ────────────────────────
  const passwordHash = await hashDevPassword();

  const owner = await upsertMember(
    'owner@ivoryglow.local',
    'Ivory Glow Owner',
    tenant.id,
    'owner',
    passwordHash,
  );
  // TenantStatusGuard blocks every non-GET route for an owner with pending
  // AUP/ToS acceptance; record it for the seeded owner so the seed is usable
  // through the real UI immediately, the same way signup's accept step would.
  for (const doc of await prisma.policyDocument.findMany()) {
    await prisma.policyAcceptance.upsert({
      where: {
        tenantId_kind_version: {
          tenantId: tenant.id,
          kind: doc.kind,
          version: doc.version,
        },
      },
      update: {},
      create: {
        tenantId: tenant.id,
        userId: owner.id,
        kind: doc.kind,
        version: doc.version,
      },
    });
  }
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

  // ── E12: analytics/metering AC1 fixture (30 days of synthetic ScanEvents) ──
  await seedAnalyticsFixtures(prisma, tenant.id, productIds, oem.id);

  console.log(
    `Seeded tenant ${tenant.name} with ${products.length} products, 3 ivoryglow members, 1 support user, and ${defaultRules.length} notification rules`,
  );

  // ── E05: OEM Manifest Delivery — dev fixtures ────────────────
  await seedOemDelivery(prisma);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
