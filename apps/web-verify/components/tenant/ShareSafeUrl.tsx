'use client';

import { useEffect } from 'react';

/**
 * Rewrites `/v/<full code>` to `/v/<redacted>` after hydration via
 * `history.replaceState` so a screenshot of the address bar (or the page
 * shared/bookmarked) can never replay the full code. Receives only the
 * already-redacted form — the full code never reaches the client (T7).
 */
export function ShareSafeUrl({ redactedCode }: { redactedCode: string }) {
  useEffect(() => {
    const next = `/v/${redactedCode}`;
    if (window.location.pathname !== next) {
      window.history.replaceState(null, '', next);
    }
  }, [redactedCode]);

  return null;
}
