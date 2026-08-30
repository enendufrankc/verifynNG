import { PrismaClient, ScanTier } from '@prisma/client';

/**
 * E12's AC1 fixture: "docker compose up && pnpm db:seed" must produce
 * synthetic ScanEvents the analytics rollup can be demonstrated against —
 * 2,000 events across 3 products / 4 batches / 6 countries over 30 days.
 * This is CROSS-EPIC-REQUESTS.md's "Seed 30 days of synthetic ScanEvents"
 * ask, owned there by E21; E21 hasn't shipped it, so E12 covers its own
 * AC1 fixture here rather than leaving the acceptance criterion undemonstrable.
 *
 * Batches are created with a fixed idempotencyKey so re-running `pnpm
 * db:seed` doesn't re-mint them. ScanEvent has no natural unique key (it's
 * an append-only event log by design), so idempotency for the event batch
 * is a simple existence check against one of the fixture batch ids instead.
 */

const EVENT_COUNT = 2000;
const DAYS = 30;
const COUNTRIES = ['NG', 'US', 'GB', 'GH', 'KE', 'ZA'];
const TIER2_VERDICTS = [
  'authentic',
  'authentic',
  'authentic',
  'suspicious',
  'flagged',
];

export async function seedAnalyticsFixtures(
  prisma: PrismaClient,
  tenantId: string,
  productIds: string[],
  oemId: string,
): Promise<void> {
  if (productIds.length === 0) return;

  const batches = [];
  for (let i = 0; i < 4; i++) {
    const batch = await prisma.batch.upsert({
      where: {
        tenantId_idempotencyKey: {
          tenantId,
          idempotencyKey: `e12-analytics-fixture-batch-${i}`,
        },
      },
      update: {},
      create: {
        tenantId,
        productId: productIds[i % productIds.length],
        oemId,
        count: 100,
        idempotencyKey: `e12-analytics-fixture-batch-${i}`,
        requestedBy: 'e12-seed-fixture',
        watermark: `E12FX${i}`,
        kid: 'k1',
        status: 'minted',
        mintedCount: 100,
        mintedAt: new Date(),
      },
    });
    batches.push(batch);
  }

  const alreadySeeded = await prisma.scanEvent.count({
    where: { batchId: batches[0].id },
  });
  if (alreadySeeded > 0) return;

  const now = Date.now();
  const dayMs = 24 * 60 * 60 * 1000;
  // A small seeded PRNG (not Math.random()) so the fixture is reproducible
  // across seed runs — same shape every time, useful when comparing runs.
  let seed = 42;
  const rand = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };

  const rows: {
    tenantId: string;
    productId: string;
    batchId: string;
    tier: ScanTier;
    verdict: string;
    source: 'qr';
    codeRedacted: string;
    ipHash: string;
    geoCountry: string;
    createdAt: Date;
  }[] = [];

  for (let i = 0; i < EVENT_COUNT; i++) {
    const batch = batches[Math.floor(rand() * batches.length)];
    const daysAgo = Math.floor(rand() * DAYS);
    const msIntoDay = Math.floor(rand() * dayMs);
    const createdAt = new Date(now - daysAgo * dayMs - msIntoDay);
    const isTier2 = rand() < 0.7;
    const tier: ScanTier = isTier2 ? 'tier2' : 'tier1';
    const verdict = isTier2
      ? TIER2_VERDICTS[Math.floor(rand() * TIER2_VERDICTS.length)]
      : 'ok';

    rows.push({
      tenantId,
      productId: batch.productId,
      batchId: batch.id,
      tier,
      verdict,
      source: 'qr',
      codeRedacted: 'ivoryglow.2.k1.e12fixture…',
      ipHash: `e12-fixture-ip-${i % 137}`,
      geoCountry: COUNTRIES[Math.floor(rand() * COUNTRIES.length)],
      createdAt,
    });
  }

  await prisma.scanEvent.createMany({ data: rows });
  console.log(
    `Seeded ${rows.length} synthetic ScanEvents across ${batches.length} fixture batches / ${COUNTRIES.length} countries over ${DAYS} days (E12 AC1 fixture)`,
  );
}
