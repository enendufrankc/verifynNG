export interface ReceiptComparison {
  matched: boolean;
  mismatchReason?: 'hash' | 'count' | 'watermark';
  hashMatch: boolean;
  countMatch: boolean;
  watermarkMatch: boolean;
}

/**
 * Pure comparison of a submitted receipt against the expected values recomputed
 * from the delivered manifest. `watermarks` must be exactly the single batch
 * watermark — more than one distinct value means a foreign code was mixed in.
 */
export function compareReceipt(
  input: { receiptHash: string; codeCount: number; watermarks: string[] },
  expected: { hash: string; count: number; watermark: string },
): ReceiptComparison {
  const hashMatch = input.receiptHash === expected.hash;
  const countMatch = input.codeCount === expected.count;
  const watermarkMatch =
    input.watermarks.length === 1 && input.watermarks[0] === expected.watermark;
  const matched = hashMatch && countMatch && watermarkMatch;
  const mismatchReason: ReceiptComparison['mismatchReason'] = matched
    ? undefined
    : !hashMatch
      ? 'hash'
      : !countMatch
        ? 'count'
        : 'watermark';

  return { matched, mismatchReason, hashMatch, countMatch, watermarkMatch };
}

/** Order-independent equality, used to detect an identical receipt resubmission. */
export function sameWatermarkSet(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const sa = [...a].sort();
  const sb = [...b].sort();
  return sa.every((v, i) => v === sb[i]);
}
