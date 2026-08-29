# E11 — Admin Console Shell & Design System

| | |
|---|---|
| Wave | 1 |
| Status | in-progress |
| Owner | enendufrankc |
| GitHub Issue | [#12](https://github.com/enendufrankc/verifynNG/issues/12) |
| Depends on | E02 (interfaces: `/auth/*` routes, JWT claims, `memberships`, roles), E00 (web-admin skeleton hand-off) |
| Unblocks | every epic with a console screen: E03, E04, E07, E08, E10, E12, E13, E15, E18, E19; E21 (Playwright fixtures, axe in CI) |
| Readiness items | none directly — enables §1 "real IdP for admin console" screens, §9 self-service surfaces; `architecture.md` step 7 console |

## Goal

One place every tenant screen lives, looking like one product. `packages/ui` gives shared, accessible, tenant-themeable primitives with the IVORY GLOW gold/ivory palette from `legacy/verify-platform/src/core/sheet.js` as the default theme; `apps/web-admin` gives the App Router shell — sidebar navigation driven by a registry other epics add one line to, login / MFA / password-reset screens wired to E02, a tenant switcher, role-aware navigation, a typed `apiClient` with silent refresh, TanStack Query and form conventions, and an `EmptyState` placeholder for every module so `docker compose up` shows the whole console map on day one. Playwright's `loginAs(role)` fixture and an axe accessibility gate in CI mean every later screen inherits tests and a11y for free.

## Scope

**In:** `packages/ui` design tokens + CSS variables, shadcn/ui-based primitives (Button, Input, Select, Checkbox, Table, DataTable, Dialog, Sheet/Drawer, Toast, Tabs, Badge, EmptyState, Form field wrappers, Skeleton, PageHeader), Storybook, `apps/web-admin` shell: root layout, `(auth)` route group (login, MFA challenge, forgot/reset password, set password from invite), `(console)` layout with sidebar + topbar, `nav.config.ts` registry, tenant switcher, role-aware nav filtering, `apiClient` (typed fetch, access token in memory, refresh token in `httpOnly` cookie via a Next route handler proxy, 401 → refresh → retry once), TanStack Query provider + key conventions, react-hook-form + zod conventions, route-group skeleton with `EmptyState` for every module, Playwright config + `loginAs(role)` fixture, `@axe-core/playwright` gate, dark mode toggle (tokens only), responsive sidebar (drawer < 1024 px).

**Out:** business screens inside any module (owning epics: products/oems/batches → E04, units/anomalies → E07, scans → E12, reports → E08, analytics → E12, team → E11 itself (the one business screen E11 builds, as the reference implementation — see T11); audit → E13, billing → E15, settings/organization → E03, settings/security (MFA, sessions, password) → E11, support → E03/E18), the consumer verify web (E09 — may import `packages/ui` tokens), onboarding wizard (E03 owns `(onboarding)`), notifications UI (E14), SSO buttons (E20), the API itself.

## Owned paths

```
packages/ui/**                                        (tokens, primitives, Storybook, tailwind preset)
apps/web-admin/app/layout.tsx, globals.css, providers.tsx
apps/web-admin/app/(auth)/**                          (login, mfa, forgot-password, reset-password, set-password)
apps/web-admin/app/(console)/layout.tsx               (sidebar, topbar, tenant switcher, breadcrumbs)
apps/web-admin/app/(console)/nav.config.ts            (HOT-SPOT: other epics add one entry each)
apps/web-admin/app/(console)/page.tsx                 (dashboard EmptyState → E12 replaces)
apps/web-admin/app/(console)/<module>/page.tsx        (EmptyState placeholders ONLY — owning epic replaces the file without asking)
apps/web-admin/app/(console)/team/**                  (members management UI over E02 routes)
apps/web-admin/app/(console)/settings/layout.tsx, settings/page.tsx, settings/security/**
apps/web-admin/app/api/auth/**                        (Next route handlers: refresh-cookie proxy, logout)
apps/web-admin/lib/**                                 (apiClient, auth store, query client, zod helpers, role utils)
apps/web-admin/components/**                          (shell-level components)
apps/web-admin/e2e/fixtures/**, playwright.config.ts  (loginAs, axe helper)
apps/web-admin/middleware.ts                          (redirect unauthenticated → /login)
docs/console.md
```

## Interfaces

**Consumes**
- E02 routes: `POST /auth/login`, `/auth/mfa/challenge`, `/auth/refresh`, `/auth/logout`, `/auth/switch-tenant`, `GET /auth/me`, `/auth/password/forgot|reset|change`, `/auth/mfa/setup|enable|disable|recovery-codes/rotate`, `GET/DELETE /auth/sessions`, `/tenants/:tenantId/members/*`. JWT claims `tid`, `role`, `prole`.
- E03 (soft): `GET /tenants/:tenantId` for status banner (`pending`/`suspended`) and `branding` for theme variables; until E03 ships the shell reads `activeTenant` from `/auth/me` only.
- E00: `NEXT_PUBLIC_API_URL`, web-admin Dockerfile and port 3001.

**Exposes**

`packages/ui` (`@verifyng/ui`):
```ts
// tokens.css — CSS variables on :root and [data-theme]; default = IVORY GLOW from legacy sheet.js
--vg-*  tokens come from docs/design/foundations/ (Claude Design output; direction A or B — see docs/design/README.md).
        Platform chrome uses the platform palette; IVORY GLOW is a *tenant theme* applied via applyTenantTheme, not the default.
--vg-verdict-{ok,authentic,history,suspicious,flagged,decommissioned,unknown,util}-{fg,tint}  — platform-locked, never tenant-overridable;
        keyed off E06 `severity`, shared with E09. Values and the enum mapping: docs/design/README.md.
--vg-radius, --vg-font-sans, --vg-font-mono, spacing scale
// tailwind preset: `@verifyng/ui/tailwind-preset` maps colours to `bg-brand`, `text-ink`, … via var()
applyTenantTheme(el: HTMLElement, branding: { primaryColor?: string; accentColor?: string }): void   // overrides --vg-brand/--vg-brand-strong only
// components (named exports): Button, IconButton, Input, Textarea, Select, Checkbox, Switch, RadioGroup, Label, FormField, FormMessage,
// Table, DataTable<TData>({ columns, data, pagination?, sorting?, rowActions?, emptyState }), Dialog, ConfirmDialog, Sheet, Toast + useToast,
// Tabs, Badge, StatusChip({ status }), EmptyState({ icon, title, description, action? }), Skeleton, PageHeader({ title, description?, actions? }),
// Breadcrumbs, Kbd, CodeBlock, ProgressBar
```

`apps/web-admin` conventions (documented in `docs/console.md`):
```ts
// nav.config.ts — the registry
export type NavEntry = {
  id: string                         // 'catalog.products'
  label: string
  href: string                       // '/products'
  icon: LucideIcon
  section: 'overview' | 'catalog' | 'monitoring' | 'organization' | 'platform'
  minRole?: 'viewer' | 'operator' | 'owner'      // default viewer
  platformRole?: 'support'                        // shown only to platform-support users
  badge?: () => Promise<number | null>            // optional count (E07 anomalies, E08 reports)
  order: number
}
export const NAV: NavEntry[] = [ /* E11 seeds one entry per module below; other epics edit their own entry only */ ]

// lib/api-client.ts
apiClient.get<T>(path, { query?, signal? }) / post / patch / delete   — throws ApiError { status, code, message, details }
// access token lives in memory (zustand store); refresh token is an httpOnly SameSite=Strict cookie set by /api/auth/session (Next route handler
// that proxies to E02 /auth/login|refresh so the browser never sees the refresh token). 401 → one refresh → retry → else logout().
useAuth(): { user, memberships, activeTenantId, role, platformRole, switchTenant(id), logout() }
useTenantPath(): (path) => `/tenants/${activeTenantId}${path}`   // every module builds API paths with this — never hardcode a tenant id

// lib/query.ts — TanStack Query
queryKeys.<module>.list(tenantId, filters) / .detail(tenantId, id)   — every key starts with tenantId so switching tenants invalidates everything
defaultOptions: staleTime 30 s, retry 1 (never on 4xx), refetchOnWindowFocus false

// forms — react-hook-form + zodResolver; <Form schema={} onSubmit={}>; server ApiError.details[] mapped to field errors via setServerErrors()
// tables — DataTable with server-side cursor pagination hook usePagedQuery(key, fetcher)
// e2e — import { test, expect } from '@/e2e/fixtures'; test('…', async ({ page, loginAs }) => { await loginAs('owner'); … })
//        loginAs(role: 'owner' | 'operator' | 'viewer' | 'support', tenantSlug = 'ivoryglow') — uses seeded E02 users, caches storageState per role
//        expectNoA11yViolations(page) — axe, WCAG 2.1 AA tags, fails the test
```

Route-group skeleton (each is a `page.tsx` rendering `EmptyState` with the owning epic's name, replaced by that epic):
```
/                (dashboard → E12)      /products (E04)   /oems (E04)   /batches (E04)   /units (E07)   /scans (E12)
/anomalies (E07)  /reports (E08)        /analytics (E12)  /team (E11)   /audit (E13)     /billing (E15)
/settings (E11 layout; /settings/organization → E03, /settings/security → E11, /settings/api-keys → E16)
/support (platform role; /support/tenant-review → E03, rest → E18)
```

Domain events: none (frontend).

## Data model

None. (Reads E02/E03 models via HTTP.)

## Tasks

Design input: `docs/design/README.md` and `docs/design/foundations/foundations-v0.2-turquoise.dc.html` (open in a browser) are the specification for tokens, type, verdict family and usage rules. `docs/design/design-system-brief.md` lists the full component inventory and states to build. Follow them; where the canvas is silent, decide and record the decision in `docs/design/README.md`.

- [ ] T0a Import `docs/design/foundations/tokens-v0.2-turquoise.css` into `packages/ui` as Tailwind v4 `@theme` tokens under the `--vg-*` namespace; map verdict tokens to E06 `severity` per the table in `docs/design/README.md`; add a CI check that the `packages/ui` token values match the file in `docs/design/foundations/` (single source, no drift).
- [ ] T0b Storybook "Foundations" stories reproducing the canvas: type scale, neutrals, brand, verdict family with all four channels (notch, icon, band texture, label) — reviewed against the `.dc.html` side by side before any component work.
- [ ] T1 `packages/ui` scaffold: Tailwind preset, `tokens.css` with the IVORY GLOW palette + semantic verdict colours + dark-mode values, `applyTenantTheme`, shadcn/ui init (Radix-based) with components generated into the package, tsup build, Storybook 8 with a11y addon; Storybook served on `pnpm --filter @verifyng/ui storybook` (port 6006) and built in CI.
- [ ] T2 Primitives batch 1: Button, IconButton, Input, Textarea, Select, Checkbox, Switch, RadioGroup, Label, FormField/FormMessage, Badge, StatusChip, Skeleton, Kbd — each with a story and an axe test in Storybook test-runner.
- [ ] T3 Primitives batch 2: Table, DataTable (TanStack Table; column defs, sorting, cursor pagination, row actions menu, empty state slot, sticky header, mobile card fallback), Dialog, ConfirmDialog, Sheet, Toast + provider, Tabs, PageHeader, Breadcrumbs, EmptyState, ProgressBar, CodeBlock.
- [ ] T4 web-admin shell: root layout with providers (QueryClient, Toast, theme), `(console)/layout.tsx` with collapsible sidebar (drawer < 1024 px), topbar (tenant switcher, user menu, dark-mode toggle), breadcrumbs from route segments; `nav.config.ts` with all entries seeded and `section`/`order` rendering; role + platform-role filtering.
- [ ] T5 Auth plumbing: `lib/api-client.ts`, zustand auth store, `/api/auth/session` route handlers (login/refresh/logout proxy setting the httpOnly refresh cookie), `middleware.ts` redirecting to `/login?next=`, silent refresh on 401 with single-flight lock, logout on refresh failure, `useTenantPath`.
- [ ] T6 `(auth)` screens: `/login` (email + password, error states, "forgot?"), `/login/mfa` (6-digit TOTP with paste support + recovery-code toggle), `/forgot-password`, `/reset-password?token=`, `/set-password?token=` (invite); all built with the form conventions; brand mark + ivory background.
- [ ] T7 Tenant switcher + status banner: lists `memberships` from `/auth/me`, switch calls `/auth/switch-tenant` then resets the QueryClient; single-membership users see the tenant name only; banner for `pending|in_review` ("Your business is under review") and `suspended` ("Console is read-only") using `GET /tenants/:id` when available.
- [ ] T8 Route-group skeleton: every module page as `EmptyState` naming its epic and linking to `docs/epics/EXX`; `settings/layout.tsx` with sub-nav; `support/` layout gated on `platformRole=support` (404 otherwise); document the "replace the file, don't ask" rule in `docs/console.md`.
- [ ] T9 TanStack Query + forms conventions: `lib/query.ts` (client, keys factory, `usePagedQuery`), `lib/forms.ts` (`Form`, `setServerErrors`), one reference implementation each used by `team/` so other epics copy a working example.
- [ ] T10 `settings/security`: change password, MFA setup wizard (QR via `otpauthUri` → `qrcode.react`, code confirm, recovery codes download/copy), disable MFA, sessions list with "this device" + revoke / revoke-all — all over E02 routes.
- [ ] T11 `team/`: members DataTable (name, email, role, joined), invite dialog (email + role), change-role inline select, remove with ConfirmDialog, last-owner error surfaced from E02's 409; register nav `organization.team` (`minRole: 'viewer'`, actions hidden below owner).
- [ ] T12 Playwright: `playwright.config.ts` targeting `http://localhost:3001` (compose) with `webServer` off, `e2e/fixtures/index.ts` exporting `loginAs`, `expectNoA11yViolations`; specs: login happy/unhappy, MFA challenge, forgot→reset via Mailpit API (`http://localhost:8025/api/v1/messages`), tenant switch, role-aware nav (viewer sees no owner-only entries), every skeleton route renders without console errors and passes axe. Wire `pnpm --filter web-admin test:e2e` and `test:a11y` into CI (E21 owns the matrix; E11 adds the jobs).
- [ ] T13 `docs/console.md`: how to add a module (route group + nav entry + query keys + isolation via `useTenantPath`), theming, component catalogue link, fixture usage, a11y rules (labels, focus order, contrast ≥ 4.5:1, no colour-only verdicts — pair icon + text).

## Acceptance criteria

- [ ] AC1 `docker compose up` → `http://localhost:3001` redirects to `/login`; login as `owner@ivoryglow.local` / `Passw0rd!Passw0rd!` → dashboard `EmptyState` inside the shell; sidebar shows every module in the skeleton; DevTools → Application → Cookies shows `vg_refresh` as `HttpOnly; SameSite=Strict` and no refresh token in `localStorage`/`sessionStorage`.
- [ ] AC2 Silent refresh: with the access TTL overridden to 20 s (`JWT_ACCESS_TTL=20s` in `compose.dev.yml`), stay on `/team` for 60 s → the table refetches without a redirect and the Network tab shows one `POST /api/auth/session` refresh per expiry, never two in parallel.
- [ ] AC3 MFA screen: enable MFA in `/settings/security` (scan the QR with an authenticator or use `oathtool`), copy recovery codes, log out, log in → `/login/mfa` → TOTP accepted; a recovery code also works once; wrong code shows an inline error and keeps focus in the field.
- [ ] AC4 Password reset flow: `/forgot-password` → open `http://localhost:8025`, click the link → `/reset-password?token=…` → new password → redirected to login → old sessions gone (verified via `/settings/security` sessions list showing only the new device).
- [ ] AC5 Role-aware nav: `viewer@ivoryglow.local` sees no Team invite button, no owner-only nav entries (`minRole: 'owner'`), and visiting `/team` shows the table read-only; `support@verifyng.local` sees the "Platform" section with `/support` and no tenant-only sections until a tenant is selected.
- [ ] AC6 Tenant switcher: seed a second tenant with `owner@ivoryglow.local` as `operator` (`pnpm db:seed --second-tenant`) → switcher lists both; switching changes the tenant name in the topbar, re-issues tokens (`/auth/me` shows the new `activeTenantId`), and the `/team` table shows the other tenant's members; the previous tenant's queries are gone from the React Query devtools cache.
- [ ] AC7 Theme: `applyTenantTheme` with `primaryColor: '#1E3A8A'` (via the Storybook "Tenant theme" story and via a seeded `branding` on the second tenant once E03 ships) recolours buttons/links without any component code change; dark mode toggle persists in `localStorage` and passes contrast checks in the axe run.
- [ ] AC8 Accessibility gate: `pnpm --filter web-admin test:a11y` runs axe on `/login`, `/login/mfa`, `/`, `/team`, `/settings/security`, and every skeleton route — zero WCAG 2.1 AA violations; introducing an unlabelled input in a throwaway branch makes the job fail.
- [ ] AC9 Design system: `pnpm --filter @verifyng/ui storybook` serves every exported component with stories; `pnpm --filter @verifyng/ui test` runs Storybook test-runner with a11y on all stories; `pnpm --filter @verifyng/ui build` produces ESM + d.ts consumed by both `web-admin` and (later) `web-verify`.
- [ ] AC10 Another epic can add a module by (a) replacing `app/(console)/<module>/page.tsx`, (b) editing its single `nav.config.ts` entry, (c) using `useTenantPath` + `queryKeys` — with no other E11 file touched. Prove it on a throwaway branch with a fake "widgets" module that lists `/tenants/:tenantId/products`, then delete it.

## Testing

- Unit (Vitest + Testing Library): `apiClient` refresh/retry/single-flight logic against `msw`; nav filtering by role/platformRole; `applyTenantTheme`; `setServerErrors` mapping; `usePagedQuery` cursor handling.
- Component: Storybook test-runner with `@storybook/addon-a11y` on every story; interaction tests for Dialog focus trap, DataTable keyboard navigation, Toast dismissal.
- E2E (Playwright against compose): the flows in AC1–AC6 + axe sweep (AC8). `loginAs` caches `storageState` per role in `e2e/.auth/` to keep the suite fast.
- No DB tests (frontend only); relies on E02's seeded users.

## Compose services added

None. Optional dev-only `storybook` is run from `pnpm`, not compose.

## Notes and decisions

- **Refresh token in an httpOnly cookie via a Next route-handler proxy, access token in memory.** E02's API accepts the refresh token in the body; the browser must never hold it in JS-readable storage, so `/api/auth/session` on the Next server exchanges cookie ↔ body. Access tokens (15 min) stay in memory and are re-acquired on reload via one refresh call.
- shadcn/ui components are generated *into* `packages/ui` (owned source, not a dependency) so tenant theming is done in one place via CSS variables; Radix primitives provide the a11y baseline.
- The platform has its own identity (see `docs/design/`); IVORY GLOW is tenant #1's theme, shipped as the worked example of `applyTenantTheme` and as seed branding. `--vg-brand*` is what tenants override; verdict tokens are locked.
- Design source of truth is `docs/design/foundations/`. E11's first task is to import the chosen direction's tokens into `packages/ui` and delete the other.
- Verdict colours are semantic tokens shared with E09 so a consumer page and the console show the same green/amber/red/grey for the same verdict; never colour-only (icon + label always).
- `EmptyState` placeholders are deliberately owned by E11 only until the owning epic's first PR; that PR replaces the file, no coordination needed. Nav entries are seeded by E11 so the information architecture is fixed in wave 1 and other epics only edit their own entry.
- `team/` and `settings/security` are the exception to "E11 builds no business screens": they exercise every convention against real E02 routes and serve as the reference implementation other epics copy.
