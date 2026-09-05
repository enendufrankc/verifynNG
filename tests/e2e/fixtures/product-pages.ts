import { randomUUID } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import { StaticKeyRing, generateCode, hashForStorage } from '@verifynng/core';
import {
  batch as batchFactory,
  unit as unitFactory,
} from '@verifynng/db/testing';

/**
 * Every IVORY GLOW product from `pnpm db:seed` already has a ProductPage
 * (ProductPage.productId is `@unique` — one page per product, T12's seed
 * publishes turmeric and drafts retinol/vitamin-c), so the builder-flow E2E
 * spec needs its own throwaway product to exercise "Create page" against.
 */
export async function seedPageableProduct(
  prisma: PrismaClient,
): Promise<{ productId: string; sku: string; name: string }> {
  const tenant = await prisma.tenant.findUniqueOrThrow({
    where: { slug: 'ivoryglow' },
  });
  const sku = `e10-e2e-${randomUUID().slice(0, 8)}`;
  const product = await prisma.product.create({
    data: {
      tenantId: tenant.id,
      sku,
      name: 'E2E Builder Test Product',
    },
  });
  return { productId: product.id, sku, name: product.name };
}

/**
 * Mints a real tier-1 code for `ig005` (Retinol) — T12 ships that product
 * with a *draft-only* page (never published), so the tier-1 slot renderer
 * must fall through to E09's default fallback for it. Same StaticKeyRing
 * convention as seedVerifyFixtures — this key must match the one
 * docker/compose.yml hardcodes for the api/api-worker services.
 */
export async function seedTier1WithoutPage(
  prisma: PrismaClient,
): Promise<string> {
  const ring = new StaticKeyRing(
    'k1:0000000000000000000000000000000000000000000000000000000000000000',
    'k1',
  );
  const tenant = await prisma.tenant.findUniqueOrThrow({
    where: { slug: 'ivoryglow' },
  });
  const product = await prisma.product.findFirstOrThrow({
    where: { tenantId: tenant.id, sku: 'ig005' },
  });
  const b = await batchFactory(prisma, {
    tenantId: tenant.id,
    productId: product.id,
    kid: 'k1',
    idempotencyKey: `e10-e2e-${randomUUID()}`,
  });
  const tier1 = generateCode(ring, { tenant: tenant.slug, tier: 1 }).code;
  const tier2 = generateCode(ring, { tenant: tenant.slug, tier: 2 }).code;
  await unitFactory(prisma, {
    tenantId: tenant.id,
    batchId: b.id,
    productId: product.id,
    tier1Code: tier1,
    tier2Hash: hashForStorage(tier2),
    state: 'active',
  });
  return tier1;
}
