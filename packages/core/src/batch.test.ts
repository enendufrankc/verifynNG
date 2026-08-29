import { describe, it, expect } from 'vitest';
import { deriveBatchWatermark, watermarkOf } from './batch.js';
import { StaticKeyRing } from './keys.js';

const KEY_HEX =
  '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

function makeRing() {
  return new StaticKeyRing(`k1:${KEY_HEX}`);
}

describe('deriveBatchWatermark', () => {
  it('returns a 4-character watermark', () => {
    const ring = makeRing();
    const wm = deriveBatchWatermark(ring, {
      tenant: 'ivoryglow',
      batchId: 'batch-001',
    });
    expect(wm).toHaveLength(4);
  });

  it('uses only valid base32 characters', () => {
    const ring = makeRing();
    const wm = deriveBatchWatermark(ring, {
      tenant: 'ivoryglow',
      batchId: 'batch-001',
    });
    const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
    for (const ch of wm) {
      expect(ALPHABET).toContain(ch);
    }
  });

  it('is deterministic for same inputs', () => {
    const ring = makeRing();
    const a = deriveBatchWatermark(ring, {
      tenant: 'ivoryglow',
      batchId: 'batch-001',
    });
    const b = deriveBatchWatermark(ring, {
      tenant: 'ivoryglow',
      batchId: 'batch-001',
    });
    expect(a).toBe(b);
  });

  it('differs for different batch IDs', () => {
    const ring = makeRing();
    const a = deriveBatchWatermark(ring, {
      tenant: 'ivoryglow',
      batchId: 'batch-001',
    });
    const b = deriveBatchWatermark(ring, {
      tenant: 'ivoryglow',
      batchId: 'batch-002',
    });
    expect(a).not.toBe(b);
  });

  it('differs for different tenants', () => {
    const ring = makeRing();
    const a = deriveBatchWatermark(ring, {
      tenant: 'ivoryglow',
      batchId: 'batch-001',
    });
    const b = deriveBatchWatermark(ring, {
      tenant: 'otherbrand',
      batchId: 'batch-001',
    });
    expect(a).not.toBe(b);
  });
});

describe('watermarkOf', () => {
  it('extracts first 4 chars of payload', () => {
    expect(watermarkOf({ payload: 'ABCD1234567890123456' })).toBe('ABCD');
  });

  it('works with short payloads', () => {
    expect(watermarkOf({ payload: 'AB' })).toBe('AB');
  });
});
