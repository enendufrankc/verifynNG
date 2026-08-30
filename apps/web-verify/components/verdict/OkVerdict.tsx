import { Check } from 'lucide-react';
import { VerdictFrame } from './VerdictFrame';
import { EducationPanel } from '@/components/education/EducationPanel';
import { productRows, codeRow } from '@/lib/verdict-rows';
import { t } from '@/lib/i18n';
import type { VerdictComponentProps } from './types';

/** `ok` — tier-1 public QR scan of a genuine product line (no unit-level claim). */
export function OkVerdict({
  data,
  redactedCode,
  locale,
  tenantSlug,
}: VerdictComponentProps & { tenantSlug: string }) {
  return (
    <VerdictFrame
      tone="pos"
      icon={<Check className="h-8 w-8" strokeWidth={2.5} />}
      title={t(locale, 'verdict.ok.title')}
      message={data.message}
      tier={data.tier}
      locale={locale}
      rows={[...productRows(data, locale), codeRow(redactedCode, locale)]}
    >
      <EducationPanel data={data} tenantSlug={tenantSlug} locale={locale} />
    </VerdictFrame>
  );
}
