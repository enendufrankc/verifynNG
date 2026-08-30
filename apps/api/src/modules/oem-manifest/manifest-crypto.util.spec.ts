import { describe, it, expect } from 'vitest';
import {
  constantTimeEqual,
  decryptManifest,
  encryptManifest,
} from './manifest-crypto.util';

const KEY =
  '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'.slice(
    0,
    64,
  );

describe('encryptManifest/decryptManifest', () => {
  it('round-trips arbitrary JSON', () => {
    const json = JSON.stringify({ hello: 'world', units: [1, 2, 3] });
    const encrypted = encryptManifest(json, KEY);
    expect(decryptManifest(encrypted, KEY)).toBe(json);
  });

  it('produces a different ciphertext each time (random IV)', () => {
    const json = JSON.stringify({ a: 1 });
    const a = encryptManifest(json, KEY);
    const b = encryptManifest(json, KEY);
    expect(a.equals(b)).toBe(false);
  });

  it('fails to decrypt with the wrong key', () => {
    const json = JSON.stringify({ a: 1 });
    const encrypted = encryptManifest(json, KEY);
    const wrongKey = KEY.slice(0, -2) + '00';
    expect(() => decryptManifest(encrypted, wrongKey)).toThrow();
  });
});

describe('constantTimeEqual', () => {
  it('returns true for identical strings', () => {
    expect(constantTimeEqual('abc123', 'abc123')).toBe(true);
  });

  it('returns false for different strings of the same length', () => {
    expect(constantTimeEqual('abc123', 'abc124')).toBe(false);
  });

  it('returns false for different lengths', () => {
    expect(constantTimeEqual('abc', 'abcd')).toBe(false);
  });
});
