'use client';

import { useEffect } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { sendPageBeacon, type ReferrerType } from '@/lib/beacon';

function referrerTypeFor(pathname: string, src: string | null): ReferrerType {
  if (pathname.startsWith('/v/')) {
    if (src === 'manual') return 'manual';
    if (src === 'camera') return 'camera';
    return 'qr';
  }
  if (pathname === '/verify') return 'manual';
  return 'direct';
}

/**
 * Fires once per route view via `navigator.sendBeacon` (T12). Mounted per
 * page (not the layout) so `/v/[code]` can pass the verdict/tier it
 * already resolved server-side, without a second network round trip.
 */
export function PageBeacon({
  tenantSlug,
  verdict,
  tier,
}: {
  tenantSlug: string;
  verdict?: string;
  tier?: 1 | 2;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    sendPageBeacon({
      tenantSlug,
      route: pathname,
      verdict,
      tier,
      locale: navigator.language?.split('-')[0] ?? 'en',
      referrerType: referrerTypeFor(pathname, searchParams.get('src')),
    });
    // Fires once per mount (one beacon per route view) — deps intentionally
    // exclude `searchParams`/`tenantSlug`/`verdict`/`tier`, which are fixed
    // for the lifetime of a given page instance.
  }, [pathname]);

  return null;
}
