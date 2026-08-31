# Public API deprecation policy

Applies to every route under `/api/v1/**` (the key-authenticated public API —
see `docs/epics/E16-public-api-webhooks.md`). It does not cover the internal
console/consumer routes under `/v1/**`, which are versioned independently
alongside the admin and verify-web apps.

## Versioning is date-based, not path-based

Every `/api/v1` response carries an `ApiVersion` header, currently
`2026-09-01`. A breaking change ships as a **new date**, not a new path
(`/api/v2`) — the path stays `/api/v1` forever. Integrators pin to a date
implicitly by never changing their code; once we ship a new date, both the
old and new behavior are available until the old date's sunset, selected by
whichever behavior your integration was actually built against. (If a
future need arises for callers to request an explicit prior date, that's an
additive header we can add without breaking this policy — no such
opt-in mechanism ships in E16.)

## What counts as breaking

Breaking, and therefore requires a new `ApiVersion` date and a deprecation
window for the old one:

- Removing or renaming a field in a response body.
- Removing or renaming a route, or changing its HTTP method.
- Changing a field's type or semantics (e.g. a string becoming an enum with
  a stricter set of allowed values than before).
- Making an optional request field required, or narrowing accepted values.
- Changing default behavior a caller could reasonably have relied on
  (pagination default `limit`, sort order, default scopes).

Not breaking, ships without a version bump or deprecation notice:

- Adding a new field to a response body (clients should ignore unknown
  fields — the SDK's generated types do).
- Adding a new optional request field.
- Adding a new route.
- Widening accepted values (e.g. a new enum member on a request field).
- Bug fixes that bring behavior in line with the documented contract (a
  route that was supposed to 404 on a cross-tenant lookup but 403'd instead
  is a bug fix, not a breaking change, since 403 was never the documented
  behavior).

## Deprecating a route

1. Add an entry to `apps/api/src/modules/public-api/deprecations.ts`:
   ```ts
   export const DEPRECATIONS: Record<string, DeprecationEntry> = {
     'GET /api/v1/some-route': { sunset: '2027-09-01' },
   };
   ```
   No controller change is required — the same map drives both the live
   response headers (`DeprecationInterceptor`) and the generated OpenAPI
   spec's `deprecated: true` flag (`openapi.ts`), so the two can never drift.
2. Every response from that route now carries:
   ```
   Deprecation: true
   Sunset: Wed, 01 Sep 2027 00:00:00 GMT
   Link: <https://…/api/docs#deprecation-policy>; rel="deprecation"
   ```
3. Regenerate and commit the spec (`pnpm api:openapi:generate`) — CI fails
   otherwise (`pnpm api:openapi:check`).
4. Announce the deprecation in the changelog (below) with the sunset date
   and the replacement, if any.

## Support window

**A deprecated route (or field) keeps working for at least 12 months** from
the date `Deprecation: true` first appears in production responses — the
`sunset` value in `deprecations.ts` must be at least 12 months out from
the day the entry is added. After the sunset date, the route may start
returning `410 Gone`; it is never removed or repurposed before that date.

## Changelog

Breaking changes and deprecations are recorded here, newest first. Nothing
has shipped yet — this section is seeded empty as of the epic's first
release (`ApiVersion: 2026-09-01`).

| Date | ApiVersion | Change | Sunset (old behavior) |
| ---- | ---------- | ------ | --------------------- |
| —    | —          | —      | —                     |

## Errors

See the error envelope shape and every `error.type` value at
[`/api/docs#errors`](/api/docs) (Scalar-rendered from the live OpenAPI
spec) — not duplicated here to avoid drift.
