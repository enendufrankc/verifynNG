import { describe, it, expect } from 'vitest';
import { resolveLocale } from './locale';

describe('resolveLocale', () => {
  it('prefers ?lang= over Accept-Language', () => {
    expect(resolveLocale('pcm', 'fr-FR,fr;q=0.9')).toBe('pcm');
  });

  it('ignores an unsupported ?lang= and falls through to Accept-Language', () => {
    expect(resolveLocale('fr', 'yo-NG,yo;q=0.9,en;q=0.8')).toBe('yo');
  });

  it('picks the first supported subtag in Accept-Language, in q-order as sent', () => {
    expect(resolveLocale(undefined, 'fr-FR,ha;q=0.8,en;q=0.7')).toBe('ha');
  });

  it('matches the primary subtag ignoring region (en-US -> en)', () => {
    expect(resolveLocale(undefined, 'en-US,en;q=0.9')).toBe('en');
  });

  it('falls back to English when nothing matches', () => {
    expect(resolveLocale(undefined, 'fr-FR,de;q=0.9')).toBe('en');
    expect(resolveLocale(undefined, null)).toBe('en');
  });
});
