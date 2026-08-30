'use client';

import { useState } from 'react';
import { Sheet, SheetContent } from '@verifyng/ui';
import { Sidebar } from '@/components/sidebar';
import { Topbar } from '@/components/topbar';
import { StatusBanner } from '@/components/status-banner';
import { PolicyReacceptGuard } from './legal/policy-reaccept-guard';

export default function ConsoleLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

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
        <StatusBanner status="active" />
        <main className="flex-1 overflow-y-auto p-6">
          <PolicyReacceptGuard>{children}</PolicyReacceptGuard>
        </main>
      </div>
    </div>
  );
}
