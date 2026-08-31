'use client';

import { notFound } from 'next/navigation';
import { useAuth } from '@/lib/auth-store';

export default function SupportLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { platformRole, hasBootstrapped } = useAuth();

  // This route is statically prerendered, so without this guard Next
  // executes this component once at build time (no auth context at all —
  // platformRole is null) and permanently bakes a 404 into the static
  // output. hasBootstrapped only flips true after the client-side auth
  // store rehydrates post-hydration (see auth-store.ts's own comment on
  // this class of bug); same fix already proven in production for
  // apps/web-admin/app/(console)/billing/layout.tsx.
  if (!hasBootstrapped) return null;
  if (platformRole !== 'support') notFound();

  return <div className="space-y-6">{children}</div>;
}
