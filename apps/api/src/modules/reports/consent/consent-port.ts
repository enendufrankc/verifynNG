export const CONSENT_PORT = 'CONSENT_PORT';

export interface RecordConsentInput {
  subjectEmail?: string;
  subjectPhone?: string;
  purpose: string;
  tenantId: string;
  source: string;
  textVersion: string;
}

export interface ConsentPort {
  record(input: RecordConsentInput): Promise<string>;
}
