// One-time import of a pre-minted batch (tools/mint-oneoff's import.json)
// into the platform DB. Runs inside the api container, where @prisma/client
// is generated and DATABASE_URL points at the stack's postgres:
//
//   docker compose ... cp import.json api:/tmp/import.json
//   docker compose ... cp scripts/deploy/import-preminted.mjs api:/tmp/import.mjs
//   docker compose ... exec -T api node /tmp/import.mjs /tmp/import.json
//
// Idempotent: re-running with the same batch id is a no-op.
import { readFileSync } from 'node:fs';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const data = JSON.parse(readFileSync(process.argv[2] ?? '/tmp/import.json', 'utf8'));

const tenant = await prisma.tenant.findUniqueOrThrow({ where: { slug: data.tenant } });

const existing = await prisma.batch.findUnique({ where: { id: data.batch } });
if (existing) {
  console.log(`batch ${data.batch} already imported (${existing.mintedCount} units) — nothing to do`);
  process.exit(0);
}

const products = await prisma.product.findMany({ where: { tenantId: tenant.id } });
const bySku = new Map(products.map((p) => [p.sku, p.id]));
for (const sku of data.products) {
  if (!bySku.has(sku)) throw new Error(`product sku ${sku} not found for tenant ${data.tenant}`);
}

await prisma.batch.create({
  data: {
    id: data.batch,
    tenantId: tenant.id,
    // The batch spans three products; Batch.productId is single-valued, so it
    // carries the first sku and the true product lives on each Unit.
    productId: bySku.get(data.products[0]),
    count: data.units.length,
    mintedCount: data.units.length,
    status: 'minted',
    idempotencyKey: data.batch,
    requestedBy: 'import:preminted',
    watermark: data.watermark,
    kid: data.kid,
    mintedAt: new Date(data.createdAt),
    createdAt: new Date(data.createdAt),
  },
});

const CHUNK = 1000;
for (let i = 0; i < data.units.length; i += CHUNK) {
  const slice = data.units.slice(i, i + CHUNK).map((u, j) => ({
    tenantId: tenant.id,
    batchId: data.batch,
    productId: bySku.get(u.productId),
    serial: i + j + 1,
    tier1Code: u.tier1Code,
    tier2Hash: u.tier2Hash,
  }));
  await prisma.unit.createMany({ data: slice });
  console.log(`units ${i + slice.length}/${data.units.length}`);
}

console.log(`imported batch ${data.batch}: ${data.units.length} units for ${data.tenant}`);
await prisma.$disconnect();
