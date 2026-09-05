import { describe, expect, it } from 'vitest';
import { paletteSchema, seoSchema, themeOverrideSchema } from './theme';

describe('paletteSchema', () => {
  it('accepts a partial palette', () => {
    expect(paletteSchema.parse({ primary: '#C08A2D' })).toEqual({
      primary: '#C08A2D',
    });
  });

  it('accepts an empty palette', () => {
    expect(paletteSchema.parse({})).toEqual({});
  });

  it('rejects unknown keys', () => {
    expect(
      paletteSchema.safeParse({ primary: '#000', border: '#111' }).success,
    ).toBe(false);
  });
});

describe('themeOverrideSchema', () => {
  it('accepts an empty override', () => {
    expect(themeOverrideSchema.parse({})).toEqual({});
  });

  it('accepts palette + fonts', () => {
    const value = {
      palette: { primary: '#C08A2D', ink: '#231C10' },
      fontDisplay: 'Cormorant Garamond',
      fontBody: 'Manrope',
    };
    expect(themeOverrideSchema.parse(value)).toEqual(value);
  });

  it('rejects unknown keys', () => {
    expect(themeOverrideSchema.safeParse({ colour: 'red' }).success).toBe(
      false,
    );
  });
});

describe('seoSchema', () => {
  it('accepts an empty seo block', () => {
    expect(seoSchema.parse({})).toEqual({});
  });

  it('accepts a full seo block', () => {
    const value = {
      title: 'Turmeric & Curcumin — Ivory Glow',
      description: 'Verify and explore.',
      ogImageAssetId: 'asset-1',
      noindex: false,
    };
    expect(seoSchema.parse(value)).toEqual(value);
  });

  it('rejects unknown keys', () => {
    expect(seoSchema.safeParse({ keywords: ['x'] }).success).toBe(false);
  });
});
