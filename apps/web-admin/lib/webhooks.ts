import { apiClient } from './api-client';

export const WEBHOOK_EVENT_CATALOGUE = [
  'scan.suspicious',
  'unit.flagged',
  'unit.decommissioned',
  'anomaly.detected',
  'batch.minted',
  'batch.printed',
  'batch.shipped',
  'report.created',
] as const;
export type WebhookEventName = (typeof WEBHOOK_EVENT_CATALOGUE)[number];

export interface WebhookEndpoint {
  id: string;
  tenantId: string;
  url: string;
  events: string[];
  status: 'active' | 'disabled';
  description: string | null;
  failureStreak: number;
  createdAt: string;
  updatedAt: string;
}

export interface WebhookDelivery {
  id: string;
  endpointId: string;
  event: string;
  status: 'pending' | 'delivering' | 'succeeded' | 'failed' | 'dead';
  attempts: number;
  lastStatusCode: number | null;
  lastResponse: string | null;
  lastError: string | null;
  nextAttemptAt: string | null;
  deliveredAt: string | null;
  createdAt: string;
}

export function listWebhookEndpoints(tenantPath: (path: string) => string) {
  return apiClient.get<WebhookEndpoint[]>(tenantPath('/webhook-endpoints'));
}

export function createWebhookEndpoint(
  tenantPath: (path: string) => string,
  input: { url: string; events: string[]; description?: string },
) {
  return apiClient.post<{ endpoint: WebhookEndpoint; secret: string }>(
    tenantPath('/webhook-endpoints'),
    input,
  );
}

export function updateWebhookEndpoint(
  tenantPath: (path: string) => string,
  id: string,
  input: Partial<{
    url: string;
    events: string[];
    description: string;
    status: 'active' | 'disabled';
  }>,
) {
  return apiClient.patch<WebhookEndpoint>(
    tenantPath(`/webhook-endpoints/${id}`),
    input,
  );
}

export function testWebhookEndpoint(
  tenantPath: (path: string) => string,
  id: string,
) {
  return apiClient.post<{ deliveryId: string }>(
    tenantPath(`/webhook-endpoints/${id}/test`),
  );
}

export function rotateWebhookSecret(
  tenantPath: (path: string) => string,
  id: string,
) {
  return apiClient.post<{ secret: string }>(
    tenantPath(`/webhook-endpoints/${id}/rotate-secret`),
  );
}

export function listWebhookDeliveries(
  tenantPath: (path: string) => string,
  filters: { endpointId?: string; status?: string; cursor?: string } = {},
) {
  const query: Record<string, string> = {};
  if (filters.endpointId) query.endpointId = filters.endpointId;
  if (filters.status) query.status = filters.status;
  if (filters.cursor) query.cursor = filters.cursor;
  return apiClient.get<{ data: WebhookDelivery[]; nextCursor: string | null }>(
    tenantPath('/webhook-deliveries'),
    { query },
  );
}

export function redeliverWebhookDelivery(
  tenantPath: (path: string) => string,
  id: string,
) {
  return apiClient.post<{ deliveryId: string }>(
    tenantPath(`/webhook-deliveries/${id}/redeliver`),
  );
}
