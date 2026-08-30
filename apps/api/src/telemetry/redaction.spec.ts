import { describe, it, expect } from 'vitest';
import { redactCode, hashSensitiveValue, redactLogObject } from './redaction';

describe('redaction', () => {
  describe('redactCode', () => {
    it('redacts tier-1 unit code keeping prefix and first 2 / last 2 chars', () => {
      const code = 'ivoryglow.2.k1.ABCDEFGH1234567890AB';
      expect(redactCode(code)).toBe('ivoryglow.2.k1.AB...AB');
    });

    it('handles short or malformed codes safely', () => {
      expect(redactCode('short')).toBe('[REDACTED_CODE]');
    });
  });

  describe('hashSensitiveValue', () => {
    it('hashes email or IP deterministically to a truncated sha256', () => {
      const hash1 = hashSensitiveValue('user@example.com');
      const hash2 = hashSensitiveValue('user@example.com');
      expect(hash1).toHaveLength(16);
      expect(hash1).toBe(hash2);
      expect(hash1).not.toBe('user@example.com');
    });
  });

  describe('redactLogObject', () => {
    it('redacts sensitive headers and fields', () => {
      const input = {
        authorization: 'Bearer secret-token',
        password: 'my-password',
        code: 'ivoryglow.2.k1.ABCDEFGH1234567890AB',
        email: 'test@example.com',
        ip: '192.168.1.1',
        nested: {
          token: 'nested-token',
          safeField: 'hello',
        },
      };

      const redacted = redactLogObject(input);
      expect(redacted.authorization).toBe('[REDACTED]');
      expect(redacted.password).toBe('[REDACTED]');
      expect(redacted.code).toBe('ivoryglow.2.k1.AB...AB');
      expect(redacted.email).not.toBe('test@example.com');
      expect(redacted.ip).not.toBe('192.168.1.1');

      const nested = redacted.nested as Record<string, unknown>;
      expect(nested.token).toBe('[REDACTED]');
      expect(nested.safeField).toBe('hello');
    });
  });
});
