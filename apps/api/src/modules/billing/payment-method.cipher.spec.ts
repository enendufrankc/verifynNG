import { describe, expect, it } from 'vitest';
import { PaymentMethodCipher } from './payment-method.cipher';

describe('PaymentMethodCipher', () => {
  const cipher = new PaymentMethodCipher();

  it('round-trips a plaintext authorization code', () => {
    const ciphertext = cipher.encrypt('AUTH_abc123');
    expect(ciphertext).not.toContain('AUTH_abc123');
    expect(cipher.decrypt(ciphertext)).toBe('AUTH_abc123');
  });

  it('produces a different ciphertext each time (random IV)', () => {
    const a = cipher.encrypt('AUTH_abc123');
    const b = cipher.encrypt('AUTH_abc123');
    expect(a).not.toBe(b);
    expect(cipher.decrypt(a)).toBe('AUTH_abc123');
    expect(cipher.decrypt(b)).toBe('AUTH_abc123');
  });

  it('rejects a tampered ciphertext (GCM auth tag)', () => {
    const ciphertext = cipher.encrypt('AUTH_abc123');
    const [iv, tag, body] = ciphertext.split(':');
    const tampered = `${iv}:${tag}:${body.slice(0, -2)}00`;
    expect(() => cipher.decrypt(tampered)).toThrow();
  });
});
