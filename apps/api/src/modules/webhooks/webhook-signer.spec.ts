import { describe, it, expect } from 'vitest';
import { WebhookSigner } from './webhook-signer.js';

describe('WebhookSigner', () => {
  const signer = new WebhookSigner();
  const secret = 'whsec_test';

  it('sign() produces a v1=<hex> signature', () => {
    const sig = signer.sign(secret, 1724800000, '{"a":1}');
    expect(sig).toMatch(/^v1=[0-9a-f]{64}$/);
  });

  it('verify() accepts a fresh, valid signature', () => {
    const now = Date.now();
    const timestamp = Math.floor(now / 1000);
    const body = '{"a":1}';
    const sig = signer.sign(secret, timestamp, body);
    expect(signer.verify(secret, timestamp, body, sig, now)).toBe(true);
  });

  it('rejects a tampered body', () => {
    const now = Date.now();
    const timestamp = Math.floor(now / 1000);
    const sig = signer.sign(secret, timestamp, '{"a":1}');
    expect(signer.verify(secret, timestamp, '{"a":2}', sig, now)).toBe(false);
  });

  it('rejects a tampered timestamp', () => {
    const now = Date.now();
    const timestamp = Math.floor(now / 1000);
    const body = '{"a":1}';
    const sig = signer.sign(secret, timestamp, body);
    expect(signer.verify(secret, timestamp + 1, body, sig, now)).toBe(false);
  });

  it('rejects a signature older than 5 minutes', () => {
    const now = Date.now();
    const staleTimestamp = Math.floor(now / 1000) - 6 * 60;
    const body = '{"a":1}';
    const sig = signer.sign(secret, staleTimestamp, body);
    expect(signer.verify(secret, staleTimestamp, body, sig, now)).toBe(false);
  });

  it('rejects a signature skewed too far into the future', () => {
    const now = Date.now();
    const futureTimestamp = Math.floor(now / 1000) + 6 * 60;
    const body = '{"a":1}';
    const sig = signer.sign(secret, futureTimestamp, body);
    expect(signer.verify(secret, futureTimestamp, body, sig, now)).toBe(false);
  });

  it('rejects a malformed signature prefix', () => {
    const now = Date.now();
    const timestamp = Math.floor(now / 1000);
    expect(
      signer.verify(secret, timestamp, '{"a":1}', 'not-v1-prefixed', now),
    ).toBe(false);
  });

  it('rejects the wrong secret', () => {
    const now = Date.now();
    const timestamp = Math.floor(now / 1000);
    const body = '{"a":1}';
    const sig = signer.sign(secret, timestamp, body);
    expect(signer.verify('whsec_wrong', timestamp, body, sig, now)).toBe(false);
  });
});
