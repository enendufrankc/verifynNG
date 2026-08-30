import { parseCode, watermarkOf, receiptHash } from '@verifynng/core';

export interface ReceiptSummary {
  codeCount: number;
  malformedCount: number;
  watermarks: string[];
  receiptHash: string;
}

/**
 * Parses each printed code, drops malformed rows (counting them rather than
 * failing the whole run — a printer artefact shouldn't block the receipt),
 * and computes the same receiptHash/watermark set the API recomputes on submit.
 */
export function buildReceipt(codes: string[]): ReceiptSummary {
  const validCodes: string[] = [];
  let malformedCount = 0;
  const watermarkSet = new Set<string>();

  for (const raw of codes) {
    if (!raw) continue;
    const parsed = parseCode(raw);
    if (!parsed) {
      malformedCount++;
      continue;
    }
    validCodes.push(raw);
    watermarkSet.add(watermarkOf(parsed));
  }

  return {
    codeCount: validCodes.length,
    malformedCount,
    watermarks: [...watermarkSet].sort(),
    receiptHash: receiptHash(validCodes),
  };
}
