import type { Report } from '@prisma/client';

/** Explicit allow-list. Consumer PII (contactEmail, contactPhone, ipHash,
 * userAgent, contactConsentId) never leaves the internal console. */
export function toPublicReport(report: Report) {
  return {
    id: report.id,
    tenantId: report.tenantId,
    reference: report.reference,
    scanEventId: report.scanEventId,
    unitId: report.unitId,
    batchId: report.batchId,
    productId: report.productId,
    verdictAtReport: report.verdictAtReport,
    sellerName: report.sellerName,
    sellerLocation: report.sellerLocation,
    purchaseChannel: report.purchaseChannel,
    purchaseDate: report.purchaseDate,
    description: report.description,
    status: report.status,
    outcome: report.outcome,
    assignedToId: report.assignedToId,
    locale: report.locale,
    closedAt: report.closedAt,
    createdAt: report.createdAt,
    updatedAt: report.updatedAt,
  };
}

export type PublicReport = ReturnType<typeof toPublicReport>;
