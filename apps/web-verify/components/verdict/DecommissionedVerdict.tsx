import { Ban } from 'lucide-react';
import { VerdictFrame } from './VerdictFrame';
import { productRows, codeRow } from '@/lib/verdict-rows';
import type { VerdictComponentProps } from './types';

/** `decommissioned` — withdrawn by the brand (recall or fraud investigation). Not reportable: the brand already knows. */
export function DecommissionedVerdict({
  data,
  redactedCode,
}: VerdictComponentProps) {
  return (
    <VerdictFrame
      tone="dec"
      icon={<Ban className="h-8 w-8" strokeWidth={2.5} />}
      title="Withdrawn"
      message={data.message}
      tier={data.tier}
      rows={[...productRows(data), codeRow(redactedCode)]}
    />
  );
}
