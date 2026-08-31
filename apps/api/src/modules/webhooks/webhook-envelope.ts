import { PUBLIC_API_VERSION } from '../public-api/constants.js';

/**
 * The `payload` column stores only the event-specific `data` object — the
 * envelope (id/type/createdAt/tenantId/apiVersion) is derived from the
 * delivery row itself at send time, so the wire body's `"id"` always equals
 * `X-VerifyNG-Delivery: <deliveryId>` per the wire format in
 * docs/epics/E16-public-api-webhooks.md.
 */
export function buildWebhookEnvelope(delivery: {
  id: string;
  event: string;
  tenantId: string;
  createdAt: Date;
  payload: unknown;
}): string {
  return JSON.stringify({
    id: delivery.id,
    type: delivery.event,
    createdAt: delivery.createdAt.toISOString(),
    tenantId: delivery.tenantId,
    apiVersion: PUBLIC_API_VERSION,
    data: delivery.payload,
  });
}
