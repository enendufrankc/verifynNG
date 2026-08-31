import { describe, expect, it } from 'vitest';
import { normalizeSlug } from './slug';

describe('normalizeSlug', () => {
  it('lowercases and hyphenates spaces', () => {
    expect(normalizeSlug('Turmeric & Curcumin')).toBe('turmeric-curcumin');
  });

  it('strips diacritics', () => {
    expect(normalizeSlug('Café Crème')).toBe('cafe-creme');
  });

  it('collapses repeated separators', () => {
    expect(normalizeSlug('a   b---c')).toBe('a-b-c');
  });

  it('trims leading and trailing hyphens', () => {
    expect(normalizeSlug('  -Hello World-  ')).toBe('hello-world');
  });

  it('truncates to the max length', () => {
    const long = 'a'.repeat(200);
    expect(normalizeSlug(long).length).toBe(80);
  });

  it('is idempotent', () => {
    const once = normalizeSlug('Vitamin C & Kojic Acid!');
    expect(normalizeSlug(once)).toBe(once);
  });
});
