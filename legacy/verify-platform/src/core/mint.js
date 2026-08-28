// core/mint.js — batch minting: creates units, tier-1 + tier-2 codes, signed manifest
import { makeCode, codeHash, signManifest } from './crypto.js';
import { store } from './store.js';

export function mintBatch({ tenantId, productId, oem, count, baseUrl }) {
  const tenant = store.getTenant(tenantId);
  if (!tenant) throw new Error(`unknown tenant: ${tenantId}`);
  const product = tenant.products.find(p => p.id === productId);
  if (!product) throw new Error(`unknown product: ${productId}`);
  if (!Number.isInteger(count) || count < 1 || count > 100000) throw new Error('count must be 1..100000');

  const batchId = `B-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${makeCode(tenantId, '2').split('.')[2].slice(0, 6)}`;

  const units = [];
  const manifestUnits = [];
  for (let i = 0; i < count; i++) {
    const unitId = `${batchId}-${String(i + 1).padStart(6, '0')}`;
    const tier1Code = makeCode(tenantId, '1');
    const tier2Code = makeCode(tenantId, '2');
    units.push({
      id: unitId,
      batch: batchId,
      tenant: tenantId,
      product: productId,
      tier1Code,                                   // public — printed as-is
      tier2Hash: codeHash(tier2Code),             // secret — hash only at rest
      commissionedAt: new Date().toISOString(),
    });
    manifestUnits.push({
      unitId,
      tier1Code,
      tier2Code,                                  // appears ONLY in the manifest export
    });
  }

  const batch = {
    id: batchId,
    tenant: tenantId,
    product: productId,
    oem: oem || null,
    count,
    createdAt: new Date().toISOString(),
  };

  store.insertBatch(batch);
  store.insertUnits(units);

  const manifest = {
    version: 1,
    batch: batchId,
    tenant: tenantId,
    product: { id: product.id, name: product.name },
    oem: batch.oem,
    count,
    baseUrl,
    units: manifestUnits,
    createdAt: batch.createdAt,
  };
  manifest.signature = signManifest({ ...manifest, signature: undefined });

  return { batch, manifest };
}
