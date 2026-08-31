import { describe, expect, it } from 'vitest';
import { PLACEHOLDER_MEDIA_REF } from '../media';
import { defaultGalleryBlock, galleryBlockSchema } from './gallery';

describe('galleryBlockSchema', () => {
  it('accepts the default block', () => {
    const block = defaultGalleryBlock('g1');
    expect(galleryBlockSchema.parse(block)).toEqual(block);
  });

  it('accepts items with captions', () => {
    const block = {
      id: 'g1',
      type: 'gallery' as const,
      heading: 'Gallery',
      items: [{ media: PLACEHOLDER_MEDIA_REF, caption: 'Model 2' }],
    };
    expect(galleryBlockSchema.parse(block)).toEqual(block);
  });

  it('rejects more than 12 items', () => {
    const block = {
      ...defaultGalleryBlock('g1'),
      items: Array.from({ length: 13 }, () => ({
        media: PLACEHOLDER_MEDIA_REF,
      })),
    };
    expect(galleryBlockSchema.safeParse(block).success).toBe(false);
  });

  it('rejects unknown keys', () => {
    expect(
      galleryBlockSchema.safeParse({ ...defaultGalleryBlock('g1'), foo: 1 })
        .success,
    ).toBe(false);
  });
});
