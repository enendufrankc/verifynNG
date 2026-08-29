import { config } from 'dotenv';
import { resolve } from 'node:path';
import { PrismaClient } from '@prisma/client';

// Per-worktree overrides first (.env, written by scripts/epic start), then repo defaults.
config({ path: resolve(__dirname, '../../../../../.env') });
config({ path: resolve(__dirname, '../../../../../.env.example') });

import { seededRng, DEFAULT_SEED, SEED_NOW } from './lib/rng.js';
import { emptyManifest, writeManifest } from './lib/manifest.js';
import { seedTenants } from './tenants.js';
import { seedProducts } from './products.js';
import { seedBatches } from './batches.js';

async function main() {
  const args = process.argv.slice(2);
  let scale = 1;
  let seed = DEFAULT_SEED;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--scale' && args[i + 1]) {
      scale = parseFloat(args[i + 1]);
      i++;
    } else if (args[i] === '--seed' && args[i + 1]) {
      seed = parseInt(args[i + 1], 10);
      i++;
    }
  }

  console.log(`\n🌱 Realistic seed (scale=${scale}, seed=${seed})\n`);

  const rng = seededRng(seed);
  const manifest = emptyManifest(seed, scale, SEED_NOW.toISOString());

  const prisma = new PrismaClient();
  const overallStart = Date.now();

  await seedTenants(prisma, manifest);
  await seedProducts(prisma, manifest, rng);
  await seedBatches(prisma, manifest, rng, scale);

  writeManifest(manifest);

  const elapsed = ((Date.now() - overallStart) / 1000).toFixed(2);

  const tenantCount = Object.keys(manifest.tenants).length;
  const userCount = Object.keys(manifest.users).length;
  const productCount = Object.keys(manifest.products).length;
  const oemCount = Object.keys(manifest.oems).length;
  const batchCount = Object.keys(manifest.batches).length;

  console.log('\n─── Seed summary ───');
  console.log(`  Tenants:   ${tenantCount}`);
  console.log(`  Users:     ${userCount}`);
  console.log(`  Products:  ${productCount}`);
  console.log(`  OEMs:      ${oemCount}`);
  console.log(`  Batches:   ${batchCount}`);
  console.log(`  Units:     (pending E04)`);
  console.log(`  Scans:     (pending E06)`);
  console.log(`  Anomalies: (pending E07)`);
  console.log(`  Reports:   (pending E08)`);
  console.log(`  Invoices:  (pending E15)`);
  console.log(`  Tickets:   (pending E18)`);
  console.log(`\n  Total time: ${elapsed}s\n`);

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
