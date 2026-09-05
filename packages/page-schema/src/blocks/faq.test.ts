import { describe, expect, it } from 'vitest';
import { defaultFaqBlock, faqBlockSchema } from './faq';

describe('faqBlockSchema', () => {
  it('accepts the default block', () => {
    const block = defaultFaqBlock('f1');
    expect(faqBlockSchema.parse(block)).toEqual(block);
  });

  it('accepts items', () => {
    const block = {
      id: 'f1',
      type: 'faq' as const,
      items: [{ q: 'Is this genuine?', a: 'Yes, scan to verify.' }],
    };
    expect(faqBlockSchema.parse(block)).toEqual(block);
  });

  it('requires both q and a on an item', () => {
    const block = {
      ...defaultFaqBlock('f1'),
      items: [{ q: 'Only question?' }],
    };
    expect(faqBlockSchema.safeParse(block).success).toBe(false);
  });

  it('rejects unknown keys', () => {
    expect(
      faqBlockSchema.safeParse({ ...defaultFaqBlock('f1'), foo: 1 }).success,
    ).toBe(false);
  });
});
