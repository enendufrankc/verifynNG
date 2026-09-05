import { apiClient } from './api-client';

export interface SsoConfig {
  enabled: boolean;
  provider?: 'google' | 'microsoft' | 'fake';
  clientId?: string;
  clientSecretLast4?: string;
  issuer?: string | null;
  allowedDomains?: string[];
  jitProvisioning?: boolean;
  jitDefaultRole?: string;
  enforceSso?: boolean;
  lastTestedAt?: string | null;
  lastTestResult?: string | null;
}

export interface UpsertSsoConfigInput {
  provider: 'google' | 'microsoft' | 'fake';
  clientId: string;
  clientSecret?: string;
  issuer?: string;
  allowedDomains: string[];
  jitProvisioning: boolean;
  jitDefaultRole: 'viewer' | 'operator';
  enforceSso: boolean;
}

export interface SsoTestResult {
  ok: boolean;
  issuer?: string;
  authorizationEndpoint?: string;
  emailVerifiedClaimAvailable?: boolean;
  error?: string;
}

export function getSsoConfig(tenantPath: (path: string) => string) {
  return apiClient.get<SsoConfig>(tenantPath('/sso'));
}

export function upsertSsoConfig(
  tenantPath: (path: string) => string,
  input: UpsertSsoConfigInput,
) {
  return apiClient.put<SsoConfig>(tenantPath('/sso'), input);
}

export function testSsoConnection(tenantPath: (path: string) => string) {
  return apiClient.post<SsoTestResult>(tenantPath('/sso/test'));
}

export function disableSso(tenantPath: (path: string) => string) {
  return apiClient.delete<void>(tenantPath('/sso'));
}
