/**
 * Canonical public-API scope catalogue. Shared by CreateApiKeyDto validation,
 * ScopesGuard, and the OpenAPI security-scheme description (T6).
 */
export const API_KEY_SCOPES = [
  'read:batches',
  'write:batches',
  'read:units',
  'write:units',
  'read:scans',
  'read:reports',
] as const;

export type ApiKeyScope = (typeof API_KEY_SCOPES)[number];
