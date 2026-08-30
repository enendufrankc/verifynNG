import { describe, it, expect } from 'vitest';
import { t } from './t';
import { LOCALES, MESSAGES, type Locale } from './messages';

describe('t', () => {
  it('interpolates {var} tokens', () => {
    expect(t('en', 'verdict.row.product')).toBe('Product');
    expect(t('en', 'history.verifiedCount', { count: 3, plural: 's' })).toBe(
      'Verified 3 times',
    );
    expect(t('en', 'history.verifiedCount', { count: 1, plural: '' })).toBe(
      'Verified 1 time',
    );
  });

  it('falls back to English for an unrecognised locale, not to the raw key', () => {
    expect(t('fr' as Locale, 'verdict.ok.title')).toBe(
      MESSAGES.en['verdict.ok.title'],
    );
  });

  it('every non-English catalog has the same key set as en.json', () => {
    const enKeys = Object.keys(MESSAGES.en).sort();
    for (const locale of LOCALES) {
      if (locale === 'en') continue;
      expect(Object.keys(MESSAGES[locale]).sort()).toEqual(enKeys);
    }
  });

  it('every non-English value carries the TODO_TRANSLATE marker', () => {
    for (const locale of LOCALES) {
      if (locale === 'en') continue;
      for (const value of Object.values(MESSAGES[locale])) {
        expect(value).toMatch(/^TODO_TRANSLATE: /);
      }
    }
  });
});
