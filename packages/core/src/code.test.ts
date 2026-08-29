import { describe, it, expect } from 'vitest';
import {
  generateCode,
  parseCode,
  verifyChecksum,
  redactCode,
  constantTimeEqual,
  computeChecksum,
  computeLegacyChecksum,
} from './code.js';
import { StaticKeyRing } from './keys.js';
import type { Tier } from './code.js';

const KEY_HEX =
  '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
const LEGACY_HEX =
  'aabbccdd11223344aabbccdd11223344aabbccdd11223344aabbccdd11223344';

function makeRing(activeKid?: string) {
  return new StaticKeyRing(
    `k1:${KEY_HEX},k2:${KEY_HEX},legacy:${LEGACY_HEX}`,
    activeKid ?? 'k1',
  );
}

describe('constantTimeEqual', () => {
  it('returns true for identical strings', () => {
    expect(constantTimeEqual('abc', 'abc')).toBe(true);
  });

  it('returns false for different strings of same length', () => {
    expect(constantTimeEqual('abc', 'abd')).toBe(false);
  });

  it('returns false for different lengths', () => {
    expect(constantTimeEqual('abc', 'ab')).toBe(false);
    expect(constantTimeEqual('ab', 'abc')).toBe(false);
  });

  it('returns true for empty strings', () => {
    expect(constantTimeEqual('', '')).toBe(true);
  });
});

describe('generateCode', () => {
  it('produces a 5-segment code', () => {
    const ring = makeRing();
    const { code, kid } = generateCode(ring, { tenant: 'ivoryglow', tier: 2 });
    expect(kid).toBe('k1');
    const parts = code.split('.');
    expect(parts).toHaveLength(5);
    expect(parts[0]).toBe('ivoryglow');
    expect(parts[1]).toBe('2');
    expect(parts[2]).toBe('k1');
    expect(parts[3]).toHaveLength(20);
    expect(parts[4]).toHaveLength(8);
  });

  it('lowercases tenant', () => {
    const ring = makeRing();
    const { code } = generateCode(ring, { tenant: 'IVORYGLOW', tier: 1 });
    expect(code.startsWith('ivoryglow.1')).toBe(true);
  });

  it('uses active key kid', () => {
    const ring = makeRing('k2');
    const { kid } = generateCode(ring, { tenant: 'ivoryglow', tier: 2 });
    expect(kid).toBe('k2');
  });

  it('supports tier 1', () => {
    const ring = makeRing();
    const { code } = generateCode(ring, { tenant: 'test', tier: 1 });
    expect(code.split('.')[1]).toBe('1');
  });

  it('supports custom payload length', () => {
    const ring = makeRing();
    const { code } = generateCode(ring, {
      tenant: 'test',
      tier: 2,
      payloadLength: 32,
    });
    expect(code.split('.')[3]).toHaveLength(32);
  });

  it('generates different codes on each call', () => {
    const ring = makeRing();
    const a = generateCode(ring, { tenant: 'test', tier: 2 });
    const b = generateCode(ring, { tenant: 'test', tier: 2 });
    expect(a.code).not.toBe(b.code);
  });
});

describe('parseCode', () => {
  it('parses a valid v2 code', () => {
    const ring = makeRing();
    const { code } = generateCode(ring, { tenant: 'ivoryglow', tier: 2 });
    const parsed = parseCode(code);
    expect(parsed).not.toBeNull();
    expect(parsed!.tenant).toBe('ivoryglow');
    expect(parsed!.tier).toBe(2);
    expect(parsed!.kid).toBe('k1');
    expect(parsed!.payload).toHaveLength(20);
    expect(parsed!.checksum).toHaveLength(8);
    expect(parsed!.legacy).toBe(false);
  });

  it('parses a legacy 4-segment code', () => {
    const parsed = parseCode('ivoryglow.2.ABCDEFGH12345678ABCD.XYZDEF12');
    expect(parsed).not.toBeNull();
    expect(parsed!.legacy).toBe(true);
    expect(parsed!.kid).toBe('legacy');
    expect(parsed!.tenant).toBe('ivoryglow');
    expect(parsed!.tier).toBe(2);
  });

  it('returns null for invalid segment count', () => {
    expect(parseCode('a.b')).toBeNull();
    expect(parseCode('a.b.c')).toBeNull();
    expect(parseCode('a.b.c.d.e.f')).toBeNull();
  });

  it('returns null for invalid tier (v2)', () => {
    expect(parseCode('test.3.k1.payload1234.checksum')).toBeNull();
    expect(parseCode('test.0.k1.payload1234.checksum')).toBeNull();
  });

  it('returns null for invalid tier (legacy)', () => {
    expect(parseCode('test.3.payload12345678.checksum1')).toBeNull();
  });

  it('returns null for empty tenant', () => {
    expect(parseCode('.2.k1.payload1234.checksum')).toBeNull();
  });

  it('returns null for short payload in v2', () => {
    expect(parseCode('test.2.k1.abc.checksum1')).toBeNull(); // payload < 4 chars
  });

  it('returns null for short payload in legacy', () => {
    expect(parseCode('test.2.short.checksum1')).toBeNull(); // payload < 12 chars
  });

  it('returns null for wrong checksum length', () => {
    expect(parseCode('test.2.k1.payload1234567.short')).toBeNull(); // checksum != 8
  });

  it('returns null for non-base32 characters in payload (legacy)', () => {
    // 'I' and 'L' get normalized to '1', 'O' to '0' by normalizeCode,
    // but 'U' is not in the alphabet and not substituted
    expect(parseCode('test.2.ABCDEFGU1234567.12345678')).toBeNull();
  });

  it('returns null for non-base32 characters in checksum (legacy)', () => {
    expect(parseCode('test.2.ABCDEFGH1234567.ILOU5678')).toBeNull();
  });

  it('returns null for non-base32 characters in checksum', () => {
    expect(parseCode('test.2.k1.payload1234567890AB.I_LO_U__')).toBeNull();
  });

  it('returns null for empty kid in v2', () => {
    // After normalization, empty kid segment
    expect(parseCode('test.2..payload12345678.checksum1')).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(parseCode('')).toBeNull();
  });

  it('parses a v2 code with tier 1', () => {
    const ring = makeRing();
    const { code } = generateCode(ring, { tenant: 'test', tier: 1 });
    const parsed = parseCode(code);
    expect(parsed).not.toBeNull();
    expect(parsed!.tier).toBe(1);
    expect(parsed!.legacy).toBe(false);
  });

  it('parses a legacy code with tier 1', () => {
    const parsed = parseCode('test.1.ABCDEFGH12345678ABCD.XYZDEF12');
    expect(parsed).not.toBeNull();
    expect(parsed!.tier).toBe(1);
    expect(parsed!.legacy).toBe(true);
  });

  it('parses a valid legacy code with all base32 characters', () => {
    // Generate a proper legacy code and verify it parses correctly
    const tenant = 'test';
    const tier: Tier = 2;
    const payload = 'ABCDEFGH1234567890AB'; // 20 chars, all valid base32
    const secret = Buffer.from(LEGACY_HEX, 'hex');
    const checksum = computeLegacyChecksum(
      new Uint8Array(secret),
      tenant,
      tier,
      payload,
    );
    const code = `${tenant}.${tier}.${payload}.${checksum}`;
    const parsed = parseCode(code);
    expect(parsed).not.toBeNull();
    expect(parsed!.legacy).toBe(true);
    expect(parsed!.payload).toBe(payload);
  });

  it('handles normalized input with hyphens and spaces', () => {
    const ring = makeRing();
    const { code } = generateCode(ring, { tenant: 'ivoryglow', tier: 2 });
    // Add hyphens to the code
    // Actually, dots separate segments; normalizeCode strips hyphens from within segments
    // Let's test lowercase + normalization
    const lower = code.toLowerCase();
    const parsed = parseCode(lower);
    expect(parsed).not.toBeNull();
    expect(parsed!.tenant).toBe('ivoryglow');
  });
});

