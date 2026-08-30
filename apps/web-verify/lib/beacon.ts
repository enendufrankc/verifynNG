/**
 * `POST /v1/events/page` beacon for E12 (not shipped on `main` yet —
 * `navigator.sendBeacon` is fire-and-forget so a 404 is silent and this
 * needs no stub). Browser-only: reads the build-time-inlined
 * `NEXT_PUBLIC_API_URL` (the browser-reachable origin), never
 * `API_INTERNAL_URL` (container-only, used by lib/api.ts's server-side
 * calls). No cookies, no localStorage identifiers, honours
 * `navigator.doNotTrack`.
 */
export type ReferrerType = 'qr' | 'manual' | 'camera' | 'direct';

export interface PageBeaconPayload {
  tenantSlug: string;
  route: string;
  verdict?: string;
  tier?: 1 | 2;
  locale: string;
  referrerType: ReferrerType;
}

export function sendPageBeacon(payload: PageBeaconPayload): void {
  if (typeof navigator === 'undefined' || !navigator.sendBeacon) return;
  if (navigator.doNotTrack === '1') return;

  const apiUrl = process.env.NEXT_PUBLIC_API_URL;
  if (!apiUrl) return;

  const body = new Blob([JSON.stringify(payload)], {
    type: 'application/json',
  });
  navigator.sendBeacon(`${apiUrl}/v1/events/page`, body);
}
