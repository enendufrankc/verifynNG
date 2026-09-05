import { describe, expect, it } from 'vitest';
import { PLACEHOLDER_MEDIA_REF } from '../media';
import { defaultTrademarkBlock, trademarkBlockSchema } from './trademark';

describe('trademarkBlockSchema', () => {
  it('accepts the default block', () => {
    const block = defaultTrademarkBlock('t1');
    expect(trademarkBlockSchema.parse(block)).toEqual(block);
  });

  it('accepts a mark with an image ref', () => {
    const block = {
      id: 't1',
      type: 'trademark' as const,
      heading: 'Trademark',
      marks: [
        {
          name: 'IVORY GLOW',
          number: 'NG/TM/O/2020/11950',
          class: '3',
          jurisdiction: 'Nigeria',
          imageRef: PLACEHOLDER_MEDIA_REF,
        },
      ],
    };
    expect(trademarkBlockSchema.parse(block)).toEqual(block);
  });

  it('requires every mark field except imageRef', () => {
    const block = {
      ...defaultTrademarkBlock('t1'),
      marks: [{ name: 'X', number: '1', class: '3' }],
    };
    expect(trademarkBlockSchema.safeParse(block).success).toBe(false);
  });

  it('rejects unknown keys', () => {
    expect(
      trademarkBlockSchema.safeParse({ ...defaultTrademarkBlock('t1'), foo: 1 })
        .success,
    ).toBe(false);
  });
});
