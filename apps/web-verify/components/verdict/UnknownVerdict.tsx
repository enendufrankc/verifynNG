import { CircleHelp } from 'lucide-react';
import { VerdictFrame } from './VerdictFrame';
import { ReportPrompt } from './ReportPrompt';
import { codeRow } from '@/lib/verdict-rows';
import { t } from '@/lib/i18n';
import type { VerdictComponentProps } from './types';

/** `unknown` — well-formed code, not in the registry; likely counterfeit. Reportable. */
export function UnknownVerdict({
  data,
  redactedCode,
  supportUrl,
  locale,
}: VerdictComponentProps) {
  return (
    <VerdictFrame
      tone="unk"
      icon={<CircleHelp className="h-8 w-8" strokeWidth={2.5} />}
      title={t(locale, 'verdict.unknown.title')}
      message={data.message}
      tier={data.tier}
      locale={locale}
      rows={[codeRow(redactedCode, locale)]}
    >
      {data.reportable && (
        <ReportPrompt supportUrl={supportUrl} locale={locale} />
      )}
    </VerdictFrame>
  );
}
