# E09 — Consumer Verify Web (`apps/web-verify`)

| | |
|---|---|
| Wave | 2 |
| Status | in-progress |
| Owner | Frank Enendu (@enendufrankc) |
| GitHub Issue | [#10](https://github.com/enendufrankc/verifynNG/issues/10) |
| Depends on | E06 (verify API, verdicts, ScanEvent), E01 (`normalizeCode`, `redactCode`, fixture codes), E03 (public tenant profile), E08 (`ReportForm`), E11 (design tokens in `packages/ui`) |
| Unblocks | E10 (product-page slot in the tier-1 verdict view), E17 (`/status` route lives in this app), E19 (`/legal/**` lives in this app), E12 (`POST /v1/events/page` beacon source) |
| Readiness items | `architecture.md` step 1 (the demo loop, done properly) and step 3 (two tiers rendered distinctly) · mental-model §4 soft verdicts, §5 "no code displayed back in full" · `production-readiness.md` §2 security headers/CSP on the consumer surface, §3 privacy disclosure link, §5 error tracking on pages |

## Goal

The page a consumer in a Lagos shop lands on two seconds after scanning a bottle — rebuilt from the milestone-1 `legacy/verify-platform/web-verify/index.html` into a production Next.js app that is mobile-first, server-rendered, tenant-themed, and honest. Every one of E06's nine verdicts has its own distinct, soft-worded design; tier-1 scans teach the consumer to find the hidden code; amber/red verdicts offer a report path; the full code never survives in the DOM or URL after render so an "Authentic" screenshot cannot be replayed. Without this epic the platform has an API and no product: the verify page *is* what consumers think the brand's authenticity is.

## Scope

**In:** `apps/web-verify` as a whole — App Router layout, routes `/`, `/v/[code]`, `/verify`, camera scanner, verdict components, scan-history summary, tier-1 education panel, report CTA integration, URL redaction, tenant theming from the public profile, i18n scaffold, offline/slow-network states, Lighthouse budgets, OpenGraph per tenant, security headers, legal footer links, analytics page beacon, Playwright E2E across all verdicts.

**Out (with owner):**
- `/p/**` product-page routes and everything under `components/product-page/**` — E10. E09 exposes a slot; E10 fills it.
- `/status` public status page — E17.
- `/legal/**` legal document pages — E19. E09 only renders footer links to them.
- Verdict computation, rate limiting, ScanEvent writes — E06. This app calls the API once and renders what it is told.
- Report submission API and the `ReportForm` component itself — E08. E09 mounts it.
- Page-view rollups and the `/v1/events/page` endpoint — E12. E09 only fires the beacon.
- Design tokens and primitive components (`Button`, `Card`, `Skeleton`) — E11 in `packages/ui`. E09 composes them.
- Tenant public profile endpoint (`GET /v1/tenants/:slug/public-profile`) — E03 owns tenant data; see "Interfaces" for the change request.

## Owned paths

```
apps/web-verify/**                          EXCEPT the carve-outs below
  app/layout.tsx, app/page.tsx, app/error.tsx, app/not-found.tsx, app/global-error.tsx
  app/v/[code]/**                           QR landing
  app/verify/**                             manual entry + camera scanner
  app/opengraph-image.tsx, app/v/[code]/opengraph-image.tsx
  app/manifest.ts, app/robots.ts
  components/verdict/**                     one component per verdict + shared frame
  components/scanner/**                     camera QR scanner (client-only)
  components/education/**                   "find the hidden code" panel
  components/history/**                     scan-history summary
  components/tenant/**                      ThemeProvider from public profile, TenantFooter
  lib/{api.ts,redact.ts,beacon.ts,i18n/**,theme.ts}
  messages/{en,pcm,yo,ha,ig}.json
  middleware.ts                             security headers, locale detection
  next.config.ts                            CSP, image domains (MinIO), headers
  e2e/**                                    Playwright specs for this app
  lighthouse/budgets.json, lighthouserc.json
packages/config/src/env.ts                  (section comment "E09": NEXT_PUBLIC_* for web-verify)

CARVE-OUTS inside apps/web-verify (owned by others, do not touch):
  app/p/**                     and  components/product-page/**     → E10
  app/status/**                                                   → E17
  app/legal/**                                                    → E19
```

## Interfaces

**Consumes**

- E06 `GET /v1/verify/:code` — the *only* server call on `/v/[code]`. Response: `{ verdict, tier, code (redacted), tenant: { slug }, product?: { name, sku }, batch?: { id, commissionedAt, oemName? }, history?: { firstVerifiedAt, scanCount, regions: [{ country, city? }] }, message?, retryAfter? }`. Verdict ∈ `invalid | unknown | ok | authentic | already-verified | suspicious | flagged | decommissioned | rate-limited`. E09 passes `x-forwarded-for` and `user-agent` through so E06 records the consumer's IP/UA, not the Next server's — E06 must trust these headers only from the `web-verify` service (shared secret header `x-verify-proxy-key`; **change request on E06**).
- E01 `normalizeCode`, `redactCode`, `parseCode` from `@verifyng/core` (pure; used client-side for input cleanup and server-side for URL redaction). Fixture codes in `packages/core/test/fixtures/` are seeded into Postgres by E04/E21 seed so E2E can hit every verdict.
- E03 `GET /v1/tenants/:slug/public-profile` → `{ slug, name, logoUrl?, palette: { primary, accent, bg, ink }, fontDisplay?, fontBody?, trademarkLine?, supportUrl?, socials? }`. Public, cached (`Cache-Control: public, max-age=300`). **Change request on E03**: this route does not exist yet; E09 stubs it behind `lib/api.ts` returning the IVORY GLOW defaults until E03 ships it.
- E08 `ReportForm` from `packages/ui` and `POST /v1/reports` — mounted on `suspicious | flagged | unknown | decommissioned` verdicts with `{ tenantSlug, redactedCode, verdict, scanEventId? }` pre-filled. **Change request on E06**: return `scanEventId` in the verify response so a report can reference the exact scan.
- E11 `packages/ui` design tokens (CSS variables `--color-primary`, `--color-accent`, `--color-bg`, `--color-ink`, `--font-display`, `--font-body`) and primitives.
- E12 `POST /v1/events/page` beacon `{ tenantSlug, route, verdict?, tier?, locale, referrerType: 'qr'|'manual'|'camera'|'direct' }` — fired with `navigator.sendBeacon`, no cookies, no identifiers.
- E19 routes `/legal/privacy`, `/legal/terms`, `/legal/cookie` for footer links.
- E17 `/status` for the footer "System status" link.

**Exposes**

- Route contract for printed QR codes: `https://<host>/v/<code>` — **this URL format is permanent** (E04's QR renderer and E01's `toGs1DigitalLink({ baseUrl })` point at it). Never rename.
- `Tier1ProductSlot` — React server component boundary at `components/verdict/Tier1Verdict.tsx`: `<Tier1ProductSlot tenantSlug productId batchId />` renders E09's default product summary until E10 registers a renderer via `registerTier1Renderer()` in `lib/slots.ts`. E10 may only add files under its own paths and call that one function.
- `TenantThemeProvider` (`components/tenant/ThemeProvider.tsx`) — resolves the public profile and sets E11 CSS variables on `<html>`; E10, E17, E19 pages inside this app wrap themselves in it.
- `useLocale()` / `t()` from `lib/i18n` — message-catalog access other epics' routes in this app use.
- `lib/beacon.ts` `sendPageBeacon()` — other routes in this app call it rather than posting to E12 directly.
- Playwright helpers in `e2e/helpers.ts`: `gotoCode(page, fixtureName)`, `expectVerdict(page, verdict)`.

Domain events: none (consumer app publishes nothing; E06 and E12 own the events).

## Data model

None. E09 owns no Prisma models. It reads E06's verify response and E03's public profile only.

## Tasks

Design input: use `packages/ui` tokens/components (E11) which implement `docs/design/foundations/foundations-v0.2-turquoise.dc.html`; read `docs/design/README.md` for the verdict family rules (four channels, colour last, tone keyed off E06 `severity`) and the enum mapping. Do not introduce colours, fonts or radii outside the tokens.

- [ ] T1 App shell: take over the E00 skeleton — root `layout.tsx` with `TenantThemeProvider`, `TenantFooter` (legal links → E19 routes, status → E17 route, "Verified by Tunnel Light Verify Platform" line as in the legacy footer), `error.tsx`/`not-found.tsx`, `middleware.ts` setting CSP (`default-src 'self'; img-src 'self' data: <MINIO_PUBLIC_URL>; connect-src 'self' <API_URL>`), HSTS, `X-Frame-Options: DENY` except `/p/**` (E10 embeds in the builder preview), `Referrer-Policy: no-referrer`. Tailwind wired to E11 tokens.
- [ ] T2 `lib/api.ts`: typed server-only client for `GET /v1/verify/:code` and `GET /v1/tenants/:slug/public-profile` with 3s timeout, one retry on network error (never on 4xx), `x-verify-proxy-key` + forwarded IP/UA headers, Zod-parsed responses. Stub for public-profile returning IVORY GLOW defaults when E03 responds 404 (remove when E03 ships).
- [ ] T3 `/v/[code]` server route: decode, `normalizeCode`, call verify API once at request time (`dynamic = 'force-dynamic'`, `Cache-Control: private, no-store`), resolve tenant from `parseCode(code).tenant`, render `<VerdictView>`; when verify returns 5xx or times out, render the `error` state with a retry button (never a fake verdict). Sets `<title>` and OG tags from tenant profile + verdict class (no code in metadata).
- [ ] T4 Verdict components, one per verdict in `components/verdict/`, sharing `VerdictFrame` (badge, title, message, rows, tier tag — the legacy card, redesigned with tokens). Colour classes: green = `authentic`, `ok`; amber = `already-verified`, `suspicious`, `rate-limited`; red = `unknown`, `flagged`, `decommissioned`, `invalid`; grey = `error`/loading. Copy follows mental-model §4 exactly ("First verified <date>, <city>. Verified N times since — normal for resale or shared use" for already-verified; "possible counterfeit duplication — treat with caution and report" for suspicious; "withdrawn by the brand" for decommissioned). Every component has a Storybook-less fixture page at `/verify/_preview/[verdict]` (dev-only, removed from production build).
- [ ] T5 Scan-history summary (`components/history/`): first verified date (localised), count, regions as `country` and optional `city` chips — never coordinates, never IP, never timestamps of individual later scans. Tier-1 shows only "Scanned N times" with no geo.
- [ ] T6 Tier-1 education panel (`components/education/`): illustrated "Find the hidden code under the cap / behind the scratch panel" steps, brand-themed, with a "I found it — enter it" button deep-linking to `/verify?tier=2`. Mounts the `Tier1ProductSlot` above it (E09 default: product name, batch id, commissioned month, OEM country).
- [ ] T7 Share-safe pages: after hydration `history.replaceState` rewrites `/v/<full code>` → `/v/<redacted>` (`redactCode`), the full code is never placed in any DOM node, `data-*` attribute, or inline script (server passes only the redacted form to the client); `robots.ts` disallows `/v/`; OG image shows tenant + verdict class, never the code.
- [ ] T8 `/verify` manual entry: single input with `inputmode="text"`, `autocapitalize="characters"`, live `normalizeCode` preview ("we read this as `IVORYGLOW.2.K1.ABCD…`"), accepts dashes/spaces/lowercase/I-L-O, client-side `parseCode` check with inline hint before navigation to `/v/[normalised]`; form posts without JS too (progressive enhancement).
- [ ] T9 Camera scanner (`components/scanner/`, `'use client'`, dynamically imported): `BarcodeDetector` when available, fallback `@zxing/browser`; permission-denied and no-camera states; accepts any QR whose payload is a `/v/<code>` URL on a known host or a bare code; on decode navigates to `/v/[code]`. Torch toggle on supported devices.
- [ ] T10 Offline/slow-network resilience: route-level `loading.tsx` skeletons matching the verdict card geometry (no layout shift), `error.tsx` with "Retry" that re-requests without re-recording history (uses the same `/v/[code]` — E06 dedupes within its rate window), `manifest.ts` + minimal service worker caching only the shell and fonts (never verdict responses), offline banner via `navigator.onLine`.
- [ ] T11 i18n scaffold: `next-intl`-style message catalogs `messages/en.json` complete, `pcm` (Nigerian Pidgin), `yo`, `ha`, `ig` with English placeholders and a `TODO_TRANSLATE` marker; locale from `?lang=` → cookie-less `Accept-Language` → `en`; language switcher in footer; all verdict copy, education steps and form labels go through `t()`. Dates/numbers via `Intl` with the locale.
- [ ] T12 Analytics beacon (`lib/beacon.ts`): `sendPageBeacon` on every route view with `referrerType` derived from route (`/v/` = `qr`, from `/verify` form = `manual`, from scanner = `camera`); no cookies, no localStorage identifiers, honours `navigator.doNotTrack`. Assertion test that `document.cookie === ''` after a full flow (E19 will import this test into its cookie-less suite).
- [ ] T13 Performance & a11y budgets: `lighthouserc.json` run in CI against the compose stack on `/v/<fixture>` and `/verify` with mobile emulation — performance ≥ 90, accessibility ≥ 95, best-practices ≥ 95; `budgets.json` total JS ≤ 130 kB gzipped on `/v/[code]` (scanner and `ReportForm` are lazy chunks); fonts self-hosted with `font-display: swap`; verdict card readable without JS.
- [ ] T14 Playwright E2E (`e2e/verdicts.spec.ts`, `e2e/manual-entry.spec.ts`, `e2e/scanner.spec.ts`, `e2e/share-safe.spec.ts`): one test per verdict using E01 fixture codes seeded by E04/E21 (`fixtures.authenticFirstScan`, `fixtures.alreadyVerified`, `fixtures.suspicious`, `fixtures.flagged`, `fixtures.decommissioned`, `fixtures.tier1Ok`, `fixtures.unknownWellFormed`, malformed string, rate-limit by looping 60 requests); scanner test feeds a synthetic video track with a QR frame; axe-core accessibility assertions on each verdict page.

## Acceptance criteria

- [ ] AC1 `docker compose up`, then open `http://localhost:3000/v/<fixtures.authenticFirstScan>` on a phone-sized viewport → green "Authentic" card with "You are the first person to verify this unit", product name, batch id, tenant logo and IVORY GLOW palette from the public profile; `curl -s localhost:3000/v/<code> | grep -c <full code>` prints `0`; after load the address bar reads `/v/ivoryglow.2.k1.ABCD…`.
- [ ] AC2 Open the same URL again → amber "Already verified" card showing "First verified <today>, <city from fake-geo>. Verified 2 times since." with a country/city chip and no report CTA; open `/v/<fixtures.suspicious>` → amber "Suspicious" card *with* E08's `ReportForm` mounted and pre-filled with the redacted code; `/v/<fixtures.flagged>` → red card with ReportForm; `/v/<fixtures.decommissioned>` → red "Withdrawn by the brand"; `/v/not-a-code` → red "Invalid"; `/v/<fixtures.unknownWellFormed>` → red "Not in our registry … likely counterfeit"; `/v/<fixtures.tier1Ok>` → green "Genuine product line" with the education panel and default product slot. Every state is visually distinct (screenshots attached to the issue).
- [ ] AC3 `for i in $(seq 70); do curl -s -o /dev/null localhost:3000/v/<fixtures.tier1Ok>; done` then open it in the browser → amber "Too many attempts — try again in N seconds" card (rate-limited), no crash, no stack trace.
- [ ] AC4 `http://localhost:3000/verify`: type `ivory glow-2-k1-abcd 1l0o…` (lowercase, spaces, dashes, I/L/O) → preview shows the normalised code, submit navigates to `/v/<normalised>` and verifies. With JavaScript disabled in DevTools the same form still submits and renders a verdict.
- [ ] AC5 `http://localhost:3000/verify` → "Scan with camera" opens the scanner (Playwright injects a fake camera stream via `--use-fake-device-for-media-stream --use-file-for-fake-video-capture=e2e/fixtures/qr-tier2.y4m`) and lands on the correct verdict page.
- [ ] AC6 `docker compose stop api`, reload `/v/<code>` → grey "We couldn't reach the verification service" card with a Retry button (no false verdict); `docker compose start api`, tap Retry → verdict renders. Chrome DevTools "Slow 3G": skeleton appears within 1s, no layout shift on card arrival (CLS < 0.1 in Lighthouse).
- [ ] AC7 `pnpm --filter web-verify lighthouse` (CI job `lighthouse-web-verify`) → mobile performance ≥ 90, accessibility ≥ 95 on `/v/<fixture>` and `/verify`; `pnpm --filter web-verify test:e2e` runs the four spec files green against compose, including axe assertions.
- [ ] AC8 Mailpit is untouched and `document.cookie` is empty after a full scan flow; Network tab shows exactly one `POST /v1/events/page` per route view with no cookie header; `/v/<code>?lang=pcm` renders Pidgin placeholder catalog and the footer language switcher lists en/pcm/yo/ha/ig.
- [ ] AC9 Response headers on `/v/<code>` include `Content-Security-Policy`, `Strict-Transport-Security`, `Referrer-Policy: no-referrer`, `Cache-Control: private, no-store`; `curl -I localhost:3000/v/<code> | grep -i x-frame-options` → `DENY`. Footer links resolve to `/legal/privacy`, `/legal/terms`, `/status` (may 404 until E19/E17 ship — links must exist).

## Testing

- **Unit (Vitest):** `lib/redact.ts` (URL rewrite never leaks a full code for every fixture), `lib/i18n` fallback chain, verdict → colour-class mapping (exhaustive over the E06 union so adding a verdict fails typecheck), beacon payload builder (no identifier fields), `normalizeCode` preview component.
- **Component (Vitest + Testing Library):** each verdict component renders required copy and the correct CTA set (report present only on amber/red minus rate-limited; education only on tier-1).
- **E2E (Playwright, against compose):** every verdict via fixture codes; manual entry with and without JS; scanner with fake camera; share-safety (`page.content()` and `page.url()` contain no full code); offline/API-down; axe on every page; a11y keyboard walk of the `/verify` form.
- **Perf:** Lighthouse CI budgets as a required check.

## Compose services added

None. Uses E00's `web-verify` service (port 3000) and E06's `api`. Adds env `VERIFY_PROXY_KEY` (shared with `api`), `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_MINIO_PUBLIC_URL`, `NEXT_PUBLIC_DEFAULT_TENANT=ivoryglow` with compose defaults.

## Notes and decisions

- **One server call per landing.** `/v/[code]` calls E06 exactly once, server-side; the client never holds the full code, so there is nothing to replay. Retry re-requests the same route; E06's rate window makes the second recording idempotent enough for consumers.
- **Verdict colour classes are a fixed four-way mapping**, but the *copy* per verdict differs — nine distinct components, not four. Soft language is a product requirement (mental-model §4), not a style choice.
- **Geo shown to consumers is country + city only** (open question in mental-model §8 resolved here for the UI; E06 already stores only that granularity).
- **`@zxing/browser` fallback** rather than jsQR because it handles ITF/other 2D symbologies E04 may add later; `BarcodeDetector` preferred where present (Android Chrome — the majority device in target markets).
- **i18n catalogs are scaffolded, not translated.** Placeholders are deliberate; translation is a content task tracked separately.
- **Carve-outs are absolute:** E10 (`/p/**`, product-page components), E17 (`/status`), E19 (`/legal/**`) add files in this app without touching E09's files other than one `registerTier1Renderer()` call site E09 provides.
- Change requests raised: E06 — accept forwarded IP/UA behind `x-verify-proxy-key` and return `scanEventId`; E03 — add `GET /v1/tenants/:slug/public-profile`.
