import { apiClient } from './api-client';

export interface AuthSession {
  id: string;
  device: string;
  ip: string;
  lastActiveAt: string;
  current: boolean;
}

export interface MfaSetup {
  otpauthUri: string;
  secret: string;
}

export function changePassword(input: {
  currentPassword: string;
  newPassword: string;
}) {
  return apiClient.post<void>('/auth/password/change', input);
}

export function listSessions() {
  return apiClient.get<AuthSession[]>('/auth/sessions');
}

export function revokeSession(sessionId: string) {
  return apiClient.delete<void>(`/auth/sessions/${sessionId}`);
}

export function revokeAllSessions() {
  return apiClient.delete<void>('/auth/sessions');
}

export function setupMfa() {
  return apiClient.post<MfaSetup>('/auth/mfa/setup');
}

export function enableMfa(code: string) {
  return apiClient.post<{ recoveryCodes: string[] }>('/auth/mfa/enable', {
    code,
  });
}

export function disableMfa(code: string) {
  return apiClient.post<void>('/auth/mfa/disable', { code });
}

export function rotateRecoveryCodes() {
  return apiClient.post<{ recoveryCodes: string[] }>(
    '/auth/mfa/recovery-codes/rotate',
  );
}
