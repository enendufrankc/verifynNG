import type { APIRequestContext } from '@playwright/test';

const WEBHOOK_SINK_API =
  process.env.WEBHOOK_SINK_URL ?? 'http://localhost:4105';

export interface WebhookSinkDelivery {
  id: string;
  name: string;
  event: string;
  deliveryId: string | null;
  verified: boolean | null;
  verifiedReason: string;
  body: unknown;
  respondedStatus: number | null;
  receivedAt: string;
}

export interface WaitForWebhookOptions {
  timeoutMs?: number;
}

/**
 * Waits for a delivery to arrive at `tools/fakes/webhook-sink`'s `/hook/:name`
 * for the given sink name and event type. Polls every 500ms.
 */
export async function waitForWebhook(
  request: APIRequestContext,
  sinkName: string,
  event: string,
  opts: WaitForWebhookOptions = {},
): Promise<WebhookSinkDelivery> {
  const timeoutMs = opts.timeoutMs ?? 10_000;
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const resp = await request.get(
      `${WEBHOOK_SINK_API}/api/deliveries?name=${encodeURIComponent(sinkName)}`,
    );
    if (resp.ok()) {
      const deliveries = (await resp.json()) as WebhookSinkDelivery[];
      const match = deliveries.find((d) => d.event === event);
      if (match) return match;
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(
    `Webhook "${event}" not received at sink "${sinkName}" within ${timeoutMs}ms`,
  );
}

/** Forces the sink's next response(s) for `sinkName`: 200, 500, or a hang ('timeout'). */
export async function setWebhookBehaviour(
  request: APIRequestContext,
  sinkName: string,
  status: 200 | 500 | 'timeout',
): Promise<void> {
  await request.post(
    `${WEBHOOK_SINK_API}/api/behaviour/${encodeURIComponent(sinkName)}`,
    { data: { status } },
  );
}

export async function clearWebhookDeliveries(
  request: APIRequestContext,
): Promise<void> {
  await request.delete(`${WEBHOOK_SINK_API}/api/deliveries`);
}

export const webhookSink = {
  waitFor: waitForWebhook,
  setBehaviour: setWebhookBehaviour,
  clear: clearWebhookDeliveries,
};
