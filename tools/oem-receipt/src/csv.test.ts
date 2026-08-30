import { describe, it, expect } from 'vitest';
import { parseCsv, extractColumn } from './csv';

describe('parseCsv', () => {
  it('parses a simple header + rows', () => {
    const rows = parseCsv(
      'serial,tier2Code\n1,ivoryglow.2.k1.AAAA000000000000.11111111\n',
    );
    expect(rows).toEqual([
      ['serial', 'tier2Code'],
      ['1', 'ivoryglow.2.k1.AAAA000000000000.11111111'],
    ]);
  });

  it('handles CRLF line endings', () => {
    const rows = parseCsv('a,b\r\n1,2\r\n');
    expect(rows).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
  });

  it('handles quoted fields with embedded commas', () => {
    const rows = parseCsv('a,b\n"hello, world",2\n');
    expect(rows).toEqual([
      ['a', 'b'],
      ['hello, world', '2'],
    ]);
  });

  it('handles a trailing row with no final newline', () => {
    const rows = parseCsv('a,b\n1,2');
    expect(rows).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
  });
});

describe('extractColumn', () => {
  it('extracts values by header name', () => {
    const rows = [
      ['serial', 'tier2Code'],
      ['1', 'code-a'],
      ['2', 'code-b'],
    ];
    expect(extractColumn(rows, 'tier2Code')).toEqual(['code-a', 'code-b']);
  });

  it('throws when the column is missing', () => {
    const rows = [['serial', 'tier1Code']];
    expect(() => extractColumn(rows, 'tier2Code')).toThrow(/not found/);
  });

  it('returns an empty array for a header-only CSV', () => {
    expect(extractColumn([['tier2Code']], 'tier2Code')).toEqual([]);
  });
});
