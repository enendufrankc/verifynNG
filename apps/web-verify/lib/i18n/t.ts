import {
  MESSAGES,
  DEFAULT_LOCALE,
  type Locale,
  type MessageKey,
} from './messages';

/**
 * Pure — safe to call from server or client components. `{var}` tokens in
 * the template are replaced from `vars`; missing keys/locales fall back to
 * the English string, never to the raw key (so a missing translation
 * degrades to English, not to `verdict.ok.title`).
 */
export function t(
  locale: Locale,
  key: MessageKey,
  vars?: Record<string, string | number>,
): string {
  const dict = MESSAGES[locale] ?? MESSAGES[DEFAULT_LOCALE];
  let template: string = dict[key] ?? MESSAGES[DEFAULT_LOCALE][key];
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      template = template.replaceAll(`{${k}}`, String(v));
    }
  }
  return template;
}
