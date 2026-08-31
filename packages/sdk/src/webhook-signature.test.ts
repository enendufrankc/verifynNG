import { describe, it, expect } from 'vitest';
import { createHmac } from 'node:crypto';
import { verifyWebhookSignature } from './webhook-signature.js';

const SECRET = 'whsec_test_secret';

function sign(timestamp: number, rawBody: string): string {
  const hex = createHmac('sha256', SECRET)
    .update(`${timestamp}.${rawBody}`)
    .digest('hex');
  return `v1=${hex}`;
}

describe('verifyWebhookSignature', () => {
  it('accepts a validly signed, fresh delivery', () => {
    const now = Date.now();
    const timestamp = Math.floor(now / 1000);
    const rawBody = JSON.stringify({ id: 'del_1', type: 'unit.flagged' });
    const headers = {
      'x-verifyng-timestamp': String(timestamp),
      'x-verifyng-signature': sign(timestamp, rawBody),
    };
    expect(
      verifyWebhookSignature(SECRET, headers, rawBody, { now: () => now }),
    ).toBe(true);
  });

  it('accepts headers passed as a Headers instance', () => {
    const now = Date.now();
    const timestamp = Math.floor(now / 1000);
    const rawBody = '{"id":"del_2"}';
    const headers = new Headers({
      'X-VerifyNG-Timestamp': String(timestamp),
      'X-VerifyNG-Signature': sign(timestamp, rawBody),
    });
    expect(
      verifyWebhookSignature(SECRET, headers, rawBody, { now: () => now }),
    ).toBe(true);
  });

  it('rejects a tampered body', () => {
    const now = Date.now();
    const timestamp = Math.floor(now / 1000);
    const rawBody = '{"id":"del_3"}';
    const headers = {
      'x-verifyng-timestamp': String(timestamp),
      'x-verifyng-signature': sign(timestamp, rawBody),
    };
    expect(
      verifyWebhookSignature(
        SECRET,
        headers,
        '{"id":"del_3","tampered":true}',
        {
          now: () => now,
        },
      ),
    ).toBe(false);
  });

  it('rejects a tampered timestamp', () => {
    const now = Date.now();
    const timestamp = Math.floor(now / 1000);
    const rawBody = '{"id":"del_4"}';
    const headers = {
      'x-verifyng-timestamp': String(timestamp + 1),
      'x-verifyng-signature': sign(timestamp, rawBody),
    };
    expect(
      verifyWebhookSignature(SECRET, headers, rawBody, { now: () => now }),
    ).toBe(false);
  });

  it('rejects a signature older than the 5-minute window', () => {
    const now = Date.now();
    const staleTimestamp = Math.floor(now / 1000) - 6 * 60;
    const rawBody = '{"id":"del_5"}';
    const headers = {
      'x-verifyng-timestamp': String(staleTimestamp),
      'x-verifyng-signature': sign(staleTimestamp, rawBody),
    };
    expect(
      verifyWebhookSignature(SECRET, headers, rawBody, { now: () => now }),
    ).toBe(false);
  });

  it('rejects a signature from too far in the future', () => {
    const now = Date.now();
    const futureTimestamp = Math.floor(now / 1000) + 6 * 60;
    const rawBody = '{"id":"del_6"}';
    const headers = {
      'x-verifyng-timestamp': String(futureTimestamp),
      'x-verifyng-signature': sign(futureTimestamp, rawBody),
    };
    expect(
      verifyWebhookSignature(SECRET, headers, rawBody, { now: () => now }),
    ).toBe(false);
  });

  it('rejects a wrong secret', () => {
    const now = Date.now();
    const timestamp = Math.floor(now / 1000);
    const rawBody = '{"id":"del_7"}';
    const wrongSig = createHmac('sha256', 'wrong-secret')
      .update(`${timestamp}.${rawBody}`)
      .digest('hex');
    const headers = {
      'x-verifyng-timestamp': String(timestamp),
      'x-verifyng-signature': `v1=${wrongSig}`,
    };
    expect(
      verifyWebhookSignature(SECRET, headers, rawBody, { now: () => now }),
    ).toBe(false);
  });

  it('rejects missing headers and a malformed signature prefix', () => {
    expect(verifyWebhookSignature(SECRET, {}, '{}')).toBe(false);
    expect(
      verifyWebhookSignature(
        SECRET,
        {
          'x-verifyng-timestamp': String(Math.floor(Date.now() / 1000)),
          'x-verifyng-signature': 'not-v1-prefixed',
        },
        '{}',
      ),
    ).toBe(false);
  });
});
