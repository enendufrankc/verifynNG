import { describe, expect, it } from 'vitest';
import { toCsv } from './csv.util';

const BOM = String.fromCharCode(0xfeff);

describe('toCsv', () => {
  it('starts with a UTF-8 BOM', () => {
    const csv = toCsv([{ a: '1' }], ['a']);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
  });

  it('writes a header row and CRLF line endings', () => {
    const csv = toCsv([{ a: '1', b: '2' }], ['a', 'b']);
    expect(csv).toBe(`${BOM}a,b\r\n1,2\r\n`);
  });

  it('quotes and escapes commas, quotes, and newlines', () => {
    const csv = toCsv(
      [{ a: 'x,y', b: 'say "hi"', c: 'line1\nline2' }],
      ['a', 'b', 'c'],
    );
    expect(csv).toBe(`${BOM}a,b,c\r\n"x,y","say ""hi""","line1\nline2"\r\n`);
  });

  it('renders null/undefined as an empty field', () => {
    const csv = toCsv([{ a: null, b: undefined }], ['a', 'b']);
    expect(csv).toBe(`${BOM}a,b\r\n,\r\n`);
  });

  it('handles an empty row set (header only)', () => {
    expect(toCsv([], ['a', 'b'])).toBe(`${BOM}a,b\r\n`);
  });
});
