'use client';

import { notFound } from 'next/navigation';
import { useAuth } from '@/lib/auth-store';

export default function LegalDocsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { platformRole, hasBootstrapped } = useAuth();

  // Wait for AuthBootstrap's cookie-refresh to settle before deciding —
  // on a fresh page load the store starts empty, and calling notFound()
  // against that transient empty state would 404 a page a real support
  // user is actually allowed to see. See auth-store.ts's hasBootstrapped doc.
  if (!hasBootstrapped) return null;
  if (platformRole !== 'support') notFound();

  return <div className="space-y-6">{children}</div>;
}
