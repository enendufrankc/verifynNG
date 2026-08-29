import type { PrismaClient } from '@prisma/client';
import type { SeedManifest } from './lib/manifest.js';
import { startStage, endStage } from './lib/timer.js';

const IVORY_GLOW_PRODUCTS = [
  {
    sku: 'ig004',
    name: 'IVORY GLOW Turmeric & Curcumin Shower Gel 1000ml',
    gtin: '0614142000040',
  },
  {
    sku: 'ig005',
    name: 'IVORY GLOW Retinol & Amino Acids Shower Gel 1000ml',
    gtin: '0614142000057',
  },
  {
    sku: 'ig006',
    name: 'IVORY GLOW Vitamin C & B3 Shower Gel + Collagen Peptide 24 1000ml',
    gtin: '0614142000064',
  },
  {
    sku: 'ig007',
    name: 'IVORY GLOW Charcoal & Tea Tree Body Wash 500ml',
    gtin: '0614142000071',
  },
  {
    sku: 'ig008',
    name: 'IVORY GLOW Shea Butter & Lavender Lotion 400ml',
    gtin: '0614142000088',
  },
  {
    sku: 'ig009',
    name: 'IVORY GLOW Papaya & Vitamin C Brightening Bar 200g',
    gtin: '0614142000095',
  },
  {
    sku: 'ig010',
    name: 'IVORY GLOW Aloe Vera & Green Tree Hydrating Mist 150ml',
    gtin: '0614142000101',
  },
  {
    sku: 'ig011',
    name: 'IVORY GLOW Black Soap & Turmeric Exfoliating Scrub 300g',
    gtin: '0614142000118',
  },
];

const ACME_PRODUCTS = [
  { sku: 'ac001', name: 'Acme Rose Body Wash 750ml', gtin: '05012345678900' },
  { sku: 'ac002', name: 'Acme Coconut Shampoo 500ml', gtin: '05012345678917' },
  {
    sku: 'ac003',
    name: 'Acme Charcoal Face Wash 200ml',
    gtin: '05012345678924',
  },
  { sku: 'ac004', name: 'Acme Vitamin E Cream 250ml', gtin: '05012345678931' },
  { sku: 'ac005', name: 'Acme Tea Tree Oil Soap 150g', gtin: '05012345678948' },
  { sku: 'ac006', name: 'Acme Argan Oil Serum 30ml', gtin: '05012345678955' },
  { sku: 'ac007', name: 'Acme Honey & Oat Mask 100g', gtin: '05012345678962' },
];

const NKEM_PRODUCTS = [
  {
    sku: 'nk001',
    name: 'Nkem Neem Cleansing Bar 180g',
    gtin: '06012345678901',
  },
  { sku: 'nk002', name: 'Nkem Hibiscus Toner 200ml', gtin: '06012345678918' },
  {
    sku: 'nk003',
    name: 'Nkem Baobab Oil Moisturiser 150ml',
    gtin: '06012345678935',
  },
  { sku: 'nk004', name: 'Nkem Moringa Hair Oil 100ml', gtin: '06012345678942' },
  {
    sku: 'nk005',
    name: 'Nkem Shea & Cocoa Butter Balm 250g',
    gtin: '06012345678959',
  },
];

const OEMS = [
  { name: 'Lagos Manufacturing Co', country: 'NG', tenantSlug: 'ivoryglow' },
  { name: 'Shenzhen Beauty Tech', country: 'CN', tenantSlug: 'ivoryglow' },
  { name: 'London Health Products', country: 'GB', tenantSlug: 'ivoryglow' },
  { name: 'Acme UK Ltd', country: 'GB', tenantSlug: 'acme' },
  {
    name: 'Nkem Naturals Production',
    country: 'NG',
    tenantSlug: 'nkem-naturals',
  },
];

export async function seedProducts(
  prisma: PrismaClient,
  manifest: SeedManifest,
  _rng: () => number,
): Promise<void> {
  startStage('products + OEMs');

  // ── OEMs ───────────────────────────────────────────
  for (const oemDef of OEMS) {
    const tenantId = manifest.tenants[oemDef.tenantSlug]?.id;
    if (!tenantId) continue;
    const key = oemDef.name.toLowerCase().replace(/\s+/g, '_');
    // Deterministic id so re-running the seed updates instead of duplicating.
    const id = `seed_oem_${oemDef.tenantSlug}_${key}`;
    const created = await prisma.oem.upsert({
      where: { id },
      create: { id, name: oemDef.name, country: oemDef.country, tenantId },
      update: { name: oemDef.name, country: oemDef.country, tenantId },
    });
    manifest.oems[key] = {
      id: created.id,
      name: oemDef.name,
      tenantSlug: oemDef.tenantSlug,
    };
  }

  // ── Products ───────────────────────────────────────
  const productDefs = [
    ...IVORY_GLOW_PRODUCTS.map((p) => ({ ...p, tenantSlug: 'ivoryglow' })),
    ...ACME_PRODUCTS.map((p) => ({ ...p, tenantSlug: 'acme' })),
    ...NKEM_PRODUCTS.map((p) => ({ ...p, tenantSlug: 'nkem-naturals' })),
  ];

  for (const pDef of productDefs) {
    const tenantId = manifest.tenants[pDef.tenantSlug]?.id;
    if (!tenantId) continue;
    const created = await prisma.product.upsert({
      where: { tenantId_sku: { tenantId, sku: pDef.sku } },
      update: {},
      create: {
        tenantId,
        sku: pDef.sku,
        name: pDef.name,
        gtin: pDef.gtin,
      },
    });
    manifest.products[pDef.sku] = {
      id: created.id,
      sku: pDef.sku,
      tenantSlug: pDef.tenantSlug,
    };
  }

  endStage('products + OEMs');
}
