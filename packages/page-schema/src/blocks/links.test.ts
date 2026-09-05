import { describe, expect, it } from 'vitest';
import { defaultLinksBlock, linksBlockSchema } from './links';

describe('linksBlockSchema', () => {
  it('accepts the default block', () => {
    const block = defaultLinksBlock('l1');
    expect(linksBlockSchema.parse(block)).toEqual(block);
  });

  it('accepts every link kind', () => {
    const block = {
      id: 'l1',
      type: 'links' as const,
      items: (['store', 'social', 'support', 'other'] as const).map((kind) => ({
        label: kind,
        href: `https://example.com/${kind}`,
        kind,
      })),
    };
    expect(linksBlockSchema.parse(block)).toEqual(block);
  });

  it('rejects an invalid kind', () => {
    const block = {
      ...defaultLinksBlock('l1'),
      items: [{ label: 'x', href: 'https://x.com', kind: 'invalid' }],
    };
    expect(linksBlockSchema.safeParse(block).success).toBe(false);
  });

  it('rejects unknown keys', () => {
    expect(
      linksBlockSchema.safeParse({ ...defaultLinksBlock('l1'), foo: 1 })
        .success,
    ).toBe(false);
  });
});
