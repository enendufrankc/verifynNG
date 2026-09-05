import type { Metadata } from 'next';
import Link from 'next/link';
import './globals.css';

export const metadata: Metadata = {
  title: {
    default: 'verifynNG Docs',
    template: '%s — verifynNG Docs',
  },
  description:
    'How product-authenticity codes work, how to apply labels, printer specs, console guides, and the API.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">
        <header
          className="border-b"
          style={{ borderColor: 'var(--color-border)' }}
        >
          <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
            <Link href="/" className="text-lg font-semibold">
              verifynNG Docs
            </Link>
            <nav className="flex gap-4 text-sm">
              <Link href="/docs/codes">How codes work</Link>
              <Link href="/docs/labels">Labels</Link>
              <Link href="/docs/printers">Printers</Link>
              <Link href="/docs/api">API</Link>
              <Link href="/docs/faq">FAQ</Link>
            </nav>
          </div>
        </header>
        <main className="mx-auto max-w-5xl px-6 py-10">{children}</main>
      </body>
    </html>
  );
}
