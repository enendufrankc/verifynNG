import { AlertTriangle } from 'lucide-react';
import { VerdictFrame } from './VerdictFrame';
import { HistorySummary } from '@/components/history/HistorySummary';
import { ReportPrompt } from './ReportPrompt';
import { productRows, codeRow } from '@/lib/verdict-rows';
import type { VerdictComponentProps } from './types';

/** `suspicious` — verified many times across multiple regions; reportable. */
export function SuspiciousVerdict({
  data,
  redactedCode,
  supportUrl,
}: VerdictComponentProps) {
  return (
    <VerdictFrame
      tone="susp"
      icon={<AlertTriangle className="h-8 w-8" strokeWidth={2.5} />}
      title="Check this"
      message={data.message}
      tier={data.tier}
      rows={[...productRows(data), codeRow(redactedCode)]}
    >
      {data.history && <HistorySummary history={data.history} />}
      {data.reportable && <ReportPrompt supportUrl={supportUrl} />}
    </VerdictFrame>
  );
}
