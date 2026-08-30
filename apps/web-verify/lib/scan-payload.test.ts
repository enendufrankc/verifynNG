import { describe, it, expect } from 'vitest';
import { extractCodeFromPayload } from './scan-payload';

describe('extractCodeFromPayload', () => {
  it('extracts the code from a full https URL', () => {
    expect(
      extractCodeFromPayload(
        'https://verifyproduct.app/v/ivoryglow.2.k1.ABCD.EFGH',
      ),
    ).toBe('ivoryglow.2.k1.ABCD.EFGH');
  });

  it('extracts the code regardless of host — /v/[code] is the source of truth for validity', () => {
    expect(
      extractCodeFromPayload(
        'http://localhost:3000/v/ivoryglow.1.k1.ABCD.EFGH',
      ),
    ).toBe('ivoryglow.1.k1.ABCD.EFGH');
  });

  it('strips query/hash from a /v/ URL', () => {
    expect(
      extractCodeFromPayload(
        'https://verifyproduct.app/v/ivoryglow.2.k1.ABCD.EFGH?src=qr#x',
      ),
    ).toBe('ivoryglow.2.k1.ABCD.EFGH');
  });

  it('accepts a bare code with no URL wrapper', () => {
    expect(extractCodeFromPayload('ivoryglow.2.k1.ABCD.EFGH')).toBe(
      'ivoryglow.2.k1.ABCD.EFGH',
    );
  });

  it('rejects a bare word with no dot structure', () => {
    expect(extractCodeFromPayload('hello')).toBeNull();
  });

  it('rejects an unrelated URL', () => {
    expect(extractCodeFromPayload('https://example.com/other/path')).toBeNull();
  });

  it('rejects empty input', () => {
    expect(extractCodeFromPayload('')).toBeNull();
    expect(extractCodeFromPayload('   ')).toBeNull();
  });
});
