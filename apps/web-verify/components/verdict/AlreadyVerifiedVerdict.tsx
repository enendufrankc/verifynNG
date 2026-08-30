import { History } from 'lucide-react';
import { VerdictFrame } from './VerdictFrame';
import { HistorySummary } from '@/components/history/HistorySummary';
import { productRows, codeRow } from '@/lib/verdict-rows';
import { t } from '@/lib/i18n';
import type { VerdictComponentProps } from './types';

/**
 * `already-verified` — tier-2 unit seen before, within the "normal for
 * resale or shared use" band (E06 decides this, not us). No report CTA:
 * this is not a warning.
 */
export function AlreadyVerifiedVerdict({
  data,
  redactedCode,
  locale,
}: VerdictComponentProps) {
  return (
    <VerdictFrame
      tone="hist"
      icon={<History className="h-8 w-8" strokeWidth={2.5} />}
      title={t(locale, 'verdict.already-verified.title')}
      message={data.message}
      tier={data.tier}
      locale={locale}
      rows={[...productRows(data, locale), codeRow(redactedCode, locale)]}
    >
      {data.history && (
        <HistorySummary history={data.history} locale={locale} />
      )}
    </VerdictFrame>
  );
}
