import { describe, expect, it } from 'vitest';
import { batchInfoBlockSchema, defaultBatchInfoBlock } from './batch-info';

describe('batchInfoBlockSchema', () => {
  it('accepts the default block', () => {
    const block = defaultBatchInfoBlock('b1');
    expect(batchInfoBlockSchema.parse(block)).toEqual(block);
  });

  it('accepts flags toggled off with a heading', () => {
    const block = {
      id: 'b1',
      type: 'batch-info' as const,
      heading: 'Scan your bottle',
      showOem: false,
      showCommissionDate: false,
    };
    expect(batchInfoBlockSchema.parse(block)).toEqual(block);
  });

  it('requires showOem and showCommissionDate', () => {
    const block: Record<string, unknown> = { ...defaultBatchInfoBlock('b1') };
    delete block.showOem;
    expect(batchInfoBlockSchema.safeParse(block).success).toBe(false);
  });

  it('rejects unknown keys', () => {
    expect(
      batchInfoBlockSchema.safeParse({ ...defaultBatchInfoBlock('b1'), foo: 1 })
        .success,
    ).toBe(false);
  });
});
