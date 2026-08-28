import { describe, it, expect } from 'vitest';
import {
  canonicalize,
  signManifest,
  verifyManifest,
  receiptHash,
} from './manifest.js';
import { StaticKeyRing } from './keys.js';
import type { SignedManifest } from './manifest.js';

const KEY_HEX =
  '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
const KEY_HEX_2 =
  'fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210';

function makeRing(activeKid?: string) {
  return new StaticKeyRing(`k1:${KEY_HEX},k2:${KEY_HEX_2}`, activeKid ?? 'k1');
}

describe('canonicalize', () => {
  it('sorts keys', () => {
    const obj = { b: 2, a: 1 };
    expect(canonicalize(obj)).toBe('{"a":1,"b":2}');
  });

  it('sorts keys recursively', () => {
    const obj = { z: 1, nested: { b: 2, a: 1 } };
    expect(canonicalize(obj)).toBe('{"nested":{"a":1,"b":2},"z":1}');
  });

  it('removes whitespace', () => {
    const obj = { a: 1 };
    expect(canonicalize(obj)).toBe('{"a":1}');
  });

  it('handles arrays (order preserved)', () => {
    const obj = { items: ['b', 'a'] };
    expect(canonicalize(obj)).toBe('{"items":["b","a"]}');
  });

  it('handles null values', () => {
    const obj = { a: null };
    expect(canonicalize(obj)).toBe('{"a":null}');
  });

  it('handles empty object', () => {
    expect(canonicalize({})).toBe('{}');
  });

  it('is deterministic for same object regardless of key insertion order', () => {
    const a: Record<string, number> = {};
    const b: Record<string, number> = {};
    // Insert in different order
    a['z'] = 1;
    a['a'] = 2;
    a['m'] = 3;
    b['m'] = 3;
    b['z'] = 1;
    b['a'] = 2;
    expect(canonicalize(a)).toBe(canonicalize(b));
  });
});

describe('signManifest', () => {
  it('adds kid, alg, and signature fields', () => {
    const ring = makeRing();
    const manifest = { batchId: 'batch-001', count: 100 };
    const signed = signManifest(ring, manifest);
    expect(signed.kid).toBe('k1');
    expect(signed.alg).toBe('HS256');
    expect(typeof signed.signature).toBe('string');
    expect(signed.signature).toHaveLength(64); // SHA-256 hex
  });

  it('preserves original fields', () => {
    const ring = makeRing();
    const manifest = { batchId: 'batch-001', count: 100 };
    const signed = signManifest(ring, manifest);
    expect(signed.batchId).toBe('batch-001');
    expect(signed.count).toBe(100);
  });

  it('strips any pre-existing signature fields before signing', () => {
    const ring = makeRing();
    const manifest = {
      batchId: 'b1',
      kid: 'old',
      alg: 'HS256',
      signature: 'oldsig',
    };
    const signed = signManifest(ring, manifest);
    expect(signed.kid).toBe('k1'); // overwritten with current
    expect(signed.signature).not.toBe('oldsig');
  });

  it('uses the active key', () => {
    const ring = makeRing('k2');
    const manifest = { data: 'test' };
    const signed = signManifest(ring, manifest);
    expect(signed.kid).toBe('k2');
  });
});

describe('verifyManifest', () => {
  it('verifies a freshly signed manifest', () => {
    const ring = makeRing();
    const manifest = { batchId: 'batch-001', count: 100 };
    const signed = signManifest(ring, manifest);
    expect(verifyManifest(ring, signed)).toBe(true);
  });

  it('rejects a mutated field', () => {
    const ring = makeRing();
    const manifest = { batchId: 'batch-001', count: 100 };
    const signed = signManifest(ring, manifest);
    const mutated: SignedManifest = { ...signed, batchId: 'batch-002' };
    expect(verifyManifest(ring, mutated)).toBe(false);
  });

  it('rejects a mutated count', () => {
    const ring = makeRing();
    const manifest = { batchId: 'batch-001', count: 100 };
    const signed = signManifest(ring, manifest);
    const mutated: SignedManifest = { ...signed, count: 200 };
    expect(verifyManifest(ring, mutated)).toBe(false);
  });

  it('rejects a tampered signature', () => {
    const ring = makeRing();
    const manifest = { batchId: 'batch-001' };
    const signed = signManifest(ring, manifest);
    const tampered: SignedManifest = { ...signed, signature: '0'.repeat(64) };
    expect(verifyManifest(ring, tampered)).toBe(false);
  });

  it('rejects unknown kid', () => {
    const ring = makeRing(); // only k1, k2
    const signed: SignedManifest = {
      data: 'test',
      kid: 'k99',
      alg: 'HS256',
      signature: '0'.repeat(64),
    };
    expect(verifyManifest(ring, signed)).toBe(false);
  });

  it('rejects signature of wrong length', () => {
    const ring = makeRing();
    const manifest = { batchId: 'batch-001' };
    const signed = signManifest(ring, manifest);
    const tampered: SignedManifest = { ...signed, signature: 'short' };
    expect(verifyManifest(ring, tampered)).toBe(false);
  });

  it('verifies with non-active key (key rotation scenario)', () => {
    const ring = makeRing('k2'); // k2 active
    const manifest = { data: 'test' };
    // Sign with k1 by using a k1-active ring
    const ringK1 = makeRing('k1');
    const signed = signManifest(ringK1, manifest);
    // Verify with the k2-active ring (which still has k1)
    expect(verifyManifest(ring, signed)).toBe(true);
  });
});

describe('receiptHash', () => {
  it('returns a 64-character hex string', () => {
    const hash = receiptHash(['code1', 'code2']);
    expect(hash).toHaveLength(64);
    expect(hash).toMatch(/^[0-9a-f]+$/);
  });

  it('is order-independent', () => {
    const codes = ['ivoryglow.2.k1.AAA.code1', 'ivoryglow.2.k1.BBB.code2'];
    const reversed = [...codes].reverse();
    expect(receiptHash(codes)).toBe(receiptHash(reversed));
  });

  it('is different for different code sets', () => {
    const a = receiptHash(['code1']);
    const b = receiptHash(['code2']);
    expect(a).not.toBe(b);
  });

  it('handles single code', () => {
    const hash = receiptHash(['single.code']);
    expect(hash).toHaveLength(64);
  });

  it('handles many codes', () => {
    const codes = Array.from({ length: 100 }, (_, i) => `code-${i}`);
    const hash = receiptHash(codes);
    expect(hash).toHaveLength(64);
  });
});
