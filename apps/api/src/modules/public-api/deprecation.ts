import type { DeprecationEntry } from './deprecations.js';

/** RFC 7231 IMF-fixdate, e.g. "Wed, 01 Sep 2027 00:00:00 GMT" — what `Sunset` requires. */
export function toHttpDate(isoDate: string): string {
  return new Date(`${isoDate}T00:00:00Z`).toUTCString();
}

export function routeKeyFor(method: string, routePath: string): string {
  return `${method.toUpperCase()} ${routePath}`;
}

export interface DeprecationHeaders {
  Deprecation: 'true';
  Sunset: string;
  Link: string;
}

/** Pure so it's testable without a live request/response — see deprecation.spec.ts. */
export function buildDeprecationHeaders(
  entry: DeprecationEntry,
  docsUrl: string,
): DeprecationHeaders {
  return {
    Deprecation: 'true',
    Sunset: toHttpDate(entry.sunset),
    Link: `<${docsUrl}>; rel="deprecation"`,
  };
}

export function lookupDeprecation(
  map: Record<string, DeprecationEntry>,
  method: string,
  routePath: string | undefined,
): DeprecationEntry | undefined {
  if (!routePath) return undefined;
  return map[routeKeyFor(method, routePath)];
}
