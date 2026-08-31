import { describe, it, expect } from 'vitest';
import type { Batch, Unit, ScanEvent, Report } from '@prisma/client';
import { toPublicBatch } from './batch.mapper.js';
import { toPublicUnit } from './unit.mapper.js';
import { toPublicScanEvent } from './scan-event.mapper.js';
import { toPublicReport } from './report.mapper.js';

const batch: Batch = {
  id: 'batch-1',
  tenantId: 'tenant-1',
  productId: 'product-1',
  oemId: null,
  count: 100,
  status: 'minted',
  idempotencyKey: 'secret-idem-key',
  requestedBy: 'user-1',
  note: null,
  watermark: 'WM',
  kid: 'k1',
  mintedCount: 100,
  lastChunk: 1,
  jobId: null,
  failedReason: null,
  manifestObjectKey: 'objects/manifest.bin',
  manifestSha256: 'deadbeef',
  exportsReadyAt: null,
  mintedAt: null,
  expectedShipDate: null,
  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-01-01T00:00:00Z'),
};

const unit: Unit = {
  id: 'unit-1',
  tenantId: 'tenant-1',
  batchId: 'batch-1',
  tier1Code: 'brand.1.k1.payload.checksum',
  tier2Hash: 'ffeeddccbbaa99887766554433221100',
  state: 'active',
  serial: 1,
  productId: 'product-1',
  createdAt: new Date('2026-01-01T00:00:00Z'),
};

const scan: ScanEvent = {
  id: 'scan-1',
  tenantId: 'tenant-1',
  unitId: 'unit-1',
  tier: 'tier1',
  verdict: 'valid',
  batchId: 'batch-1',
  productId: 'product-1',
  source: 'qr',
  codeRedacted: 'brand.1.k1.****.checksum',
  ipHash: 'hash-of-ip',
  ipPrefix: '203.0.113',
  geoCountry: 'NG',
  geoRegion: 'Lagos',
  geoCity: 'Lagos',
  deviceClass: 'mobile',
  userAgent: 'Mozilla/5.0 secret-fingerprint',
  latencyMs: 42,
  createdAt: new Date('2026-01-01T00:00:00Z'),
};

const report: Report = {
  id: 'report-1',
  tenantId: 'tenant-1',
  reference: 'REF-1',
  scanEventId: 'scan-1',
  unitId: 'unit-1',
  batchId: 'batch-1',
  productId: 'product-1',
  verdictAtReport: 'suspicious',
  sellerName: 'Market Stall',
  sellerLocation: 'Lagos',
  purchaseChannel: 'open_market',
  purchaseDate: null,
  description: null,
  contactEmail: 'consumer@example.com',
  contactPhone: '+2340000000',
  contactConsentId: 'consent-1',
  contactPurgedAt: null,
  status: 'new',
  outcome: null,
  assignedToId: null,
  ipHash: 'hash-of-ip',
  userAgent: 'Mozilla/5.0',
  locale: 'en',
  closedAt: null,
  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-01-01T00:00:00Z'),
};

describe('public-api mappers (allow-list whitelist)', () => {
  it('toPublicBatch never leaks idempotencyKey/requestedBy/jobId/failedReason/lastChunk/manifest artifacts', () => {
    const result = toPublicBatch(batch);
    expect(Object.keys(result).sort()).toEqual(
      [
        'id',
        'tenantId',
        'productId',
        'oemId',
        'count',
        'status',
        'mintedCount',
        'watermark',
        'kid',
        'note',
        'expectedShipDate',
        'mintedAt',
        'exportsReadyAt',
        'createdAt',
        'updatedAt',
      ].sort(),
    );
    expect(result).not.toHaveProperty('idempotencyKey');
    expect(result).not.toHaveProperty('requestedBy');
    expect(result).not.toHaveProperty('jobId');
    expect(result).not.toHaveProperty('failedReason');
    expect(result).not.toHaveProperty('lastChunk');
    expect(result).not.toHaveProperty('manifestObjectKey');
    expect(result).not.toHaveProperty('manifestSha256');
  });

  it('toPublicUnit never returns the full tier2Hash', () => {
    const result = toPublicUnit(unit);
    expect(Object.keys(result).sort()).toEqual(
      [
        'id',
        'tenantId',
        'batchId',
        'productId',
        'tier1Code',
        'tier2HashRedacted',
        'state',
        'serial',
        'createdAt',
      ].sort(),
    );
    expect(result).not.toHaveProperty('tier2Hash');
    expect(JSON.stringify(result)).not.toContain(unit.tier2Hash);
    expect(result.tier2HashRedacted).toBe('ffeeddcc…');
  });

  it('toPublicScanEvent never leaks ipHash/ipPrefix/userAgent/deviceClass/latencyMs', () => {
    const result = toPublicScanEvent(scan);
    expect(Object.keys(result).sort()).toEqual(
      [
        'id',
        'tenantId',
        'unitId',
        'batchId',
        'productId',
        'tier',
        'verdict',
        'source',
        'codeRedacted',
        'geoCountry',
        'geoCity',
        'createdAt',
      ].sort(),
    );
    expect(result).not.toHaveProperty('ipHash');
    expect(result).not.toHaveProperty('ipPrefix');
    expect(result).not.toHaveProperty('userAgent');
    expect(result).not.toHaveProperty('deviceClass');
    expect(result).not.toHaveProperty('latencyMs');
  });

  it('toPublicReport never leaks contact PII or ipHash/userAgent', () => {
    const result = toPublicReport(report);
    expect(Object.keys(result).sort()).toEqual(
      [
        'id',
        'tenantId',
        'reference',
        'scanEventId',
        'unitId',
        'batchId',
        'productId',
        'verdictAtReport',
        'sellerName',
        'sellerLocation',
        'purchaseChannel',
        'purchaseDate',
        'description',
        'status',
        'outcome',
        'assignedToId',
        'locale',
        'closedAt',
        'createdAt',
        'updatedAt',
      ].sort(),
    );
    expect(result).not.toHaveProperty('contactEmail');
    expect(result).not.toHaveProperty('contactPhone');
    expect(result).not.toHaveProperty('contactConsentId');
    expect(result).not.toHaveProperty('contactPurgedAt');
    expect(result).not.toHaveProperty('ipHash');
    expect(result).not.toHaveProperty('userAgent');
  });
});
