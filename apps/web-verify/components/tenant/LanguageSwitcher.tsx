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
 *
 * On `/v/[code]` this deliberately does NOT preserve the path:
 * `usePathname()` reflects the *server-rendered* path, which on first load
 * is the full code (ShareSafeUrl's `history.replaceState` bypasses Next's
 * router, so `usePathname()` never observes the redacted rewrite either) —
 * building a link from it would put the full code back into an `<a href>`,
 * exactly what T7 forbids. Confirmed live: this showed up in a raw HTML
 * diff before this fix. Switching language from a verdict page goes to
 * `/verify` instead — re-entering the code is the honest option once
 * you're deliberately not carrying it in the URL.
 */
export function LanguageSwitcher({ currentLocale }: { currentLocale: Locale }) {
  const pathname = usePathname();
  const target = pathname.startsWith('/v/') ? '/verify' : pathname;

  return (
    <div className="gap-s2 flex flex-wrap items-center justify-center">
      {LOCALES.map((loc) => {
        const active = loc === currentLocale;
        return (
          <Link
            key={loc}
            href={`${target}?lang=${loc}`}
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
