'use client';

import { createContext, useContext, type ReactNode } from 'react';
import { DEFAULT_LOCALE, type Locale } from './messages';

const LocaleContext = createContext<Locale>(DEFAULT_LOCALE);

/**
 * The server resolves locale once per request (lib/i18n/locale.ts) and
 * passes it down here so nested client components — including carve-out
 * routes (E10/E17/E19) — can call `useLocale()` without prop-drilling.
 */
export function LocaleProvider({
  locale,
  children,
}: {
  locale: Locale;
  children: ReactNode;
}) {
  return (
    <LocaleContext.Provider value={locale}>{children}</LocaleContext.Provider>
  );
}

export function useLocale(): Locale {
  return useContext(LocaleContext);
}
