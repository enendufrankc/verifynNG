import { describe, it, expect } from 'vitest';
import { compareReceipt, sameWatermarkSet } from './receipt-compare.util';

const EXPECTED = { hash: 'abc123', count: 3, watermark: 'WMRK' };

describe('compareReceipt', () => {
  it('matches when hash, count, and the single watermark all agree', () => {
    const result = compareReceipt(
      { receiptHash: 'abc123', codeCount: 3, watermarks: ['WMRK'] },
      EXPECTED,
    );
    expect(result).toMatchObject({ matched: true, mismatchReason: undefined });
  });

  it('flags a hash mismatch first even if count/watermark also differ', () => {
    const result = compareReceipt(
      { receiptHash: 'wrong', codeCount: 2, watermarks: ['OTHR'] },
      EXPECTED,
    );
    expect(result).toMatchObject({ matched: false, mismatchReason: 'hash' });
  });

  it('flags a count mismatch when the hash matches but the count differs', () => {
    const result = compareReceipt(
      { receiptHash: 'abc123', codeCount: 2, watermarks: ['WMRK'] },
      EXPECTED,
    );
    expect(result).toMatchObject({ matched: false, mismatchReason: 'count' });
  });

  it('flags a watermark mismatch on a swapped-in foreign code (two distinct watermarks)', () => {
    const result = compareReceipt(
      { receiptHash: 'abc123', codeCount: 3, watermarks: ['WMRK', 'FRGN'] },
      EXPECTED,
    );
    expect(result).toMatchObject({
      matched: false,
      mismatchReason: 'watermark',
    });
  });

  it('flags a watermark mismatch when the single watermark is simply wrong', () => {
    const result = compareReceipt(
      { receiptHash: 'abc123', codeCount: 3, watermarks: ['FRGN'] },
      EXPECTED,
    );
    expect(result).toMatchObject({
      matched: false,
      mismatchReason: 'watermark',
    });
  });
});

describe('sameWatermarkSet', () => {
  it('is order-independent', () => {
    expect(sameWatermarkSet(['A', 'B'], ['B', 'A'])).toBe(true);
  });

  it('detects a different set', () => {
    expect(sameWatermarkSet(['A', 'B'], ['A', 'C'])).toBe(false);
  });

  it('detects a different length', () => {
    expect(sameWatermarkSet(['A'], ['A', 'B'])).toBe(false);
  });
});
