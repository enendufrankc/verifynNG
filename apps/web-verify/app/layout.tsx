import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Verify — Product Authenticity',
  description: 'Scan a QR code to verify your product',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-gray-50 text-gray-900 antialiased">
        {children}
      </body>
    </html>
  );
}
