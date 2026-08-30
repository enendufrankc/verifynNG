import { createHmac } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { WebhooksService } from './webhooks.service';

describe('WebhooksService', () => {
  const payload = JSON.stringify({
    type: 'bounce',
    recipient: 'owner@example.test',
  });
  const signature = createHmac('sha256', 'secret')
    .update(payload)
    .digest('hex');

  function service() {
    return new WebhooksService(
      { get: vi.fn().mockReturnValue('secret') } as never,
      { emit: vi.fn() } as never,
      {} as never,
      {} as never,
      {} as never,
    );
  }

  it('accepts the configured HMAC signature', () => {
    expect(service().verifyFakeMailSignature(payload, signature)).toBe(true);
  });

  it('rejects altered payloads and malformed signatures', () => {
    const instance = service();
    expect(instance.verifyFakeMailSignature(`${payload}x`, signature)).toBe(
      false,
    );
    expect(instance.verifyFakeMailSignature(payload, 'not-hex')).toBe(false);
  });
});
