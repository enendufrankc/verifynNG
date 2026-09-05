import { apiClient } from './api-client';

export const API_KEY_SCOPES = [
  'read:batches',
  'write:batches',
  'read:units',
  'write:units',
  'read:scans',
  'read:reports',
] as const;
export type ApiKeyScope = (typeof API_KEY_SCOPES)[number];

export interface ApiKey {
  id: string;
  tenantId: string;
  name: string;
  prefix: string;
  mode: 'live' | 'test';
  scopes: string[];
  createdById: string;
  lastUsedAt: string | null;
  expiresAt: string | null;
  revokedAt: string | null;
  createdAt: string;
}

export function listApiKeys(tenantPath: (path: string) => string) {
  return apiClient.get<ApiKey[]>(tenantPath('/api-keys'));
}

export function createApiKey(
  tenantPath: (path: string) => string,
  input: {
    name: string;
    scopes: ApiKeyScope[];
    mode: 'live' | 'test';
    expiresAt?: string;
  },
) {
  return apiClient.post<{ key: string; record: ApiKey }>(
    tenantPath('/api-keys'),
    input,
  );
}

export function revokeApiKey(tenantPath: (path: string) => string, id: string) {
  return apiClient.delete<void>(tenantPath(`/api-keys/${id}`));
}
