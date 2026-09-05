import { describe, expect, it } from 'vitest';
import { defaultStoryBlock, storyBlockSchema } from './story';

describe('storyBlockSchema', () => {
  it('accepts the default block', () => {
    const block = defaultStoryBlock('s1');
    expect(storyBlockSchema.parse(block)).toEqual(block);
  });

  it('accepts a fully populated block', () => {
    const block = {
      id: 's1',
      type: 'story' as const,
      kicker: 'Since 2020',
      heading: 'Our story',
      paragraphs: ['Paragraph one.', 'Paragraph two.'],
      attribution: 'Founder, Ivory Glow',
    };
    expect(storyBlockSchema.parse(block)).toEqual(block);
  });

  it('requires a heading', () => {
    const block: Record<string, unknown> = { ...defaultStoryBlock('s1') };
    delete block.heading;
    expect(storyBlockSchema.safeParse(block).success).toBe(false);
  });

  it('rejects unknown keys', () => {
    expect(
      storyBlockSchema.safeParse({ ...defaultStoryBlock('s1'), foo: 1 })
        .success,
    ).toBe(false);
  });
});
