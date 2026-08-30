import type { PrismaClient } from '@prisma/client';
import type { SeedManifest } from './lib/manifest.js';
import { seededInt, seededWeightedPick, SEED_NOW } from './lib/rng.js';
import { startStage, endStage } from './lib/timer.js';

function batchSize(rng: () => number): number {
  const u = rng();
  const logSize = Math.log(600) + (u - 0.5) * 3;
  return Math.max(10, Math.min(5000, Math.round(Math.exp(logSize))));
}

const BATCH_STATUSES: Array<[string, number]> = [
  ['minted', 40],
  ['printed', 30],
  ['shipped', 25],
];

export async function seedBatches(
  prisma: PrismaClient,
  manifest: SeedManifest,
  rng: () => number,
  scale: number,
): Promise<void> {
  startStage('batches');

  const tenantSlugs = Object.keys(manifest.tenants);
  const totalBatches = Math.round(60 * scale);

  let batchIndex = 0;
  for (const tenantSlug of tenantSlugs) {
    const tenantId = manifest.tenants[tenantSlug]?.id;
    if (!tenantId) continue;

    const productIds = Object.values(manifest.products)
      .filter((p) => p.tenantSlug === tenantSlug)
      .map((p) => p.id);
    const oemIds = Object.values(manifest.oems)
      .filter((o) => o.tenantSlug === tenantSlug)
      .map((o) => o.id);

    if (productIds.length === 0) continue;

    const tenantBatchCount = Math.max(
      1,
      Math.round(totalBatches / tenantSlugs.length),
    );

    for (let i = 0; i < tenantBatchCount; i++) {
      const productId = productIds[seededInt(rng, 0, productIds.length - 1)];
      const oemId =
        oemIds.length > 0 ? oemIds[seededInt(rng, 0, oemIds.length - 1)] : null;
      const count = batchSize(rng);
      const isDeadCode =
        i >= tenantBatchCount - 2 && tenantSlug === 'ivoryglow';
      const status = isDeadCode
        ? 'minted'
        : seededWeightedPick(rng, BATCH_STATUSES);

      const key = `${tenantSlug}_batch_${batchIndex}`;
      const createdAt = new Date(
        SEED_NOW.getTime() - seededInt(rng, 0, 18 * 30) * 86400000,
      );
      // Deterministic id so re-running the seed updates instead of duplicating.
      const id = `seed_${key}`;
      const created = await prisma.batch.upsert({
        where: { id },
        // E04 made these columns required on Batch (no defaults).
        create: {
          id,
          tenantId,
          productId,
          oemId,
          count,
          status,
          createdAt,
          idempotencyKey: id,
          requestedBy: 'seed:realistic',
          watermark: 'SEED',
          kid: 'k1',
        },
        update: { tenantId, productId, oemId, count, status, createdAt },
      });

      manifest.batches[key] = { id: created.id, tenantSlug };
      batchIndex++;
    }
  }

  // TODO(E04): Units will be created via MintService.mintBulk({ skipExports }) when E04 ships.
  // TODO(E06): ScanEvents will be created with realistic diurnal/geo distributions when E06 ships.
  // TODO(E07): Anomaly planting will be added when E07 ships.

  endStage('batches');
}
