import type { Metadata } from 'next';
import { Providers } from './providers';
import './globals.css';

export const metadata: Metadata = {
  title: 'Verify Admin — Tenant Console',
  description: 'Manage your product authenticity programme',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-screen bg-bg text-fg antialiased font-sans">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
