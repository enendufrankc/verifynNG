import { XCircle } from 'lucide-react';
import { VerdictFrame } from './VerdictFrame';
import { t } from '@/lib/i18n';
import type { VerdictComponentProps } from './types';

/** `invalid` — malformed code or bad checksum; not a counterfeiting claim. */
export function InvalidVerdict({
  data,
  redactedCode,
  locale,
}: VerdictComponentProps) {
  return (
    <VerdictFrame
      tone="util"
      icon={<XCircle className="h-8 w-8" strokeWidth={2.5} />}
      title={t(locale, 'verdict.invalid.title')}
      message={data.message}
      tier={data.tier}
      locale={locale}
      rows={[{ label: t(locale, 'verdict.row.code'), value: redactedCode }]}
    />
  );
}
