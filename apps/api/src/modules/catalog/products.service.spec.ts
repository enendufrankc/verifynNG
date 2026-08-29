import { describe, it, expect } from 'vitest';
import { validateGtin } from './products.service';

describe('validateGtin', () => {
  it('accepts valid GTIN-8', () => expect(validateGtin('96385074')).toBe(true));
  it('accepts valid GTIN-12', () =>
    expect(validateGtin('012345678905')).toBe(true));
  it('accepts valid GTIN-13 with check digit 2', () =>
    expect(validateGtin('0123456789012')).toBe(true));
  it('accepts valid GTIN-14', () =>
    expect(validateGtin('01234567890128')).toBe(true));
  it('rejects bad check digit GTIN-14', () =>
    expect(validateGtin('01234567890123')).toBe(false));
  it('rejects wrong-length', () => expect(validateGtin('12345')).toBe(false));
  it('rejects non-numeric', () =>
    expect(validateGtin('abcdefghijklmn')).toBe(false));
  it('rejects empty', () => expect(validateGtin('')).toBe(false));
  it('accepts GTIN with leading/trailing whitespace', () =>
    expect(validateGtin(' 01234567890128 ')).toBe(true));
  it('rejects GTIN-13 with bad check digit', () =>
    expect(validateGtin('0123456789013')).toBe(false));
});
