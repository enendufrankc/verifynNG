import { apiClient } from './api-client';

export type ImpersonationMode = 'read' | 'write';

export interface StartImpersonationResult {
  id: string;
  token: string;
  expiresAt: string;
  mode: ImpersonationMode;
  tenantId: string;
}

export function startImpersonation(input: {
  tenantId: string;
  mode: ImpersonationMode;
  reason?: string;
}) {
  return apiClient.post<StartImpersonationResult>(
    '/v1/platform/impersonation',
    input,
  );
}

export function endImpersonation(sessionId: string) {
  return apiClient.delete<void>(`/v1/platform/impersonation/${sessionId}`);
}

export interface ImpersonationSessionRow {
  id: string;
  supportUserId: string;
  tenantId: string;
  mode: ImpersonationMode;
  reason: string | null;
  startedAt: string;
  expiresAt: string;
  endedAt: string | null;
  endedBy: string | null;
}

export function listActiveImpersonations() {
  return apiClient.get<ImpersonationSessionRow[]>(
    '/v1/platform/impersonation/active',
  );
}

export function listImpersonationHistory() {
  return apiClient.get<{
    items: ImpersonationSessionRow[];
    cursor?: string;
  }>('/v1/platform/impersonation');
}
