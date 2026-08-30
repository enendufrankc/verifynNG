import { XCircle } from 'lucide-react';
import { VerdictFrame } from './VerdictFrame';
import type { VerdictComponentProps } from './types';

/** `invalid` — malformed code or bad checksum; not a counterfeiting claim. */
export function InvalidVerdict({ data, redactedCode }: VerdictComponentProps) {
  return (
    <VerdictFrame
      tone="util"
      icon={<XCircle className="h-8 w-8" strokeWidth={2.5} />}
      title="Not a valid code"
      message={data.message}
      tier={data.tier}
      rows={[{ label: 'Code', value: redactedCode }]}
    />
  );
}
