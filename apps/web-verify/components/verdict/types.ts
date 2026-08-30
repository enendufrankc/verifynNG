import type { VerifyResponse } from '@/lib/api';

export interface VerdictComponentProps {
  data: VerifyResponse;
  redactedCode: string;
  /** Tenant support URL, for the report-a-concern prompt. */
  supportUrl?: string;
}
