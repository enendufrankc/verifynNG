'use client';

import { notFound } from 'next/navigation';
import { useAuth } from '@/lib/auth-store';

/**
 * Support sees the full ops view (page.tsx branches on platformRole);
 * any tenant member sees the read-only schedule. Only a caller with
 * neither (shouldn't happen once auth is required, but matches every
 * other console layout guard's shape) gets a 404.
 *
 * See ../../legal-docs/layout.tsx for why this waits on hasBootstrapped.
 */
export default function RetentionLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { platformRole, role, hasBootstrapped } = useAuth();

  if (!hasBootstrapped) return null;
  if (platformRole !== 'support' && !role) notFound();

  return <div className="space-y-6">{children}</div>;
}
