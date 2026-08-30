import type { VerifyResponse } from '@/lib/api';
import type { Locale } from '@/lib/i18n';

export interface VerdictComponentProps {
  data: VerifyResponse;
  redactedCode: string;
  /** Tenant support URL, for the report-a-concern prompt. */
  supportUrl?: string;
  locale: Locale;
}
