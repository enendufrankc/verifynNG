import { describe, expect, it } from 'vitest';
import { defaultRichTextBlock, richTextBlockSchema } from './rich-text';

describe('richTextBlockSchema', () => {
  it('accepts the default block', () => {
    const block = defaultRichTextBlock('r1');
    expect(richTextBlockSchema.parse(block)).toEqual(block);
  });

  it('accepts markdown content', () => {
    const block = { id: 'r1', type: 'rich-text' as const, md: '**bold** text' };
    expect(richTextBlockSchema.parse(block)).toEqual(block);
  });

  it('rejects unknown keys', () => {
    expect(
      richTextBlockSchema.safeParse({
        ...defaultRichTextBlock('r1'),
        html: '<b/>',
      }).success,
    ).toBe(false);
  });
});
