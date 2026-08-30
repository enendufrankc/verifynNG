import { describe, it, expect } from 'vitest';
import { normalizeCode } from '@verifynng/core';
import { normalizeCodePreview, looksWellFormed } from './normalize-preview';

const FIXTURES = [
  'ivoryglow.2.k1.abcd1234efgh5678ijkl.mnop6789',
  'ivory glow-2-k1-abcd 1l0o',
  'IVORYGLOW.2.K1.ABCD1234EFGH5678IJKL.MNOP6789',
  '  ivoryglow . 2 . k1 . abcd  ',
  'not-a-code',
  '',
  'abcdefgh',
];

describe('normalizeCodePreview (parity with @verifynng/core normalizeCode)', () => {
  for (const fixture of FIXTURES) {
    it(`matches the real normalizeCode for ${JSON.stringify(fixture)}`, () => {
      expect(normalizeCodePreview(fixture)).toBe(normalizeCode(fixture));
    });
  }
});

describe('looksWellFormed', () => {
  it('accepts 4 and 5 segment shapes', () => {
    expect(looksWellFormed('IVORYGLOW.2.K1.ABCD.EFGH')).toBe(true);
    expect(looksWellFormed('IVORYGLOW.2.ABCD.EFGH')).toBe(true);
  });

  it('rejects the wrong segment count or an empty segment', () => {
    expect(looksWellFormed('IVORYGLOW.2')).toBe(false);
    expect(looksWellFormed('IVORYGLOW..K1.ABCD.EFGH')).toBe(false);
    expect(looksWellFormed('')).toBe(false);
  });
});
