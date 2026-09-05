import { describe, it, expect } from 'vitest';
import {
  decryptWebhookSecret,
  encryptWebhookSecret,
} from './webhook-secret-crypto.js';

describe('webhook secret encryption (AES-256-GCM)', () => {
  it('round-trips a secret', () => {
    const secret = 'whsec_deadbeefdeadbeefdeadbeefdeadbeef';
    const encrypted = encryptWebhookSecret(secret);
    expect(encrypted).not.toContain(secret);
    expect(decryptWebhookSecret(encrypted)).toBe(secret);
  });

  it('produces a different ciphertext each time (random IV)', () => {
    const secret = 'whsec_same_secret_twice';
    const a = encryptWebhookSecret(secret);
    const b = encryptWebhookSecret(secret);
    expect(a).not.toBe(b);
    expect(decryptWebhookSecret(a)).toBe(secret);
    expect(decryptWebhookSecret(b)).toBe(secret);
  });

  it('fails to decrypt a tampered ciphertext (auth tag check)', () => {
    const encrypted = encryptWebhookSecret('whsec_original');
    const buf = Buffer.from(encrypted, 'base64');
    buf[buf.length - 1] ^= 0xff; // flip a byte in the ciphertext
    const tampered = buf.toString('base64');
    expect(() => decryptWebhookSecret(tampered)).toThrow();
  });
});
