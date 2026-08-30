import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import './globals.css';
import { loadEnv } from '@verifynng/config';
import { getTenantPublicProfile } from '@/lib/api';
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

  return (
    <html lang="en">
      <body className="bg-bg text-fg flex min-h-screen flex-col antialiased">
        <TenantThemeProvider profile={profile}>
          <main className="px-s4 py-s10 flex flex-1 flex-col items-center justify-center">
            {children}
          </main>
          <TenantFooter profile={profile} />
        </TenantThemeProvider>
      </body>
    </html>
  );
}
