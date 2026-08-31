import type { Batch } from '@prisma/client';

/** Explicit allow-list — never spread the Prisma row. Internal orchestration
 * fields (idempotencyKey, requestedBy, jobId, failedReason, lastChunk,
 * manifestObjectKey, manifestSha256) stay internal. */
export function toPublicBatch(batch: Batch) {
  return {
    id: batch.id,
    tenantId: batch.tenantId,
    productId: batch.productId,
    oemId: batch.oemId,
    count: batch.count,
    status: batch.status,
    mintedCount: batch.mintedCount,
    watermark: batch.watermark,
    kid: batch.kid,
    note: batch.note,
    expectedShipDate: batch.expectedShipDate,
    mintedAt: batch.mintedAt,
    exportsReadyAt: batch.exportsReadyAt,
    createdAt: batch.createdAt,
    updatedAt: batch.updatedAt,
  };
}

export type PublicBatch = ReturnType<typeof toPublicBatch>;
