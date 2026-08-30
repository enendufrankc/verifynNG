'use client';

import { useEffect, useState } from 'react';
import { t, useLocale } from '@/lib/i18n';

/** `navigator.onLine` banner (T10) — no network request, no verdict guessing. */
export function OfflineBanner() {
  const locale = useLocale();
  const [isOffline, setIsOffline] = useState(false);

  useEffect(() => {
    setIsOffline(!navigator.onLine);
    const goOffline = () => setIsOffline(true);
    const goOnline = () => setIsOffline(false);
    window.addEventListener('offline', goOffline);
    window.addEventListener('online', goOnline);
    return () => {
      window.removeEventListener('offline', goOffline);
      window.removeEventListener('online', goOnline);
    };
  }, []);

  if (!isOffline) return null;

  return (
    <div
      role="status"
      className="bg-warning px-s4 py-s2 text-n1000 w-full text-center text-xs font-medium"
    >
      {t(locale, 'offline.banner')}
    </div>
  );
}
