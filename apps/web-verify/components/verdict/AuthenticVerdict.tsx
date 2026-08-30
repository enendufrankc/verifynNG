import { ShieldCheck } from 'lucide-react';
import { VerdictFrame } from './VerdictFrame';
import { productRows, codeRow } from '@/lib/verdict-rows';
import { t } from '@/lib/i18n';
import type { VerdictComponentProps } from './types';

/** `authentic` — tier-2 first-ever verification of this unit. */
export function AuthenticVerdict({
  data,
  redactedCode,
  locale,
}: VerdictComponentProps) {
  return (
    <VerdictFrame
      tone="pos"
      icon={<ShieldCheck className="h-8 w-8" strokeWidth={2.5} />}
      title={t(locale, 'verdict.authentic.title')}
      message={data.message}
      tier={data.tier}
      locale={locale}
      rows={[...productRows(data, locale), codeRow(redactedCode, locale)]}
    />
  );
}
