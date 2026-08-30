'use client';

import { notFound } from 'next/navigation';
import { useAuth } from '@/lib/auth-store';

/**
 * Support-only for now. The epic also wants a simplified, read-only view
 * for tenant owners ("which policies touched their data last night") —
 * not built yet; tracked as a gap in this epic's final status report.
 */
export default function RetentionLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { platformRole } = useAuth();

  if (platformRole !== 'support') notFound();

  return <div className="space-y-6">{children}</div>;
}
