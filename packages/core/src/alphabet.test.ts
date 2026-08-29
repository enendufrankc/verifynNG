import { describe, it, expect } from 'vitest';
import {
  ALPHABET,
  encodeBase32,
  decodeBase32,
  normalizeCode,
} from './alphabet.js';

describe('ALPHABET', () => {
  it('has 32 characters', () => {
    expect(ALPHABET.length).toBe(32);
  });

  it('excludes I, L, O, U', () => {
    expect(ALPHABET).not.toContain('I');
    expect(ALPHABET).not.toContain('L');
    expect(ALPHABET).not.toContain('O');
    expect(ALPHABET).not.toContain('U');
  });

  it('starts with digits then letters', () => {
    expect(ALPHABET.slice(0, 10)).toBe('0123456789');
  });
});

describe('encodeBase32', () => {
  it('encodes zero bytes to "0" chars', () => {
    const bytes = new Uint8Array(5);
    expect(encodeBase32(bytes)).toBe('00000');
  });

  it('encodes bytes to valid base32 characters', () => {
    const bytes = new Uint8Array([1, 2, 3, 31, 32]);
    const encoded = encodeBase32(bytes);
    expect(encoded).toHaveLength(5);
    for (const ch of encoded) {
      expect(ALPHABET).toContain(ch);
    }
  });

  it('produces output same length as input', () => {
    const bytes = crypto.getRandomValues(new Uint8Array(20));
    expect(encodeBase32(bytes)).toHaveLength(20);
  });

  it('byte 31 maps to Z (last char)', () => {
    expect(encodeBase32(new Uint8Array([31]))).toBe('Z');
  });

  it('byte 0 maps to 0 (first char)', () => {
    expect(encodeBase32(new Uint8Array([0]))).toBe('0');
  });
});

// Need crypto for one test above — import it
import crypto from 'node:crypto';

describe('decodeBase32', () => {
  it('round-trips through encode/decode', () => {
    const bytes = new Uint8Array([5, 10, 15, 20, 25, 30]);
    const encoded = encodeBase32(bytes);
    const decoded = decodeBase32(encoded);
    expect(decoded).not.toBeNull();
    // decode recovers the modular values
    for (let i = 0; i < bytes.length; i++) {
      expect(decoded![i]).toBe(bytes[i] % 32);
    }
  });

  it('returns null for invalid characters', () => {
    expect(decodeBase32('I')).toBeNull(); // I not in alphabet
    expect(decodeBase32('L')).toBeNull();
    expect(decodeBase32('O')).toBeNull();
    expect(decodeBase32('U')).toBeNull();
    expect(decodeBase32('!')).toBeNull();
  });

  it('decodes empty string to empty array', () => {
    const result = decodeBase32('');
    expect(result).not.toBeNull();
    expect(result!.length).toBe(0);
  });
});

describe('normalizeCode', () => {
  it('uppercases input', () => {
    expect(normalizeCode('abc')).toBe('ABC');
  });

  it('trims whitespace', () => {
    expect(normalizeCode('  abc  ')).toBe('ABC');
  });

  it('removes hyphens', () => {
    expect(normalizeCode('a-b-c')).toBe('ABC');
  });

  it('removes spaces', () => {
    expect(normalizeCode('a b c')).toBe('ABC');
  });

  it('maps I to 1', () => {
    expect(normalizeCode('I')).toBe('1');
  });

  it('maps L to 1', () => {
    expect(normalizeCode('L')).toBe('1');
  });

  it('maps O to 0', () => {
    expect(normalizeCode('O')).toBe('0');
  });

  it('handles full code normalization', () => {
    const result = normalizeCode(
      ' ivoryglow.2.k1.aBcDeFgH1234567890AB.XYZDEF12 ',
    );
    expect(result).toBe('IVORYGLOW.2.K1.ABCDEFGH1234567890AB.XYZDEF12');
  });

  it('handles lowercase with I/L/O substitution', () => {
    // lowercase i→uppercase I→1, lowercase l→uppercase L→1
    expect(normalizeCode('i-l-o')).toBe('110');
  });

  it('leaves dots intact', () => {
    expect(normalizeCode('a.b.c')).toBe('A.B.C');
  });
});
