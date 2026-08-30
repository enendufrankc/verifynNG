import { randomUUID } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import { StaticKeyRing, generateCode, hashForStorage } from '@verifynng/core';
import {
  batch as batchFactory,
  unit as unitFactory,
  scanEvent as scanEventFactory,
} from '@verifynng/db/testing';

/**
 * E09 E2E fixtures — one unit per verdict, minted with real generateCode
 * (not the db factories' placeholder tier1Code/tier2Hash, which never pass
 * E06's checksum check) against the `ivoryglow` tenant that `db:seed`
 * already creates. `alreadyVerified`/`suspicious` get real ScanEvent
 * history inserted directly (the same shape `ScanEventsService.record()`
 * writes) so E06's VerdictEngine sees genuine prior-scan data.
 *
 * No stable seeded fixtures exist yet platform-wide (CROSS-EPIC-REQUESTS.md
 * — E04/E21's future job); this is E09's own test-only seeding, scoped to
 * this spec run.
 */
export interface VerifyFixtures {
  authenticFirstScan: string;
  alreadyVerified: string;
  suspicious: string;
  flagged: string;
  decommissioned: string;
  tier1Ok: string;
  /** Well-formed, valid checksum, but no Unit row exists for it. */
  unknownWellFormed: string;
}

export async function seedVerifyFixtures(
  prisma: PrismaClient,
): Promise<VerifyFixtures> {
  // docker/compose.yml hardcodes this exact key for the `api`/`api-worker`
  // services regardless of the worktree's own .env (which can — and in
  // this worktree, does — set a different CORE_KEYS for unrelated host
  // tooling). Reading process.env.CORE_KEYS here would silently mint
  // codes the real running API can never validate.
  const ring = new StaticKeyRing(
    'k1:0000000000000000000000000000000000000000000000000000000000000000',
    'k1',
  );

  const tenant = await prisma.tenant.findUniqueOrThrow({
    where: { slug: 'ivoryglow' },
  });
  const product = await prisma.product.findFirstOrThrow({
    where: { tenantId: tenant.id, sku: 'ig004' },
  });
  const b = await batchFactory(prisma, {
    tenantId: tenant.id,
    productId: product.id,
    kid: 'k1',
    // The factory's own default idempotencyKey collides across concurrent
    // Playwright workers (each is a separate process with its own
    // module-level counter reset to the same starting value) — use a
    // globally-unique one instead.
    idempotencyKey: `e09-e2e-${randomUUID()}`,
  });

  async function mintUnit(state: 'active' | 'flagged' | 'decommissioned') {
    const tier1 = generateCode(ring, { tenant: tenant.slug, tier: 1 }).code;
    const tier2 = generateCode(ring, { tenant: tenant.slug, tier: 2 }).code;
    const created = await unitFactory(prisma, {
      tenantId: tenant.id,
      batchId: b.id,
      productId: product.id,
      tier1Code: tier1,
      tier2Hash: hashForStorage(tier2),
      state,
    });
    return { tier1, tier2, unitId: created.id };
  }

  const authentic = await mintUnit('active');
  const already = await mintUnit('active');
  const suspicious = await mintUnit('active');
  const flagged = await mintUnit('flagged');
  const decommissioned = await mintUnit('decommissioned');
  const tier1Ok = await mintUnit('active');

  // already-verified: 1 prior scan, single region -> totalScans=2, singleRegion -> "already-verified".
  await scanEventFactory(prisma, {
    tenantId: tenant.id,
    unitId: already.unitId,
    tier: 'tier2',
    verdict: 'authentic',
    geoCountry: 'NG',
    geoCity: 'Lagos',
    createdAt: new Date(Date.now() - 86_400_000),
  });

  // suspicious: 6 prior scans across 2 regions -> totalScans=7, multiRegion -> "suspicious".
  const regions: Array<[string, string]> = [
    ['NG', 'Lagos'],
    ['GH', 'Accra'],
  ];
  for (let i = 0; i < 6; i++) {
    const [geoCountry, geoCity] = regions[i % regions.length];
    await scanEventFactory(prisma, {
      tenantId: tenant.id,
      unitId: suspicious.unitId,
      tier: 'tier2',
      verdict: 'authentic',
      geoCountry,
      geoCity,
      createdAt: new Date(Date.now() - (6 - i) * 3_600_000),
    });
  }

  const unknownWellFormed = generateCode(ring, {
    tenant: tenant.slug,
    tier: 2,
  }).code;

  return {
    authenticFirstScan: authentic.tier2,
    alreadyVerified: already.tier2,
    suspicious: suspicious.tier2,
    flagged: flagged.tier2,
    decommissioned: decommissioned.tier2,
    tier1Ok: tier1Ok.tier1,
    unknownWellFormed,
  };
}
