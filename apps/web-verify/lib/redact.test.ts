import { describe, it, expect } from 'vitest';
import { StaticKeyRing, generateCode } from '@verifynng/core';
import { redactCode, isRedacted } from './redact';

const ring = new StaticKeyRing(
  'k1:0000000000000000000000000000000000000000000000000000000000000000',
  'k1',
);

describe('redactCode', () => {
  it('never includes the full payload for a well-formed tier-2 code', () => {
    const { code } = generateCode(ring, { tenant: 'ivoryglow', tier: 2 });
    const [, , , payload] = code.split('.');
    const redacted = redactCode(code);
    expect(redacted).not.toContain(payload);
    expect(redacted).toMatch(/^ivoryglow\.2\.k1\.[0-9A-Z]{4}…$/);
  });

  it('never includes the full payload for a well-formed tier-1 code', () => {
    const { code } = generateCode(ring, { tenant: 'ivoryglow', tier: 1 });
    const [, , , payload] = code.split('.');
    const redacted = redactCode(code);
    expect(redacted).not.toContain(payload);
  });

  it('redacts a malformed code to a fixed placeholder, never echoing input', () => {
    expect(redactCode('not-a-code')).toBe('***');
    expect(redactCode('<script>alert(1)</script>')).toBe('***');
  });
});

describe('isRedacted', () => {
  it('is true for redactCode output', () => {
    const { code } = generateCode(ring, { tenant: 'ivoryglow', tier: 2 });
    expect(isRedacted(redactCode(code))).toBe(true);
  });

  it('is false for a full code', () => {
    const { code } = generateCode(ring, { tenant: 'ivoryglow', tier: 2 });
    expect(isRedacted(code)).toBe(false);
  });
});
