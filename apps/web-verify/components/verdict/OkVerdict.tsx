import { Check } from 'lucide-react';
import { VerdictFrame } from './VerdictFrame';
import { EducationPanel } from '@/components/education/EducationPanel';
import { productRows, codeRow } from '@/lib/verdict-rows';
import type { VerdictComponentProps } from './types';

/** `ok` — tier-1 public QR scan of a genuine product line (no unit-level claim). */
export function OkVerdict({
  data,
  redactedCode,
  tenantSlug,
}: VerdictComponentProps & { tenantSlug: string }) {
  return (
    <VerdictFrame
      tone="pos"
      icon={<Check className="h-8 w-8" strokeWidth={2.5} />}
      title="Genuine"
      message={data.message}
      tier={data.tier}
      rows={[...productRows(data), codeRow(redactedCode)]}
    >
      <EducationPanel data={data} tenantSlug={tenantSlug} />
    </VerdictFrame>
  );
}
