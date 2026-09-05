'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Sheet, SheetContent } from '@verifyng/ui';
import { Sidebar } from '@/components/sidebar';
import { Topbar } from '@/components/topbar';
import { StatusBanner } from '@/components/status-banner';
import { PolicyReacceptGuard } from './legal/policy-reaccept-guard';
import { useAuth } from '@/lib/auth-store';
import { useTenantPath } from '@/lib/tenant-path';
import { queryKeys } from '@/lib/query';
import { getSubscriptionStatus } from '@/lib/billing';

export default function ConsoleLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const { activeTenantId } = useAuth();
  const tenantPath = useTenantPath();
  const tenantId = activeTenantId ?? '';

  // E15 (billing), AC5: only `restricted` gets a shell-wide banner — the
  // rest of Subscription.status (`trialing`, `active`, `past_due`,
  // `cancelled`) isn't a StatusBanner concern here. Falls back to 'active'
  // (no banner) until the query resolves or for a tenant with no
  // subscription yet, matching this banner's previous hardcoded literal.
  const statusQuery = useQuery({
    queryKey: queryKeys.billing.status(tenantId),
    queryFn: () => getSubscriptionStatus(tenantPath),
    enabled: !!tenantId,
  });
  const subscriptionStatus = statusQuery.data?.status;
  const bannerStatus =
    subscriptionStatus === 'restricted' ? 'restricted' : 'active';

  return (
    <div className="bg-bg flex h-screen overflow-hidden">
      <div className="hidden lg:flex">
        <Sidebar />
      </div>

      <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
        <SheetContent side="left" className="w-60 p-0">
          <Sidebar />
        </SheetContent>
      </Sheet>

      <div className="flex flex-1 flex-col overflow-hidden">
        <Topbar onOpenMobileNav={() => setMobileNavOpen(true)} />
        <StatusBanner status={bannerStatus} href="/billing/invoices" />
        <main className="flex-1 overflow-y-auto p-6">
          <PolicyReacceptGuard>{children}</PolicyReacceptGuard>
        </main>
      </div>
    </div>
  );
}
