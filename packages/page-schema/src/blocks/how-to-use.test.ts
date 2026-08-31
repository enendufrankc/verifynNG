import { describe, expect, it } from 'vitest';
import { defaultHowToUseBlock, howToUseBlockSchema } from './how-to-use';

describe('howToUseBlockSchema', () => {
  it('accepts the default block', () => {
    const block = defaultHowToUseBlock('u1');
    expect(howToUseBlockSchema.parse(block)).toEqual(block);
  });

  it('accepts up to 6 steps', () => {
    const block = {
      ...defaultHowToUseBlock('u1'),
      steps: Array.from({ length: 6 }, (_, i) => ({
        title: `Step ${i}`,
        body: `Body ${i}`,
      })),
    };
    expect(howToUseBlockSchema.parse(block)).toEqual(block);
  });

  it('rejects more than 6 steps', () => {
    const block = {
      ...defaultHowToUseBlock('u1'),
      steps: Array.from({ length: 7 }, (_, i) => ({
        title: `Step ${i}`,
        body: `Body ${i}`,
      })),
    };
    expect(howToUseBlockSchema.safeParse(block).success).toBe(false);
  });

  it('rejects unknown keys', () => {
    expect(
      howToUseBlockSchema.safeParse({ ...defaultHowToUseBlock('u1'), foo: 1 })
        .success,
    ).toBe(false);
  });
});
