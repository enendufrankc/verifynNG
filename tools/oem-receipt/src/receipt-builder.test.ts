import { describe, it, expect } from 'vitest';
import { generateCode, StaticKeyRing, receiptHash } from '@verifynng/core';
import { buildReceipt } from './receipt-builder';

const ring = new StaticKeyRing(
  'k1:0000000000000000000000000000000000000000000000000000000000000000',
  'k1',
);

function codesWithWatermark(watermark: string, count: number): string[] {
  return Array.from(
    { length: count },
    () => generateCode(ring, { tenant: 'ivoryglow', tier: 2, watermark }).code,
  );
}

describe('buildReceipt', () => {
  it('reports codeCount, a single watermark, and a stable receiptHash for a clean batch', () => {
    const codes = codesWithWatermark('ABCD', 10);
    const result = buildReceipt(codes);
    expect(result.codeCount).toBe(10);
    expect(result.malformedCount).toBe(0);
    expect(result.watermarks).toEqual(['ABCD']);
    expect(result.receiptHash).toBe(receiptHash(codes));
  });

  it('is order-independent', () => {
    const codes = codesWithWatermark('ABCD', 5);
    const shuffled = [...codes].reverse();
    expect(buildReceipt(codes).receiptHash).toBe(
      buildReceipt(shuffled).receiptHash,
    );
  });

  it('drops malformed rows and counts them without failing', () => {
    const codes = codesWithWatermark('ABCD', 3);
    const withJunk = [...codes, '', 'not-a-code', 'still,not,a,code'];
    const result = buildReceipt(withJunk);
    expect(result.codeCount).toBe(3);
    expect(result.malformedCount).toBe(2); // '' is skipped outright, not counted as malformed
  });

  it('reports every distinct watermark when a foreign code is mixed in', () => {
    const codes = [
      ...codesWithWatermark('ABCD', 5),
      ...codesWithWatermark('WXYZ', 1),
    ];
    const result = buildReceipt(codes);
    expect(result.codeCount).toBe(6);
    expect(result.watermarks).toEqual(['ABCD', 'WXYZ']);
  });
});
