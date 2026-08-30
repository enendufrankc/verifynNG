import { LOCALES, DEFAULT_LOCALE, type Locale } from './messages';

function isLocale(value: string): value is Locale {
  return (LOCALES as string[]).includes(value);
}

/**
 * `?lang=` wins outright; otherwise the first `Accept-Language` subtag we
 * support; otherwise English. Cookie-less by design — locale never
 * persists server-side, so a full flow leaves no identifier (T12/AC8).
 */
export function resolveLocale(
  langParam: string | undefined,
  acceptLanguageHeader: string | null,
): Locale {
  if (langParam && isLocale(langParam)) return langParam;

  if (acceptLanguageHeader) {
    const candidates = acceptLanguageHeader
      .split(',')
      .map((part) => part.split(';')[0]?.trim().split('-')[0]?.toLowerCase())
      .filter((v): v is string => Boolean(v));
    for (const candidate of candidates) {
      if (isLocale(candidate)) return candidate;
    }
  }

  return DEFAULT_LOCALE;
}
