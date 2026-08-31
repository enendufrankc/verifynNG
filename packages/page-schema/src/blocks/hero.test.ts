import { describe, expect, it } from 'vitest';
import { PLACEHOLDER_MEDIA_REF } from '../media';
import { defaultHeroBlock, heroBlockSchema } from './hero';

describe('heroBlockSchema', () => {
  it('accepts the default block', () => {
    const block = defaultHeroBlock('h1');
    expect(heroBlockSchema.parse(block)).toEqual(block);
  });

  it('accepts a fully populated block', () => {
    const block = {
      id: 'h1',
      type: 'hero' as const,
      eyebrow: 'New',
      title: 'Turmeric & Curcumin',
      subtitle: 'Radiance ritual',
      stats: [{ value: '10k+', label: 'verified scans' }],
      ctaPrimary: { label: 'Verify', href: '#verify' },
      ctaSecondary: { label: 'Shop', href: 'https://example.com' },
      image: PLACEHOLDER_MEDIA_REF,
      variantImages: [PLACEHOLDER_MEDIA_REF],
    };
    expect(heroBlockSchema.parse(block)).toEqual(block);
  });

  it('rejects more than 3 stats', () => {
    const block = {
      ...defaultHeroBlock('h1'),
      stats: Array.from({ length: 4 }, (_, i) => ({
        value: String(i),
        label: `l${i}`,
      })),
    };
    expect(heroBlockSchema.safeParse(block).success).toBe(false);
  });

  it('requires a title', () => {
    const block: Record<string, unknown> = { ...defaultHeroBlock('h1') };
    delete block.title;
    expect(heroBlockSchema.safeParse(block).success).toBe(false);
  });

  it('rejects unknown keys', () => {
    expect(
      heroBlockSchema.safeParse({ ...defaultHeroBlock('h1'), foo: 1 }).success,
    ).toBe(false);
  });
});
