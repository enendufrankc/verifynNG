import { describe, expect, it } from 'vitest';
import { defaultBlock, type HeroBlock } from '@verifynng/page-schema';
import { buildProductJsonLd } from './json-ld';

function heroWithImage(): HeroBlock {
  const hero = defaultBlock('hero') as HeroBlock;
  return {
    ...hero,
    image: {
      assetId: 'a1',
      alt: 'Bottle',
      width: 800,
      height: 800,
      variants: {
        webp: [
          'https://minio.test/a/480.webp',
          'https://minio.test/a/960.webp',
        ],
      },
    },
  };
}

describe('buildProductJsonLd', () => {
  it('produces a valid schema.org Product with @context/@type', () => {
    const jsonLd = buildProductJsonLd({
      tenantName: 'IVORY GLOW',
      productSlug: 'turmeric-curcumin',
      seo: { title: 'Turmeric & Curcumin', description: 'Verify and explore.' },
      blocks: [heroWithImage()],
      canonicalUrl: 'https://verify.example/p/ivoryglow/turmeric-curcumin',
    });

    expect(jsonLd['@context']).toBe('https://schema.org');
    expect(jsonLd['@type']).toBe('Product');
    expect(jsonLd.name).toBe('Turmeric & Curcumin');
    expect(jsonLd.description).toBe('Verify and explore.');
    expect(jsonLd.url).toBe(
      'https://verify.example/p/ivoryglow/turmeric-curcumin',
    );
    expect(jsonLd.brand).toEqual({ '@type': 'Brand', name: 'IVORY GLOW' });
    expect(jsonLd.image).toEqual([
      'https://minio.test/a/480.webp',
      'https://minio.test/a/960.webp',
    ]);
  });

  it('falls back to the slug when seo.title is unset', () => {
    const jsonLd = buildProductJsonLd({
      tenantName: 'IVORY GLOW',
      productSlug: 'turmeric-curcumin',
      seo: {},
      blocks: [],
      canonicalUrl: 'https://verify.example/p/ivoryglow/turmeric-curcumin',
    });
    expect(jsonLd.name).toBe('turmeric-curcumin');
  });

  it('returns an empty image array when there is no hero block', () => {
    const jsonLd = buildProductJsonLd({
      tenantName: 'IVORY GLOW',
      productSlug: 'turmeric-curcumin',
      seo: {},
      blocks: [],
      canonicalUrl: 'https://verify.example/p/ivoryglow/turmeric-curcumin',
    });
    expect(jsonLd.image).toEqual([]);
  });

  it('serialises to JSON without dropping required fields (Rich Results shape)', () => {
    const jsonLd = buildProductJsonLd({
      tenantName: 'IVORY GLOW',
      productSlug: 'turmeric-curcumin',
      seo: { title: 'Turmeric & Curcumin' },
      blocks: [heroWithImage()],
      canonicalUrl: 'https://verify.example/p/ivoryglow/turmeric-curcumin',
    });
    const parsed = JSON.parse(JSON.stringify(jsonLd));
    expect(parsed['@type']).toBe('Product');
    expect(typeof parsed.name).toBe('string');
    expect(Array.isArray(parsed.image)).toBe(true);
    expect(parsed.brand['@type']).toBe('Brand');
  });
});
