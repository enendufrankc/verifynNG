import { describe, it, expect } from 'vitest';
import { InvalidCodeError, UnknownKeyError } from './errors.js';

describe('InvalidCodeError', () => {
  it('sets name and code', () => {
    const err = new InvalidCodeError('bad code');
    expect(err.name).toBe('InvalidCodeError');
    expect(err.code).toBe('INVALID_CODE');
    expect(err.message).toBe('bad code');
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(InvalidCodeError);
  });
});

describe('UnknownKeyError', () => {
  it('sets name, code, and kid', () => {
    const err = new UnknownKeyError('k99');
    expect(err.name).toBe('UnknownKeyError');
    expect(err.code).toBe('UNKNOWN_KEY');
    expect(err.kid).toBe('k99');
    expect(err.message).toBe('Unknown key id: k99');
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(UnknownKeyError);
  });
});
