import { apiClient } from './api-client';

export interface MfaPolicy {
  requiredRoles: string[];
  gracePeriodDays: number;
  enforcedFrom: string | null;
  affectedMembers: Array<{
    userId: string;
    email: string;
    role: string;
    daysRemaining: number;
  }>;
}

export interface SetMfaPolicyInput {
  requiredRoles: string[];
  gracePeriodDays: number;
}

export function getMfaPolicy(tenantPath: (path: string) => string) {
  return apiClient.get<MfaPolicy>(tenantPath('/security/mfa-policy'));
}

export function setMfaPolicy(
  tenantPath: (path: string) => string,
  input: SetMfaPolicyInput,
) {
  return apiClient.put<MfaPolicy>(tenantPath('/security/mfa-policy'), input);
}
