import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

export interface SeedManifest {
  seed: number;
  scale: number;
  generatedAt: string;
  anchorTime: string;
  tenants: Record<string, { id: string; slug: string }>;
  users: Record<
    string,
    { id: string; email: string; role: string; tenantSlug: string }
  >;
  products: Record<string, { id: string; sku: string; tenantSlug: string }>;
  oems: Record<string, { id: string; name: string; tenantSlug: string }>;
  batches: Record<string, { id: string; tenantSlug: string }>;
  units: Record<string, { id: string; tier1Code: string; tenantSlug: string }>;
  anomalies: Record<
    string,
    Record<string, { unitId: string; batchId: string; type: string }>
  >;
}

const MANIFEST_PATH = resolve(__dirname, '../manifest.json');

export function writeManifest(manifest: SeedManifest): void {
  writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2) + '\n');
  console.log(`Manifest written to ${MANIFEST_PATH}`);
}

export function emptyManifest(
  seed: number,
  scale: number,
  anchorTime: string,
): SeedManifest {
  return {
    seed,
    scale,
    generatedAt: new Date().toISOString(),
    anchorTime,
    tenants: {},
    users: {},
    products: {},
    oems: {},
    batches: {},
    units: {},
    anomalies: {},
  };
}
