import type { BatchInfoBlock as BatchInfoBlockType } from '@verifynng/page-schema';

export interface BatchContext {
  batchId: string;
  /** OEM display label — a country on the standalone page (E04 batch data),
   * the manufacturer name inside the tier-1 verdict (that's what E09's
   * verdict payload carries). */
  oemLabel?: string;
  commissionedAt?: string;
}

/**
 * Auto block — on the standalone page (no scanned unit) it's a "scan your
 * bottle" prompt; inside a tier-1 verdict (T7) `context` is populated from
 * the verdict's batch data.
 */
export function BatchInfoBlock({
  block,
  context,
}: {
  block: BatchInfoBlockType;
  context?: BatchContext;
}) {
  return (
    <section className="border-border bg-surface p-s6 mx-auto max-w-md rounded-lg border text-center">
      {block.heading && (
        <h2 className="mb-s3 text-lg font-semibold">{block.heading}</h2>
      )}
      {!context && (
        <p className="text-fg-muted text-sm">
          Scan the QR code on your bottle to see this bottle&apos;s batch,
          origin and commission date.
        </p>
      )}
      {context && (
        <dl className="text-fg space-y-s2 text-sm">
          <div className="flex justify-between">
            <dt className="text-fg-muted">Batch</dt>
            <dd className="font-medium">{context.batchId}</dd>
          </div>
          {block.showOem && context.oemLabel && (
            <div className="flex justify-between">
              <dt className="text-fg-muted">Manufacturer</dt>
              <dd className="font-medium">{context.oemLabel}</dd>
            </div>
          )}
          {block.showCommissionDate && context.commissionedAt && (
            <div className="flex justify-between">
              <dt className="text-fg-muted">Commissioned</dt>
              <dd className="font-medium">
                {new Date(context.commissionedAt).toLocaleDateString('en', {
                  year: 'numeric',
                  month: 'long',
                })}
              </dd>
            </div>
          )}
        </dl>
      )}
    </section>
  );
}
