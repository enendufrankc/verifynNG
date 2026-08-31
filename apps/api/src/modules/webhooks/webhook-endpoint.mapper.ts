import type { WebhookEndpoint } from '@prisma/client';

/** Explicit allow-list — `secretEnc` never leaves this service. */
export function toPublicWebhookEndpoint(endpoint: WebhookEndpoint) {
  return {
    id: endpoint.id,
    tenantId: endpoint.tenantId,
    url: endpoint.url,
    events: endpoint.events,
    status: endpoint.status,
    description: endpoint.description,
    failureStreak: endpoint.failureStreak,
    createdAt: endpoint.createdAt,
    updatedAt: endpoint.updatedAt,
  };
}

export type PublicWebhookEndpoint = ReturnType<typeof toPublicWebhookEndpoint>;
