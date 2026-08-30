import { Ban } from 'lucide-react';
import { VerdictFrame } from './VerdictFrame';
import { productRows, codeRow } from '@/lib/verdict-rows';
import { t } from '@/lib/i18n';
import type { VerdictComponentProps } from './types';

/** `decommissioned` — withdrawn by the brand (recall or fraud investigation). Not reportable: the brand already knows. */
export function DecommissionedVerdict({
  data,
  redactedCode,
  locale,
}: VerdictComponentProps) {
  return (
    <VerdictFrame
      tone="dec"
      icon={<Ban className="h-8 w-8" strokeWidth={2.5} />}
      title={t(locale, 'verdict.decommissioned.title')}
      message={data.message}
      tier={data.tier}
      locale={locale}
      rows={[...productRows(data, locale), codeRow(redactedCode, locale)]}
    />
  );
}
