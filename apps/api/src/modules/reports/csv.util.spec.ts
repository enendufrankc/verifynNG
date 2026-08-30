import { describe, it, expect } from 'vitest';
import { csvEscape, csvRow } from './csv.util';

describe('csvEscape', () => {
  it('leaves plain values alone', () => expect(csvEscape('abc')).toBe('abc'));
  it('quotes values containing commas', () =>
    expect(csvEscape('a,b')).toBe('"a,b"'));
  it('doubles embedded quotes', () =>
    expect(csvEscape('say "hi"')).toBe('"say ""hi"""'));
  it('quotes values containing newlines', () =>
    expect(csvEscape('a\nb')).toBe('"a\nb"'));
  it('renders null/undefined as empty string', () => {
    expect(csvEscape(null)).toBe('');
    expect(csvEscape(undefined)).toBe('');
  });
});

describe('csvRow', () => {
  it('joins escaped values with commas and a trailing newline', () => {
    expect(csvRow(['a', 'b,c', 1])).toBe('a,"b,c",1\n');
  });
});
