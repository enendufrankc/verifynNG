import { describe, it, expect } from 'vitest';
import { hashForStorage } from './hash.js';

describe('hashForStorage', () => {
  it('returns a 64-character hex string (SHA-256)', () => {
    const hash = hashForStorage('test.code');
    expect(hash).toHaveLength(64);
    expect(hash).toMatch(/^[0-9a-f]+$/);
  });

  it('is deterministic', () => {
    const a = hashForStorage('same.input');
    const b = hashForStorage('same.input');
    expect(a).toBe(b);
  });

  it('different inputs produce different hashes', () => {
    const a = hashForStorage('input.a');
    const b = hashForStorage('input.b');
    expect(a).not.toBe(b);
  });

  it('is sensitive to small changes', () => {
    const a = hashForStorage('ivoryglow.2.k1.ABCDEFGH12345678ABCD.XYZDEF12');
    const b = hashForStorage('ivoryglow.2.k1.ABCDEFGH12345678ABCE.XYZDEF12');
    expect(a).not.toBe(b);
  });
});
