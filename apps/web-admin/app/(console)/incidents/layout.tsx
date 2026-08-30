'use client';

import { notFound } from 'next/navigation';
import { useAuth } from '@/lib/auth-store';

export default function IncidentsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { platformRole, hasBootstrapped } = useAuth();

  // See legal-docs/layout.tsx for why this waits on hasBootstrapped.
  if (!hasBootstrapped) return null;
  if (platformRole !== 'support') notFound();

  return <div className="space-y-6">{children}</div>;
}
