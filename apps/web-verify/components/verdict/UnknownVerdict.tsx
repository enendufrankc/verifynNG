import { CircleHelp } from 'lucide-react';
import { VerdictFrame } from './VerdictFrame';
import { ReportPrompt } from './ReportPrompt';
import { codeRow } from '@/lib/verdict-rows';
import type { VerdictComponentProps } from './types';

/** `unknown` — well-formed code, not in the registry; likely counterfeit. Reportable. */
export function UnknownVerdict({
  data,
  redactedCode,
  supportUrl,
}: VerdictComponentProps) {
  return (
    <VerdictFrame
      tone="unk"
      icon={<CircleHelp className="h-8 w-8" strokeWidth={2.5} />}
      title="Not recognised"
      message={data.message}
      tier={data.tier}
      rows={[codeRow(redactedCode)]}
    >
      {data.reportable && <ReportPrompt supportUrl={supportUrl} />}
    </VerdictFrame>
  );
}
