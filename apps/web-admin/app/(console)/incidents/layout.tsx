'use client';

import { notFound } from 'next/navigation';
import { useAuth } from '@/lib/auth-store';

export default function IncidentsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { platformRole } = useAuth();

  if (platformRole !== 'support') notFound();

  return <div className="space-y-6">{children}</div>;
}
