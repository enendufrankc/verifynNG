/**
 * TODO(E16): Uses E16's webhook-sink at :4105. Currently a stub.
 */
export async function waitForWebhook(
  _event: string,
  _timeoutMs = 10_000,
): Promise<{ event: string; payload: unknown }> {
  // TODO(E16): poll webhook-sink at http://localhost:4105
  return { event: _event, payload: {} };
}

export const webhookSink = { waitFor: waitForWebhook };
