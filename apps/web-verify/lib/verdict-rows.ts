import type { VerifyResponse } from './api';
import type { VerdictRow } from '@/components/verdict/VerdictFrame';

/** Product/batch rows shared by every verdict where a unit was found. */
export function productRows(data: VerifyResponse): VerdictRow[] {
  const rows: VerdictRow[] = [];
  if (data.product) rows.push({ label: 'Product', value: data.product.name });
  if (data.batch) {
    rows.push({ label: 'Batch', value: data.batch.id });
    if (data.batch.oem) {
      rows.push({ label: 'Manufacturer', value: data.batch.oem });
    }
    rows.push({
      label: 'Commissioned',
      value: new Date(data.batch.commissionedAt).toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'long',
      }),
    });
  }
  return rows;
}

export function codeRow(redactedCode: string): VerdictRow {
  return { label: 'Code', value: redactedCode };
}
