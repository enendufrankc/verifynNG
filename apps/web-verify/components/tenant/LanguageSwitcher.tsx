'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LOCALES, type Locale } from '@/lib/i18n';

const LOCALE_LABEL: Record<Locale, string> = {
  en: 'English',
  pcm: 'Pidgin',
  yo: 'Yorùbá',
  ha: 'Hausa',
  ig: 'Igbo',
};

/**
 * Only `usePathname()`, never `useSearchParams()` — the latter would force
 * a Suspense boundary and break `/`'s static prerender, since this is
 * mounted in every page via the footer. Other query params (e.g. the
 * scanner's `?src=`) aren't preserved across a language switch — an
 * acceptable trade for keeping the home page static.
 */
export function LanguageSwitcher({ currentLocale }: { currentLocale: Locale }) {
  const pathname = usePathname();

  return (
    <div className="gap-s2 flex flex-wrap items-center justify-center">
      {LOCALES.map((loc) => {
        const active = loc === currentLocale;
        return (
          <Link
            key={loc}
            href={`${pathname}?lang=${loc}`}
            aria-current={active ? 'true' : undefined}
            className={
              active ? 'text-fg font-semibold underline' : 'hover:text-fg'
            }
          >
            {LOCALE_LABEL[loc]}
          </Link>
        );
      })}
    </div>
  );
}
