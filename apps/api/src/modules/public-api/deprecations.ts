/**
 * Single source of truth for deprecated `/api/v1` routes — read by both
 * DeprecationInterceptor (live response headers) and openapi.ts (marks
 * `deprecated: true` in the generated spec) so marking a route deprecated
 * never requires touching the controller.
 *
 * Key: `${METHOD} ${expressRoutePath}` — the same pattern Express registers
 * the route under (`req.route.path`), e.g. `'GET /api/v1/units/:id'`.
 * `sunset` is an ISO 8601 date — see docs/public-api-deprecation-policy.md
 * for the 12-month-minimum rule.
 */
export interface DeprecationEntry {
  sunset: string;
}

export const DEPRECATIONS: Record<string, DeprecationEntry> = {};
