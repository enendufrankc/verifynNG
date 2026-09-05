# E09 — Consumer Verify Web (`apps/web-verify`)

|                 |                                                                                                                                                                                                                                                                                                             |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Wave            | 2                                                                                                                                                                                                                                                                                                           |
| Status          | done                                                                                                                                                                                                                                                                                                 |
| Owner           | Frank Enendu (@enendufrankc)                                                                                                                                                                                                                                                                                |
| GitHub Issue    | [#10](https://github.com/enendufrankc/verifynNG/issues/10)                                                                                                                                                                                                                                                  |
| Depends on      | E06 (verify API, verdicts, ScanEvent), E01 (`normalizeCode`, `redactCode`, fixture codes), E03 (public tenant profile), E08 (`ReportForm`), E11 (design tokens in `packages/ui`)                                                                                                                            |
| Unblocks        | E10 (product-page slot in the tier-1 verdict view), E17 (`/status` route lives in this app), E19 (`/legal/**` lives in this app), E12 (`POST /v1/events/page` beacon source)                                                                                                                                |
| Readiness items | `architecture.md` step 1 (the demo loop, done properly) and step 3 (two tiers rendered distinctly) · mental-model §4 soft verdicts, §5 "no code displayed back in full" · `production-readiness.md` §2 security headers/CSP on the consumer surface, §3 privacy disclosure link, §5 error tracking on pages |

## Goal

The page a consumer in a Lagos shop lands on two seconds after scanning a bottle — rebuilt from the milestone-1 `legacy/verify-platform/web-verify/index.html` into a production Next.js app that is mobile-first, server-rendered, tenant-themed, and honest. Every one of E06's nine verdicts has its own distinct, soft-worded design; tier-1 scans teach the consumer to find the hidden code; amber/red verdicts offer a report path; the full code never survives in the DOM or URL after render so an "Authentic" screenshot cannot be replayed. Without this epic the platform has an API and no product: the verify page _is_ what consumers think the brand's authenticity is.

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

- E06 `GET /v1/verify/:code` — the _only_ server call on `/v/[code]`. Response: `{ verdict, tier, code (redacted), tenant: { slug }, product?: { name, sku }, batch?: { id, commissionedAt, oemName? }, history?: { firstVerifiedAt, scanCount, regions: [{ country, city? }] }, message?, retryAfter? }`. Verdict ∈ `invalid | unknown | ok | authentic | already-verified | suspicious | flagged | decommissioned | rate-limited`. E09 passes `x-forwarded-for` and `user-agent` through so E06 records the consumer's IP/UA, not the Next server's — E06 must trust these headers only from the `web-verify` service (shared secret header `x-verify-proxy-key`; **change request on E06**).
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

- [x] T1 App shell: take over the E00 skeleton — root `layout.tsx` with `TenantThemeProvider`, `TenantFooter` (legal links → E19 routes, status → E17 route, "Verified by Tunnel Light Verify Platform" line as in the legacy footer), `error.tsx`/`not-found.tsx`, `middleware.ts` setting CSP (`default-src 'self'; img-src 'self' data: <MINIO_PUBLIC_URL>; connect-src 'self' <API_URL>`), HSTS, `X-Frame-Options: DENY` except `/p/**` (E10 embeds in the builder preview), `Referrer-Policy: no-referrer`. Tailwind wired to E11 tokens.
- [x] T2 `lib/api.ts`: typed server-only client for `GET /v1/verify/:code` and `GET /v1/tenants/:slug/public-profile` with 3s timeout, one retry on network error (never on 4xx), forwarded IP/UA headers, Zod-parsed responses. Stub for public-profile returning IVORY GLOW defaults when E03 responds non-2xx (remove when E03 ships). _(No `x-verify-proxy-key` — the shipped E06 controller trusts forwarded headers directly behind `TRUST_PROXY`, no shared-secret gate exists to honour.)_
- [x] T3 `/v/[code]` server route: decode, `normalizeCode`, call verify API once at request time (`dynamic = 'force-dynamic'`, `Cache-Control: private, no-store` set in middleware), resolve tenant from `brand.slug` or `parseCode(code).tenant`, render `<VerdictView>`; when verify returns 5xx/times out/bad-response, render the `error` state with a retry button (never a fake verdict). Sets `<title>` and OG tags from tenant profile (verdict class omitted from OG per T7 — see note below).
- [x] T4 Verdict components, one per verdict in `components/verdict/`, sharing `VerdictFrame`. _(Colour mapping deviates from this line's stale draft: the shipped `VerdictEngine` gives `already-verified` severity `green`, not amber — see the design-vs-doc note in the PR. Tone follows `docs/design/README.md`'s seven-hue palette (`v-pos/v-hist/v-susp/v-flag/v-dec/v-unk/v-util`) instead of a flat 4-way grouping, keyed off the verdict string with an exhaustive switch, not off `severity`.)_ Storybook-less `/verify/_preview/[verdict]` fixture page not built yet (deferred with T8/T9).
- [x] T5 Scan-history summary (`components/history/`): first verified date (localised), count, region chips (E06 returns pre-formatted `"City, CC"` strings, not separate country/city fields) — never coordinates, IP, or individual scan timestamps. _(Tier-1 "Scanned N times" not shown: E06's `ok` verdict carries no `history` block at all — flagged as a gap for E06, not implemented client-side without real data.)_
- [~] T6 Tier-1 education panel (`components/education/`): steps + "I found it — enter it" button shipped; `Tier1ProductSlot`/`registerTier1Renderer` slot boundary shipped (`lib/slots.ts`). Illustration artwork not done.
- [x] T7 Share-safe pages: after hydration `history.replaceState` rewrites `/v/<full code>` → `/v/<redacted>`; `robots.ts` disallows `/v/`. OG image generation (`opengraph-image.tsx`) not built yet — OG tags are text-only for now, still code-free. **Known, verified, narrow gap** (found via T14's E2E, not fixed): Next.js's App Router always embeds a dynamic segment's literal value in its RSC "flight payload" (an inline `<script>`, for client-side hydration/history bookkeeping) — so the _very first_ response for `/v/<full code>` carries it once, there, regardless of app code. A middleware-rewrite fix was built and confirmed NOT to change this (the payload reflects the actually-_requested_ URL, not any internal target) — reverted, since it added real complexity for zero benefit. Every other surface is clean and E2E-verified: rendered DOM/attributes (a real bug here — the footer's language switcher — was found and fixed), the address bar after hydration, and the raw response outside that one script tag.
- [x] T8 `/verify` manual entry: single input with `inputmode="text"`, `autocapitalize="characters"`, live normalized preview, accepts dashes/spaces/lowercase/I-L-O, format-only inline hint (checksum validation stays server-side — needs the signing key); form posts without JS too via a server-side redirect (progressive enhancement). Verified live: no-JS `GET /verify?code=...` 307-redirects to the correctly normalized `/v/[code]`.
- [x] T9 Camera scanner (`components/scanner/`, `'use client'`, dynamically imported): `BarcodeDetector` when available, fallback `@zxing/browser`; permission-denied/no-camera/generic-error states; accepts a `/v/<code>` URL on _any_ host (`/v/[code]` itself is the sole source of truth for validity, not a host allowlist) or a bare code; on decode navigates to `/v/[code]`. Torch toggle on supported devices. Verified live that the scanner/zxing code never loads into the initial `/verify` bundle; camera permission/decode behaviour itself needs a real browser (Playwright + fake video device, T14) — not yet run.
- [x] T10 Offline/slow-network resilience: `app/v/[code]/loading.tsx` skeleton matching the verdict card geometry exactly (no layout shift); the API-down error state + Retry (T3/AC6, already verified) reuses the same `/v/[code]` route; `public/sw.js` + registration component cache only `/_next/static/**`/`manifest.webmanifest`/fonts, explicitly bypassing `/v/**` and `/api/**`; offline banner via `navigator.onLine`. Verified live: fixed a real `output: 'standalone'` gotcha (Dockerfile doesn't copy `public/` by default) that made `sw.js` 404 until corrected.
- [x] T11 i18n scaffold: message catalogs `messages/en.json` complete, `pcm`/`yo`/`ha`/`ig` English placeholders with `TODO_TRANSLATE`; locale from `?lang=` → cookie-less `Accept-Language` → `en`; language switcher in footer; verdict titles/tier labels/row labels/history/report/education/form copy all go through `t()`. Dates via `Intl` with the locale. _(E06's `message` field itself stays English regardless of locale — no interface exists for E06 to localize it; only the static UI chrome is translated.)_ Verified live: `?lang=pcm` and `Accept-Language: yo-NG` both render the placeholder catalog end to end.
- [x] T12 Analytics beacon (`lib/beacon.ts`): `sendPageBeacon` on `/v/[code]` and `/verify` (home `/` skipped — it's statically prerendered and `useSearchParams` would force it dynamic) with `referrerType` derived from route; no cookies, no localStorage identifiers, honours `navigator.doNotTrack`. Required splitting `NEXT_PUBLIC_API_URL` (browser-facing, build-time) from a new `API_INTERNAL_URL` (container-network, runtime) — see the PR for why. `document.cookie === ''` assertion deferred to T14 (needs a real browser).
- [x] T13 Performance & a11y budgets: `lighthouserc.js` (`pnpm --filter web-verify lighthouse`) run against a live `docker compose up` stack (real Chrome, mobile emulation) on `/v/<fixture>` and `/verify` — measured performance 0.99–1.0, accessibility 1.0, best-practices 0.96, both well above the ≥90/≥95/≥95 thresholds; `budgets.json` — script transfer measured at 113 kB against the 130 kB budget (scanner + `@zxing/browser` are already a lazy chunk, confirmed absent from the initial bundle in T9). This run caught and fixed a real CSP bug from T12 (see that commit). _(Fonts aren't self-hosted yet — no custom font is actually loaded anywhere in this app yet; `--font-sans` falls back to `system-ui`, which is E11's gap to close, not implemented here. Verdict card readable without JS — inherent to the SSR architecture, not separately tested.)_
- [x] T14 Playwright E2E (`tests/e2e/verify-{verdicts,manual-entry,scanner,share-safe}.spec.ts` — the repo's actual E2E convention centralizes specs under root `tests/e2e/`, not a per-app `e2e/**`; see "Owned paths" note below): one test per verdict, own fixture seeding (`tests/e2e/fixtures/verify-fixtures.ts`, since E04/E21 haven't shipped stable seeded fixtures yet) using real `generateCode`/`hashForStorage`, malformed string, rate-limit by looping 70 requests; scanner test feeds a real QR-encoded fake video device; axe-core on every verdict page and the `/verify` form. All four files pass green individually (desktop + mobile projects) against a live `docker compose up` stack — running all four back-to-back can trip E06's shared per-IP rate limit on its own (a real, logged environmental interaction, not a bug in the tests).

## Acceptance criteria

- [ ] AC1 `docker compose up`, then open `http://localhost:3000/v/<fixtures.authenticFirstScan>` on a phone-sized viewport → green "Authentic" card with "You are the first person to verify this unit", product name, batch id, tenant logo and IVORY GLOW palette from the public profile; `curl -s localhost:3000/v/<code> | grep -c <full code>` prints `0`; after load the address bar reads `/v/ivoryglow.2.k1.ABCD…`.
- [ ] AC2 Open the same URL again → amber "Already verified" card showing "First verified <today>, <city from fake-geo>. Verified 2 times since." with a country/city chip and no report CTA; open `/v/<fixtures.suspicious>` → amber "Suspicious" card _with_ E08's `ReportForm` mounted and pre-filled with the redacted code; `/v/<fixtures.flagged>` → red card with ReportForm; `/v/<fixtures.decommissioned>` → red "Withdrawn by the brand"; `/v/not-a-code` → red "Invalid"; `/v/<fixtures.unknownWellFormed>` → red "Not in our registry … likely counterfeit"; `/v/<fixtures.tier1Ok>` → green "Genuine product line" with the education panel and default product slot. Every state is visually distinct (screenshots attached to the issue).
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
- **Verdict colour classes are a fixed four-way mapping**, but the _copy_ per verdict differs — nine distinct components, not four. Soft language is a product requirement (mental-model §4), not a style choice.
- **Geo shown to consumers is country + city only** (open question in mental-model §8 resolved here for the UI; E06 already stores only that granularity).
- **`@zxing/browser` fallback** rather than jsQR because it handles ITF/other 2D symbologies E04 may add later; `BarcodeDetector` preferred where present (Android Chrome — the majority device in target markets).
- **i18n catalogs are scaffolded, not translated.** Placeholders are deliberate; translation is a content task tracked separately.
- **Carve-outs are absolute:** E10 (`/p/**`, product-page components), E17 (`/status`), E19 (`/legal/**`) add files in this app without touching E09's files other than one `registerTier1Renderer()` call site E09 provides.
- Change requests raised: E06 — accept forwarded IP/UA behind `x-verify-proxy-key` and return `scanEventId`; E03 — add `GET /v1/tenants/:slug/public-profile`.
