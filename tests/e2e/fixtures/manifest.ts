import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export interface SeedManifest {
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
  [key: string]: unknown;
}

let _manifest: SeedManifest | undefined;

export function loadManifest(): SeedManifest {
  if (_manifest) return _manifest;
  const path = resolve(
    __dirname,
    '../../../../packages/db/prisma/seed/realistic/manifest.json',
  );
  const raw = readFileSync(path, 'utf-8');
  _manifest = JSON.parse(raw);
  return _manifest!;
}
