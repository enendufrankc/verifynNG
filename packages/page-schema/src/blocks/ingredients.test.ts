import { describe, expect, it } from 'vitest';
import { defaultIngredientsBlock, ingredientsBlockSchema } from './ingredients';

describe('ingredientsBlockSchema', () => {
  it('accepts the default block', () => {
    const block = defaultIngredientsBlock('i1');
    expect(ingredientsBlockSchema.parse(block)).toEqual(block);
  });

  it('accepts items with a percent and note', () => {
    const block = {
      id: 'i1',
      type: 'ingredients' as const,
      heading: 'What is inside',
      items: [
        {
          name: 'Turmeric extract',
          percent: 12.5,
          role: 'Active',
          note: 'Sourced locally',
        },
      ],
    };
    expect(ingredientsBlockSchema.parse(block)).toEqual(block);
  });

  it('rejects a percent outside 0-100', () => {
    const block = {
      ...defaultIngredientsBlock('i1'),
      items: [{ name: 'X', role: 'Active', percent: 150 }],
    };
    expect(ingredientsBlockSchema.safeParse(block).success).toBe(false);
  });

  it('rejects unknown keys', () => {
    expect(
      ingredientsBlockSchema.safeParse({
        ...defaultIngredientsBlock('i1'),
        foo: 1,
      }).success,
    ).toBe(false);
  });
});
