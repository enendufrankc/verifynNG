import { Flag } from 'lucide-react';
import { VerdictFrame } from './VerdictFrame';
import { HistorySummary } from '@/components/history/HistorySummary';
import { ReportPrompt } from './ReportPrompt';
import { productRows, codeRow } from '@/lib/verdict-rows';
import { t } from '@/lib/i18n';
import type { VerdictComponentProps } from './types';

/** `flagged` — the brand flagged this code after suspicious activity; reportable. */
export function FlaggedVerdict({
  data,
  redactedCode,
  supportUrl,
  locale,
}: VerdictComponentProps) {
  return (
    <VerdictFrame
      tone="flag"
      icon={<Flag className="h-8 w-8" strokeWidth={2.5} />}
      title={t(locale, 'verdict.flagged.title')}
      message={data.message}
      tier={data.tier}
      locale={locale}
      rows={[...productRows(data, locale), codeRow(redactedCode, locale)]}
    >
      {data.history && (
        <HistorySummary history={data.history} locale={locale} />
      )}
      {data.reportable && (
        <ReportPrompt supportUrl={supportUrl} locale={locale} />
      )}
    </VerdictFrame>
  );
}
