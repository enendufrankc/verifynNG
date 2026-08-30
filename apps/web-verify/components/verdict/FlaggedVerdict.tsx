import { Flag } from 'lucide-react';
import { VerdictFrame } from './VerdictFrame';
import { HistorySummary } from '@/components/history/HistorySummary';
import { ReportPrompt } from './ReportPrompt';
import { productRows, codeRow } from '@/lib/verdict-rows';
import type { VerdictComponentProps } from './types';

/** `flagged` — the brand flagged this code after suspicious activity; reportable. */
export function FlaggedVerdict({
  data,
  redactedCode,
  supportUrl,
}: VerdictComponentProps) {
  return (
    <VerdictFrame
      tone="flag"
      icon={<Flag className="h-8 w-8" strokeWidth={2.5} />}
      title="Flagged by the brand"
      message={data.message}
      tier={data.tier}
      rows={[...productRows(data), codeRow(redactedCode)]}
    >
      {data.history && <HistorySummary history={data.history} />}
      {data.reportable && <ReportPrompt supportUrl={supportUrl} />}
    </VerdictFrame>
  );
}
