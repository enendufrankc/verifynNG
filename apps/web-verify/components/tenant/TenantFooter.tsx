import Link from 'next/link';
import type { TenantPublicProfile } from '@/lib/api';
import { t, type Locale } from '@/lib/i18n';
import { LanguageSwitcher } from './LanguageSwitcher';

/** Legal/status links + the fixed "Verified by…" line from the legacy footer. */
export function TenantFooter({
  profile,
  locale,
}: {
  profile: TenantPublicProfile;
  locale: Locale;
}) {
  return (
    <footer className="border-border bg-surface px-s4 py-s6 text-fg-muted mt-auto border-t text-xs">
      <div className="gap-s3 mx-auto flex max-w-md flex-col items-center text-center">
        <nav className="gap-s3 flex flex-wrap items-center justify-center">
          <Link href="/legal/privacy" className="hover:text-fg">
            {t(locale, 'footer.privacy')}
          </Link>
          <Link href="/legal/terms" className="hover:text-fg">
            {t(locale, 'footer.terms')}
          </Link>
          <Link href="/status" className="hover:text-fg">
            {t(locale, 'footer.status')}
          </Link>
          {profile.supportUrl && (
            <a href={profile.supportUrl} className="hover:text-fg">
              {t(locale, 'footer.support')}
            </a>
          )}
        </nav>
        <LanguageSwitcher currentLocale={locale} />
        <p>
          {t(locale, 'footer.verifiedBy', {
            platform: '',
          })}
          <span className="font-semibold">
            {t(locale, 'footer.platformName')}
          </span>
        </p>
        {profile.trademarkLine && <p>{profile.trademarkLine}</p>}
      </div>
    </footer>
  );
}
