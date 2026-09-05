import { describe, expect, it } from 'vitest';
import {
  mediaRefSchema,
  mediaVariantsSchema,
  PLACEHOLDER_MEDIA_REF,
} from './media';

describe('mediaVariantsSchema', () => {
  it('accepts webp-only variants', () => {
    expect(mediaVariantsSchema.parse({ webp: ['a.webp'] })).toEqual({
      webp: ['a.webp'],
    });
  });

  it('accepts webp + avif variants', () => {
    const value = { webp: ['a.webp', 'b.webp'], avif: ['a.avif'] };
    expect(mediaVariantsSchema.parse(value)).toEqual(value);
  });

  it('rejects an empty webp array', () => {
    expect(mediaVariantsSchema.safeParse({ webp: [] }).success).toBe(false);
  });

  it('rejects unknown keys', () => {
    expect(
      mediaVariantsSchema.safeParse({ webp: ['a.webp'], extra: 1 }).success,
    ).toBe(false);
  });
});

describe('mediaRefSchema', () => {
  it('accepts the placeholder ref', () => {
    expect(mediaRefSchema.parse(PLACEHOLDER_MEDIA_REF)).toEqual(
      PLACEHOLDER_MEDIA_REF,
    );
  });

  it('accepts a fully populated ref', () => {
    const value = {
      assetId: 'asset-1',
      alt: 'A bottle of turmeric',
      width: 960,
      height: 1200,
      blurDataUrl: 'data:image/png;base64,abc',
      variants: { webp: ['480.webp', '960.webp'], avif: ['960.avif'] },
    };
    expect(mediaRefSchema.parse(value)).toEqual(value);
  });

  it('rejects non-positive dimensions', () => {
    expect(
      mediaRefSchema.safeParse({ ...PLACEHOLDER_MEDIA_REF, width: 0 }).success,
    ).toBe(false);
  });

  it('rejects unknown keys', () => {
    expect(
      mediaRefSchema.safeParse({ ...PLACEHOLDER_MEDIA_REF, foo: 'bar' })
        .success,
    ).toBe(false);
  });
});
