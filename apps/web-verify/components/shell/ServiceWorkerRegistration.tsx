'use client';

import { useEffect } from 'react';

/** Registers public/sw.js — shell/static-asset caching only (T10). */
export function ServiceWorkerRegistration() {
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    }
  }, []);

  return null;
}
