import { NextResponse, type NextRequest } from 'next/server';
import { loadEnv } from '@verifynng/config';

/**
 * `PAGE_DOMAIN_STUB` is a compose-only readiness stub for the not-yet-shipped
 * `GET /v1/tenants/by-domain/:host` (requested from E03 — see
 * CROSS-EPIC-REQUESTS.md). Format: `host:tenantSlug` pairs, comma-separated,
 * e.g. `ivoryglow.localhost:3000:ivoryglow`. No DNS/TLS involved — this only
 * proves the routing shape resolves.
 */
function resolveFromStub(host: string): string | null {
  const stub = loadEnv().PAGE_DOMAIN_STUB;
  if (!stub) return null;
  for (const pair of stub.split(',')) {
    const lastColon = pair.lastIndexOf(':');
    if (lastColon === -1) continue;
    const stubHost = pair.slice(0, lastColon).trim();
    const tenantSlug = pair.slice(lastColon + 1).trim();
    if (stubHost === host) return tenantSlug || null;
  }
  return null;
}

/**
 * Resolves a request `Host` header to a tenant slug. Hosts matching
 * `PLATFORM_HOSTS` (the platform's own domain(s) — path-based tenant
 * routing, `/p/<tenant>/<slug>`) resolve to `null`: no rewrite needed.
 * Anything else is a candidate custom domain, looked up against the stub
 * until E03 ships the real endpoint (E10 stubs to "not found" — never
 * throws, a bad/unknown host is just not a tenant).
 */
export function resolveTenantByHost(host: string): string | null {
  const env = loadEnv();
  const platformHosts = env.PLATFORM_HOSTS.split(',').map((h) => h.trim());
  if (platformHosts.includes(host)) return null;
  return resolveFromStub(host);
}

const RESERVED_FIRST_SEGMENTS = new Set([
  'p',
  'v',
  'verify',
  'status',
  'legal',
  'api',
  '_next',
  'favicon.ico',
  'robots.txt',
  'manifest.webmanifest',
  'icon',
]);

/**
 * T9 readiness hook — rewrites `/<productSlug>` to `/p/<tenant>/<productSlug>`
 * when the request's Host resolves to a tenant's custom domain. Returns
 * `null` when no rewrite applies (platform host, or an unrecognised
 * custom domain) so the caller's own routing continues unchanged.
 *
 * Not wired into middleware.ts — that's a one-line change request to E09
 * (see CROSS-EPIC-REQUESTS.md), the same shape as T7's registerTier1Renderer
 * hook. Exported here, tested in isolation, ready for that one call site.
 */
export function productPageRewrite(request: NextRequest): NextResponse | null {
  const host = request.headers.get('host');
  if (!host) return null;

  const tenantSlug = resolveTenantByHost(host);
  if (!tenantSlug) return null;

  const segments = request.nextUrl.pathname.split('/').filter(Boolean);
  if (segments.length !== 1 || RESERVED_FIRST_SEGMENTS.has(segments[0])) {
    return null;
  }

  const url = request.nextUrl.clone();
  url.pathname = `/p/${tenantSlug}/${segments[0]}`;
  return NextResponse.rewrite(url);
}
