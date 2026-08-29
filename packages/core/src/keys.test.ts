import { describe, it, expect } from 'vitest';
import { StaticKeyRing, hmacSha256 } from './keys.js';

const TEST_HEX =
  '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
const TEST_HEX_2 =
  'fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210';

describe('StaticKeyRing', () => {
  it('parses a single key and makes it active', () => {
    const ring = new StaticKeyRing(`k1:${TEST_HEX}`);
    const active = ring.active();
    expect(active.kid).toBe('k1');
    expect(active.secret).toHaveLength(32);
  });

  it('parses multiple keys', () => {
    const ring = new StaticKeyRing(`k1:${TEST_HEX},k2:${TEST_HEX_2}`);
    expect(ring.get('k1')).toBeDefined();
    expect(ring.get('k2')).toBeDefined();
    expect(ring.get('k3')).toBeUndefined();
  });

  it('uses first key as active when CORE_ACTIVE_KID is omitted', () => {
    const ring = new StaticKeyRing(`k1:${TEST_HEX},k2:${TEST_HEX_2}`);
    expect(ring.active().kid).toBe('k1');
  });

  it('uses CORE_ACTIVE_KID when specified', () => {
    const ring = new StaticKeyRing(`k1:${TEST_HEX},k2:${TEST_HEX_2}`, 'k2');
    expect(ring.active().kid).toBe('k2');
  });

  it('throws on empty CORE_KEYS', () => {
    expect(() => new StaticKeyRing('')).toThrow('at least one key');
    expect(() => new StaticKeyRing('   ')).toThrow('at least one key');
  });

  it('throws on missing colon in key format', () => {
    expect(() => new StaticKeyRing('k1nope')).toThrow('invalid key format');
  });

  it('throws on empty kid', () => {
    expect(() => new StaticKeyRing(':abcdef')).toThrow('empty kid');
  });

  it('throws on invalid hex secret', () => {
    expect(() => new StaticKeyRing('k1:not_hex')).toThrow('invalid hex secret');
    expect(() => new StaticKeyRing('k1:abc')).toThrow('invalid hex secret'); // odd length
  });

  it('throws when CORE_ACTIVE_KID not found', () => {
    expect(() => new StaticKeyRing(`k1:${TEST_HEX}`, 'k99')).toThrow(
      'not found',
    );
  });

  it('returns a copy of secret (not the same reference)', () => {
    const ring = new StaticKeyRing(`k1:${TEST_HEX}`);
    const a = ring.active().secret;
    const b = ring.get('k1')!;
    expect(a).not.toBe(b); // different Uint8Array instances
    expect(a).toEqual(b); // same content
  });
});

describe('hmacSha256', () => {
  it('produces a 32-byte HMAC', () => {
    const key = Buffer.from(TEST_HEX, 'hex');
    const mac = hmacSha256(new Uint8Array(key), 'test message');
    expect(mac).toHaveLength(32);
  });

  it('produces deterministic output', () => {
    const key = Buffer.from(TEST_HEX, 'hex');
    const a = hmacSha256(new Uint8Array(key), 'hello');
    const b = hmacSha256(new Uint8Array(key), 'hello');
    expect(a.equals(b)).toBe(true);
  });

  it('different messages produce different HMACs', () => {
    const key = Buffer.from(TEST_HEX, 'hex');
    const a = hmacSha256(new Uint8Array(key), 'hello');
    const b = hmacSha256(new Uint8Array(key), 'world');
    expect(a.equals(b)).toBe(false);
  });
});
