/**
 * External event names a WebhookEndpoint can subscribe to — see
 * docs/epics/E16-public-api-webhooks.md "Event catalogue". `ping` is
 * system-only (test-send, T9) and never appears in a user-selectable
 * `events` list; `*` subscribes to everything in this catalogue (not ping).
 */
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

export function isValidEventSelection(events: string[]): boolean {
  if (events.length === 0) return false;
  if (events.length === 1 && events[0] === '*') return true;
  return events.every((e) =>
    (WEBHOOK_EVENT_CATALOGUE as readonly string[]).includes(e),
  );
}
