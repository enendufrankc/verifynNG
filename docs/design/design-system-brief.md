# Design brief: verifynNG design system

Instruction for Claude Design (or any designer). Output feeds epic E11 (Admin Console Shell & Design System) and is consumed by E09 (Consumer Verify Web), E10 (Product Pages), E18 (Docs site) and the printable QR sheets in E04.

---

## The ask

Design a complete, token-based design system for **verifynNG**, a multi-tenant product-authenticity platform. It must serve three very different surfaces from one set of tokens and components, and it must be **tenant-themeable**: the platform has its own neutral identity, and each brand that onboards (first tenant: IVORY GLOW, a Nigerian skincare line) can re-skin the consumer-facing surfaces with their palette, logo and type without breaking anything.

Deliver it as: (1) a token spec, (2) component specs with all states, (3) key screen compositions for each surface, (4) a theming model with two worked themes (platform default + IVORY GLOW).

## What the product does (context you need)

Brands mint cryptographically secure codes and print two QR codes on each product: a **public** one on the outside (anyone can scan it, unlimited times, it says "this is a genuine product line") and a **hidden scratch-off** one inside the pack (scanning it gives a verdict about *that specific unit* based on its scan history). Consumers scan with their phone camera in a shop, at home, or in a market stall in Lagos on a mid-range Android over patchy 3G. Brand staff run a console to mint batches, ship code manifests to factories, watch scan analytics, investigate anomalies and consumer fake-reports, and manage team, billing and settings.

Trust is the product. The design must read as authoritative, calm and honest — never alarmist, never gimmicky. A red result must feel serious without feeling like a scam page; a green result must feel earned, not decorative.

## Three surfaces

### 1. Consumer verify web (`web-verify`) — mobile-first, public, tenant-themed
- Landing after a QR scan. One job: show the verdict clearly in under 2 seconds of reading.
- Verdict states, each needing a distinct visual identity (colour, icon, tone) that works for colour-blind users and in bright sunlight:
  - **Tier 1 · genuine product line** (informational green/neutral — "this is a real product line; find the hidden code for full verification")
  - **Tier 2 · authentic, first verification** (strong green — "you are the first to verify this unit")
  - **Tier 2 · already verified** (calm neutral/teal — honest history: first verified date, count; normal for resale)
  - **Tier 2 · suspicious** (amber — verified many times across regions; treat with caution)
  - **Tier 2 · flagged by brand** (red — brand flagged after investigation)
  - **Decommissioned / recalled** (grey-red — withdrawn)
  - **Unknown / not in registry** (red — likely counterfeit, report it)
  - **Invalid format**, **rate-limited**, **network error** (grey/neutral utility states)
- Secondary content: product name + image, batch info, manufacturer, scan-history summary (dates, count, country/city list — no maps with pins), "how to find the hidden code" education, **Report this product** CTA (photo upload, seller details), legal footer.
- Manual code entry (large, forgiving input for human-typed codes with dashes), camera scanner view.
- Product pages (`/p/[brand]/[product]`) built from blocks: hero, ingredients, how-to-use, gallery, batch info, verification education, FAQ, links. Tenant-themed. Think premium DTC product page.
- Constraints: 360px-wide baseline, thumb-reachable primary actions, works with system font fallback, no layout shift while the verdict loads (skeleton), Lighthouse a11y ≥ 95, WCAG 2.2 AA contrast on all verdict colours including on tenant-themed backgrounds.

### 2. Tenant console (`web-admin`) — desktop-first, dense, platform-branded (subtle tenant accent only)
- Sidebar navigation with these modules: Dashboard, Products, OEMs (manufacturers), Batches, Units, Scans, Anomalies, Reports, Analytics, Product Pages, Team, Audit log, Billing, Settings, Help. Plus a separate **platform-support** area (tenant directory, verification review queue, tickets, impersonation banner) and an **OEM portal** view (a factory user sees only their assigned batches, downloads manifests, uploads receipt).
- Data-heavy patterns needed: sortable/filterable data tables with bulk actions, detail pages with tabbed sections, timelines (scan history, audit trail, batch lifecycle), status pills for many enums (batch: minted → delivered → printed → shipped → closed; unit: active/flagged/decommissioned; anomaly: open/acknowledged/resolved/dismissed; report: new/triaged/investigating/closed; subscription: trialing/active/past-due/restricted), KPI stat tiles, charts (time series, distribution, geo table), long-running job progress (minting 100k codes), wizards (mint batch, onboard tenant with document upload), forms with inline validation, confirmation dialogs for destructive actions (decommission all units in a batch → recall), empty states for every module, toasts, command palette (optional).
- Auth screens: login, MFA challenge, recovery codes, reset, SSO button variants, tenant switcher.
- Impersonation banner (support viewing as a tenant) — must be impossible to miss.

### 3. Print & docs
- **QR application sheet**: A4/Letter print layout, per-unit card with two QR codes (public / hidden), unit id, batch header; must survive black-and-white printing; scratch-off area marked.
- **Docs site** (`apps/docs`): readable long-form documentation theme derived from the same tokens.
- **Email templates**: transactional emails (welcome, batch minted, anomaly alert, invoice) — tenant-brandable header/footer.

## Brand inputs

**Platform (verifynNG) identity** — to be created by you. Direction: trustworthy infrastructure, quietly confident, modern African-tech rather than Silicon-Valley-generic. Avoid the shield/padlock/checkmark clichés as the primary mark; a mark referencing the two-code idea or the "reveal" of a scratch-off is welcome. Neutral palette with one decisive accent. Must sit comfortably next to any tenant brand.

