'use client';

import { LockIcon } from 'lucide-react';
import { EmptyState } from '@verifyng/ui';
import { useAuth } from '@/lib/auth-store';

export default function BillingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { role, hasBootstrapped } = useAuth();
  // Store starts empty on a hard reload until AuthBootstrap's cookie-refresh
  // settles — same guard support/layout.tsx and legal-docs/layout.tsx use,
  // otherwise this briefly false-empties for an owner on direct navigation.
  if (!hasBootstrapped) return null;
  if (role !== 'owner') {
    return (
      <EmptyState
        icon={LockIcon}
        title="Owner access required"
        description="Ask your organization owner to manage billing, plans, and payment methods."
      />
    );
  }
  return <>{children}</>;
}
