import { apiClient } from './api-client';

export interface AuditEntry {
  id: string;
  seq: string;
  tenantId: string | null;
  actorId: string | null;
  actorType: 'user' | 'system' | 'support' | string;
  actorIp: string | null;
  action: string;
  target: string;
  targetType: string;
  requestId: string | null;
  payload: Record<string, unknown>;
  createdAt: string;
}

export interface AuditFilters {
  action?: string;
  targetType?: string;
  cursor?: string;
}

// E13's list endpoint pages by seq: `{ items, cursor }` where cursor is the
// next seq to continue from (undefined when exhausted).
export async function listAudit(filters: AuditFilters = {}) {
  const query: Record<string, string> = { limit: '50' };
  if (filters.action) query.action = filters.action;
  if (filters.targetType) query.targetType = filters.targetType;
  if (filters.cursor) query.cursor = filters.cursor;
  const res = await apiClient.get<{ items: AuditEntry[]; cursor?: string }>(
    '/v1/audit',
    { query },
  );
  return { items: res.items, nextCursor: res.cursor };
}