**Tenant #1 — IVORY GLOW** (Tunnel Light Global Concept Ltd, Nigeria; premium body-care: turmeric, retinol, vitamin C shower gels in 1000ml bottles). Existing palette from their prototypes: ivory `#F5F1E8`, dark cocoa text `#231C10`, gold `#E3A93C`, deep gold `#9A6A18`, muted brown `#5C5140`. Existing type pairing: Playfair Display (display) + Inter (text). Use this as the worked example of a tenant theme applied to the consumer surface and product page.

## Token spec required

- **Color**: primitive scales (neutral + 1 platform accent + the semantic verdict family: success, info/neutral-history, warning, danger, muted) → semantic aliases (`bg.canvas`, `bg.surface`, `fg.default`, `fg.muted`, `border.subtle`, `verdict.authentic.bg/fg/border`, …). Light and dark modes for the console; consumer surface light-only by default but token-ready for dark. Tenant theme overrides only a whitelisted set (`brand.primary`, `brand.secondary`, `brand.surface`, `brand.fg`, `brand.font.display`, `brand.font.text`, `brand.radius`, `brand.logo`) — verdict colours are **never** tenant-overridable (trust semantics stay constant across brands). Document the contrast-guard rule: if a tenant primary fails AA against its surface, fall back to platform defaults.
- **Typography**: type scale (fluid, 12→48), weights, line-heights, letter-spacing for uppercase labels; console uses a single sans; consumer allows tenant display font.
- **Spacing** (4px base), **radius** scale (with tenant-overridable brand radius), **elevation/shadows**, **z-index** layers, **motion** (durations/easings; a specific "verdict reveal" animation spec — subtle, ≤ 400ms, respects reduced-motion), **breakpoints**, **iconography** (choose a library — Lucide preferred — plus the custom verdict icons), **focus ring** spec.
- Output tokens as W3C Design Tokens JSON **and** as CSS custom properties ready for Tailwind v4 `@theme`. Name things so `packages/ui` (shadcn/ui-based, Tailwind) can adopt them directly.

## Component inventory (spec every state: default, hover, focus-visible, active, disabled, loading, error, selected; plus RTL-safe and dark-mode)

Primitives: Button (primary/secondary/ghost/destructive/link, sizes, icon-only), IconButton, Input, Textarea, Select, Combobox, Checkbox, Radio, Switch, Slider, DatePicker, FileDropzone (with image previews, EXIF-stripped notice), CodeInput (segmented/forgiving code entry), Badge/StatusPill (all enums above), Tag, Avatar, Tooltip, Popover, Dialog/AlertDialog, Sheet/Drawer, Toast, Tabs, Accordion, Breadcrumbs, Pagination, Skeleton, Progress (linear + job progress with count), Spinner, EmptyState (illustration slot + title + body + CTA), Card, Stat tile, Table/DataTable (density toggle, sticky header, row selection, bulk bar, column filters, inline status), Timeline, KeyValue list, Callout/Alert (info/success/warning/danger), Banner (impersonation, restricted-mode, trial), Command palette, Sidebar nav + collapsed state, Topbar with tenant switcher, Stepper/Wizard, Chart wrappers (line/bar/donut) with the token palette and colour-blind-safe series.

Consumer-specific: VerdictCard (one per state), ScanHistorySummary, ProductHero, HiddenCodeEducation (illustrated), ReportForm, ScannerView (camera frame + torch + manual fallback), LegalFooter, Product-page blocks (hero, ingredients, how-to-use, gallery, batch-info, verification-education, FAQ, links, rich-text).

Print: QRSheetCard, QRSheetHeader.

## Key screens to compose (high fidelity)

1. Consumer: verdict screens for **every** verdict state on a 360×800 frame, both in platform-default and IVORY GLOW theme.
2. Consumer: manual entry, scanner, report flow (3 steps), product page (IVORY GLOW Turmeric shower gel).
3. Console: dashboard, batches list + batch detail with mint progress, unit detail with scan timeline and flag/decommission actions, anomalies queue + detail, reports queue + detail, analytics, team & roles, audit log with chain-integrity badge, billing (plan/usage/invoices), settings → branding (the tenant theme editor with live preview), login + MFA.
4. Support area: tenant directory, verification review queue with document viewer, active-impersonation state.
5. OEM portal: assigned batches, manifest download, receipt upload.
6. Print: QR application sheet page.
7. Email: one transactional template in platform + IVORY GLOW branding.

## Principles to design against

- **Verdict first, everything else second.** On the consumer surface the verdict must be legible at arm's length before any other element registers.
- **Honest, not binary.** "Already verified 3 times" is normal for resale; the design must let it read as neutral history, not as a warning.
- **Never show the full code.** Codes are always rendered redacted (`ivoryglow.2.k1.ABCD…`); design for that shape.
- **Constant trust semantics.** Verdict colours/icons identical across all tenants; only brand chrome changes.
- **Low-end first.** Assume slow network, small screen, bright light, system fonts until web fonts arrive.
- **Dense but calm console.** Operators live in tables; favour density toggles and keyboard affordances over whitespace.
- **Accessible by default.** AA contrast everywhere, visible focus, 44px touch targets on consumer, reduced-motion respected, all status conveyed by more than colour.

## Deliverable format

- Token files (JSON + CSS) and a short "how to consume in Tailwind/shadcn" note.
- Component specs: anatomy, props/variants, states, do/don't, a11y notes.
- Screen compositions as artboards, exportable to PNG/PDF.
- Theming guide: what a tenant can change, the contrast-guard rule, the IVORY GLOW theme as a worked JSON example.
- A one-page "design principles" summary for engineers.

Anything not specified: decide, and state the decision in a "decisions" section rather than asking.