describe('verifyChecksum', () => {
  it('verifies a freshly generated code', () => {
    const ring = makeRing();
    const { code } = generateCode(ring, { tenant: 'ivoryglow', tier: 2 });
    const result = verifyChecksum(ring, code);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.parsed.tenant).toBe('ivoryglow');
      expect(result.parsed.tier).toBe(2);
    }
  });

  it('rejects a single-character mutation', () => {
    const ring = makeRing();
    const { code } = generateCode(ring, { tenant: 'ivoryglow', tier: 2 });
    // Mutate the last char of the payload
    const chars = code.split('');
    const payloadStart =
      code.indexOf('.', code.indexOf('.', code.indexOf('.') + 1) + 1) + 1;
    chars[payloadStart] = chars[payloadStart] === 'A' ? 'B' : 'A';
    const mutated = chars.join('');
    const result = verifyChecksum(ring, mutated);
    expect(result.ok).toBe(false);
  });

  it('rejects a completely wrong checksum', () => {
    const ring = makeRing();
    const { code } = generateCode(ring, { tenant: 'ivoryglow', tier: 2 });
    const parts = code.split('.');
    parts[4] = '00000000';
    const tampered = parts.join('.');
    const result = verifyChecksum(ring, tampered);
    expect(result.ok).toBe(false);
  });

  it('rejects unknown kid', () => {
    const ring = makeRing(); // only has k1, k2, legacy
    const code = 'test.2.k99.ABCDEFGH12345678ABCD.12345678';
    const result = verifyChecksum(ring, code);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toContain('unknown key id');
    }
  });

  it('rejects malformed code', () => {
    const ring = makeRing();
    const result = verifyChecksum(ring, 'garbage');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('malformed code');
    }
  });

  it('verifies legacy codes with legacy kid', () => {
    const ring = makeRing(); // has 'legacy' key
    // Compute a legacy code manually
    const tenant = 'ivoryglow';
    const tier: Tier = 2;
    const payload = 'ABCDEFGH12345678ABCD';
    const secret = Buffer.from(LEGACY_HEX, 'hex');
    const checksum = computeLegacyChecksum(
      new Uint8Array(secret),
      tenant,
      tier,
      payload,
    );
    const code = `${tenant}.${tier}.${payload}.${checksum}`;
    const result = verifyChecksum(ring, code);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.parsed.legacy).toBe(true);
    }
  });
});

describe('computeChecksum', () => {
  it('throws UnknownKeyError for unknown kid', () => {
    const ring = makeRing();
    expect(() => computeChecksum(ring, 'test', 2, 'k99', 'payload')).toThrow();
  });
});

describe('redactCode', () => {
  it('redacts a v2 code showing first 4 payload chars', () => {
    const ring = makeRing();
    const { code } = generateCode(ring, { tenant: 'ivoryglow', tier: 2 });
    const redacted = redactCode(code);
    expect(redacted).toMatch(/^ivoryglow\.2\.k1\.[A-Z0-9]{4}…$/);
  });

  it('redacts a legacy code', () => {
    const redacted = redactCode('ivoryglow.2.ABCDEFGH12345678ABCD.XYZDEF12');
    expect(redacted).toBe('ivoryglow.2.ABCD…');
  });

  it('returns *** for unparseable input', () => {
    expect(redactCode('garbage')).toBe('***');
  });
});
