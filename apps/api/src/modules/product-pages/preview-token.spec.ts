import { describe, expect, it } from 'vitest';
import {
  PREVIEW_TOKEN_TTL_MS,
  signPreviewToken,
  verifyPreviewToken,
} from './preview-token';

const SECRET = 'unit-test-secret';

describe('preview token', () => {
  it('verifies a freshly signed token for the matching page id', () => {
    const token = signPreviewToken('page-1', SECRET);
    expect(verifyPreviewToken(token, 'page-1', SECRET)).toBe(true);
  });

  it('rejects a token for a different page id', () => {
    const token = signPreviewToken('page-1', SECRET);
    expect(verifyPreviewToken(token, 'page-2', SECRET)).toBe(false);
  });

  it('rejects a token signed with a different secret', () => {
    const token = signPreviewToken('page-1', SECRET);
    expect(verifyPreviewToken(token, 'page-1', 'wrong-secret')).toBe(false);
  });

  it('rejects an expired token', () => {
    const now = 1_000_000;
    const token = signPreviewToken('page-1', SECRET, now);
    const afterExpiry = now + PREVIEW_TOKEN_TTL_MS + 1;
    expect(verifyPreviewToken(token, 'page-1', SECRET, afterExpiry)).toBe(
      false,
    );
  });

  it('rejects a bit-flipped token (replay/tamper protection)', () => {
    const token = signPreviewToken('page-1', SECRET);
    const midpoint = Math.floor(token.length / 2);
    const flipped = token[midpoint] === 'a' ? 'b' : 'a';
    const tampered =
      token.slice(0, midpoint) + flipped + token.slice(midpoint + 1);
    expect(verifyPreviewToken(tampered, 'page-1', SECRET)).toBe(false);
  });

  it('rejects garbage input', () => {
    expect(verifyPreviewToken('not-a-real-token', 'page-1', SECRET)).toBe(
      false,
    );
  });

  it('rejects a token missing a segment', () => {
    const malformed = Buffer.from('page-1.123456').toString('base64url');
    expect(verifyPreviewToken(malformed, 'page-1', SECRET)).toBe(false);
  });
});
