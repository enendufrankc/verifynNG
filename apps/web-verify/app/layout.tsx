import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { headers } from 'next/headers';
import './globals.css';
import { loadEnv } from '@verifynng/config';
import { getTenantPublicProfile } from '@/lib/api';
import { resolveLocale, LocaleProvider } from '@/lib/i18n';
import { TenantThemeProvider } from '@/components/tenant/ThemeProvider';
import { TenantFooter } from '@/components/tenant/TenantFooter';

export const metadata: Metadata = {
  title: 'Verify — Product Authenticity',
  description: 'Scan a QR code to verify your product',
};

export default async function RootLayout({
  children,
}: {
  children: ReactNode;
}) {
  const env = loadEnv();
  const profile = await getTenantPublicProfile(env.NEXT_PUBLIC_DEFAULT_TENANT);
  // Accept-Language only — layouts don't receive searchParams, so `?lang=`
  // can only be honoured by the pages that have it (/v/[code], /verify),
  // which nest their own <LocaleProvider> override for their subtree.
  const h = await headers();
  const locale = resolveLocale(undefined, h.get('accept-language'));

  return (
    <html lang={locale}>
      <body className="bg-bg text-fg flex min-h-screen flex-col antialiased">
        <LocaleProvider locale={locale}>
          <TenantThemeProvider profile={profile}>
            <main className="px-s4 py-s10 flex flex-1 flex-col items-center justify-center">
              {children}
            </main>
            <TenantFooter profile={profile} locale={locale} />
          </TenantThemeProvider>
        </LocaleProvider>
      </body>
    </html>
  );
}
