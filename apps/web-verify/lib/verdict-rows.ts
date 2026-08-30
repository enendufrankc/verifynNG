import type { VerifyResponse } from './api';
import type { VerdictRow } from '@/components/verdict/VerdictFrame';
import { t, type Locale } from '@/lib/i18n';

/** Product/batch rows shared by every verdict where a unit was found. */
export function productRows(
  data: VerifyResponse,
  locale: Locale,
): VerdictRow[] {
  const rows: VerdictRow[] = [];
  if (data.product) {
    rows.push({
      label: t(locale, 'verdict.row.product'),
      value: data.product.name,
    });
  }
  if (data.batch) {
    rows.push({ label: t(locale, 'verdict.row.batch'), value: data.batch.id });
    if (data.batch.oem) {
      rows.push({
        label: t(locale, 'verdict.row.manufacturer'),
        value: data.batch.oem,
      });
    }
    rows.push({
      label: t(locale, 'verdict.row.commissioned'),
      value: new Date(data.batch.commissionedAt).toLocaleDateString(locale, {
        year: 'numeric',
        month: 'long',
      }),
    });
  }
  return rows;
}

export function codeRow(redactedCode: string, locale: Locale): VerdictRow {
  return { label: t(locale, 'verdict.row.code'), value: redactedCode };
}
