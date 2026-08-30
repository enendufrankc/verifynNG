import Link from 'next/link';
import type { TenantPublicProfile } from '@/lib/api';

/** Legal/status links + the fixed "Verified by…" line from the legacy footer. */
export function TenantFooter({ profile }: { profile: TenantPublicProfile }) {
  return (
    <footer className="border-border bg-surface px-s4 py-s6 text-fg-muted mt-auto border-t text-xs">
      <div className="gap-s3 mx-auto flex max-w-md flex-col items-center text-center">
        <nav className="gap-s3 flex flex-wrap items-center justify-center">
          <Link href="/legal/privacy" className="hover:text-fg">
            Privacy
          </Link>
          <Link href="/legal/terms" className="hover:text-fg">
            Terms
          </Link>
          <Link href="/status" className="hover:text-fg">
            System status
          </Link>
          {profile.supportUrl && (
            <a href={profile.supportUrl} className="hover:text-fg">
              Support
            </a>
          )}
        </nav>
        <p>
          Verified by{' '}
          <span className="font-semibold">Tunnel Light Verify Platform</span>
        </p>
        {profile.trademarkLine && <p>{profile.trademarkLine}</p>}
      </div>
    </footer>
  );
}
