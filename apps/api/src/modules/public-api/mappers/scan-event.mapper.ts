import type { ScanEvent } from '@prisma/client';

/** Explicit allow-list. Raw IPs/user-agents/full geo detail stay internal —
 * only coarse geo and the redacted code are exposed. */
export function toPublicScanEvent(scan: ScanEvent) {
  return {
    id: scan.id,
    tenantId: scan.tenantId,
    unitId: scan.unitId,
    batchId: scan.batchId,
    productId: scan.productId,
    tier: scan.tier,
    verdict: scan.verdict,
    source: scan.source,
    codeRedacted: scan.codeRedacted,
    geoCountry: scan.geoCountry,
    geoCity: scan.geoCity,
    createdAt: scan.createdAt,
  };
}

export type PublicScanEvent = ReturnType<typeof toPublicScanEvent>;
