import { ShieldCheck } from 'lucide-react';
import { VerdictFrame } from './VerdictFrame';
import { productRows, codeRow } from '@/lib/verdict-rows';
import type { VerdictComponentProps } from './types';

/** `authentic` — tier-2 first-ever verification of this unit. */
export function AuthenticVerdict({
  data,
  redactedCode,
}: VerdictComponentProps) {
  return (
    <VerdictFrame
      tone="pos"
      icon={<ShieldCheck className="h-8 w-8" strokeWidth={2.5} />}
      title="Authentic"
      message={data.message}
      tier={data.tier}
      rows={[...productRows(data), codeRow(redactedCode)]}
    />
  );
}
