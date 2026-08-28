# E10 — Product Pages & Page Builder

| | |
|---|---|
| Wave | 3 |
| Status | todo |
| Owner | — |
| GitHub Issue | [#11](https://github.com/enendufrankc/verifynNG/issues/11) |
| Depends on | E09 (web-verify app, `Tier1ProductSlot`, `TenantThemeProvider`, `registerTier1Renderer`), E04 (Product/Batch, product media), E11 (admin shell, tokens, `apiClient`, react-hook-form/zod conventions), E03 (tenant branding placeholders, public profile), E02 (`@TenantId()`, `@Roles()`), E13 (`@Audited`), E19 (`/legal/**` footer links reused), E12 (`POST /v1/events/page` beacon via E09) |
| Unblocks | E16 (public API may expose product pages later), E15 (page builder is a plan-gated feature — entitlement hook) |
| Readiness items | `architecture.md` step 12 (the northstar) · mental-model §4 tier-1 "product profile page", §6 "product pages (northstar, later)" · `production-readiness.md` §4 custom domain (routing readiness only) |

## Goal

Every tier-1 QR scan becomes the brand's storefront. A tenant builds a product page in the console from a fixed set of typed blocks (hero, story, gallery, ingredients, how-to-use, batch info, verification education, FAQ, links, rich text), previews it live, publishes it with version history and rollback, and it renders in web-verify at `/p/[tenantSlug]/[productSlug]` — statically generated, revalidated on publish, tenant-themed, SEO-complete — and inside the tier-1 verdict view that E09 exposes a slot for. The default IVORY GLOW page is rebuilt from `../lumina/ivory-glow-page/index.html` as block seed content so the first tenant's page ships with the platform. Verification is the hook; pages are the retention. Without this, tier-1 scans dead-end on a verdict card and the "Shopify of authenticity" is just a verifier.

## Scope

**In:** `ProductPage` + `ProductPageVersion` models, block schema (zod, shared package `packages/page-schema`), media upload to MinIO with image optimisation (sharp; webp/avif variants + blur placeholder), page builder UI in web-admin (block list with drag-order, per-block forms, live preview iframe, draft/publish, history, rollback), renderer in web-verify at `/p/**` (SSG/ISR + revalidate-on-publish), tier-1 slot renderer, theming via E11 tokens from tenant profile + per-page overrides, SEO (schema.org `Product`, OG/Twitter, canonical, sitemap per tenant), host-header → tenant routing readiness, IVORY GLOW seed page with its images, `product_page.published` event, Playwright + Lighthouse.

**Out (with owner):**
- Product master data (name, SKU, GTIN, variants) — E04. Pages reference `productId`; `batch-info` block reads E04's batch data at request time.
- Tenant branding *source of truth* (logo, palette, fonts) — E03; E10 reads the public profile and allows per-page overrides only.
- The verdict card, education steps copy, scan-history summary — E09. E10's `verification-education` block is a *page* section linking to `/verify`, not a replacement for E09's tier-1 verdict card.
- DNS, TLS, certificate issuance, actual custom-domain provisioning — out of scope entirely. E10 only makes routing resolve `Host` → tenant when a domain is configured; a `TenantDomain` model is **proposed to E03** (see change requests) — E10 does not add it.
- Commerce (cart, checkout, payments) — not in this product. Links block can point to external stores.
- Public API for pages — E16.
- Plan gating of the page builder — E15; E10 exposes `PagesEntitlementPort` with an always-true default.

## Owned paths

```
apps/api/src/modules/product-pages/**       ProductPage CRUD, versions, publish, media, revalidate webhook
packages/page-schema/**                     zod block schemas + TS types + defaults (shared by API, builder, renderer; pure, no I/O)
apps/web-admin/app/(console)/pages/**       builder route group
apps/web-admin/components/page-builder/**   block list, block forms, preview frame
apps/web-verify/app/p/**                    /p/[tenantSlug]/[productSlug], preview route, sitemap, revalidate route (carve-out inside E09's app)
apps/web-verify/components/product-page/**  block renderers (carve-out inside E09's app)
apps/web-verify/lib/product-page/**         tenant-host resolution, page fetcher
packages/db/prisma/schema.prisma            (additive block: "E10")
packages/db/prisma/migrations/E10_*
packages/db/seed/product-pages/**           IVORY GLOW seed page JSON + images
packages/config/src/env.ts                  (section comment "E10")
docs/product-pages.md
```

E10 does **not** edit E09's files except the single `registerTier1Renderer(ProductPageTier1Renderer)` call in the registration file E09 designates (`apps/web-verify/lib/slots.registry.ts`, one import + one line).

## Interfaces

**Consumes**

- E09 `Tier1ProductSlot` contract: `registerTier1Renderer((props: { tenantSlug, productId, batchId, verdict: 'ok' }) => ReactNode)`; `TenantThemeProvider`; `t()`; `sendPageBeacon()`; footer and legal links; E09's CSP allows MinIO image origin; E09 relaxes `X-Frame-Options` to `SAMEORIGIN`/frame-ancestors `web-admin` origin for `/p/**/preview` only (**change request on E09**).
- E04 `Product(id, tenantId, sku, name, gtin?)`, `Batch(id, productId, oemId?, createdAt, status)` and `Oem.country`; `product.updated { tenantId, productId }` event to revalidate pages when the name changes (**change request on E04** if not emitted); E04's `StorageService.putObject/presign` (or shared `packages/storage`) — E10 adds an image pipeline on top.
- E03 `GET /v1/tenants/:slug/public-profile` (palette, fonts, logo, trademark line, socials); `Tenant.status` — pages of `suspended` tenants keep rendering (consumer-facing must not break), pages of `offboarded` tenants return 410.
- E02 `@TenantId()`, `@Roles('owner','operator')` for write, `viewer` read.
- E11 `apiClient`, `nav.config.ts` entry "Pages", form conventions (react-hook-form + `zodResolver`), tokens, `EmptyState`, `loginAs`.
- E13 `@Audited('product_page.published' | 'product_page.rolled_back' | 'product_page.deleted')`.
- E12 beacon via E09 (`route: '/p'`).
- E15 `PagesEntitlementPort.canPublish(tenantId)` — default provider returns `true`.

**Exposes**

`packages/page-schema` (pure):
```ts
type BlockType = 'hero'|'rich-text'|'story'|'gallery'|'ingredients'|'how-to-use'|'batch-info'|'verification-education'|'faq'|'links'|'registration'|'trademark'
const blockSchemas: Record<BlockType, ZodSchema>      // strict, versioned via `schemaVersion: 1` on the page
const pageSchema  // { schemaVersion, theme: ThemeOverride, blocks: Block[], seo: Seo }
defaultBlock(type): Block
migratePage(page): Page                                // schemaVersion upgrades, pure
```
Block shapes (fields abbreviated):
- `hero { eyebrow?, title, subtitle?, stats?: [{ value, label }] ≤3, ctaPrimary?: { label, href|'#verify' }, ctaSecondary?, image: MediaRef, variantImages?: MediaRef[] }`
- `rich-text { md }` (sanitised markdown)
- `story { kicker?, heading, paragraphs: string[], attribution? }`
- `gallery { heading?, items: [{ media: MediaRef, caption? }] ≤ 12 }`
- `ingredients { heading?, items: [{ name, percent?, role, note? }] }`
- `how-to-use { heading?, steps: [{ title, body }] ≤ 6 }`
- `batch-info { heading?, showOem: boolean, showCommissionDate: boolean }` — **auto**: data from E04 by `batchId` when rendered inside a tier-1 verdict; renders a "scan your bottle" prompt on the standalone page
- `verification-education { heading?, body?, showManualEntryLink: boolean }` — **auto**: renders E09's education steps and a link to `/verify`
- `faq { items: [{ q, a }] }`
- `links { items: [{ label, href, kind: 'store'|'social'|'support'|'other' }] }`
- `registration { heading?, items: [{ label, value }], cautions?: string[] }` (regulatory/"on the record" section from the prototype)
- `trademark { heading?, marks: [{ name, number, class, jurisdiction, imageRef? }] }`
- `MediaRef = { assetId, alt, width, height, blurDataUrl?, variants: { webp: string[], avif?: string[] } }`
- `ThemeOverride = { palette?: Partial<{ primary, accent, bg, ink }>, fontDisplay?, fontBody? }`; `Seo = { title?, description?, ogImageAssetId?, noindex?: boolean }`

Nest providers: `ProductPageService` (`getPublished(tenantSlug, productSlug)`, `getForTier1(tenantId, productId)`, `saveDraft`, `publish`, `rollback`, `listVersions`), `PageMediaService` (`upload(tenantId, file) → MediaRef` with sharp pipeline), `PageRevalidator` (calls web-verify `POST /p/revalidate` with a signed body), `PagesEntitlementPort`.

HTTP routes:
- Tenant (`viewer` read, `operator`+ write): `GET /v1/product-pages`, `POST /v1/product-pages { productId, slug }`, `GET /v1/product-pages/:id` (draft + published pointers), `PUT /v1/product-pages/:id/draft { theme, blocks, seo }` (validated by `pageSchema`, autosave-friendly, returns `draftVersion`), `POST /v1/product-pages/:id/publish` (`@Audited`, entitlement check, emits event, triggers revalidate), `POST /v1/product-pages/:id/rollback { versionId }` (`@Audited`), `GET /v1/product-pages/:id/versions`, `DELETE /v1/product-pages/:id` (owner, unpublishes → 410 for consumers), `POST /v1/product-pages/:id/media` (multipart ≤ 10 MB, image/*), `GET /v1/product-pages/:id/preview-token` → short-lived signed token for the draft preview.
- Public (cached): `GET /v1/public/pages/:tenantSlug/:productSlug` → published version (`Cache-Control: public, s-maxage=300, stale-while-revalidate=86400`); `GET /v1/public/pages/:tenantSlug/:productSlug?preview=<token>` → draft (no-store); `GET /v1/public/pages/tier1/:tenantSlug/:productId` → published page for slot use; `GET /v1/public/pages/:tenantSlug/sitemap` → slugs + lastmod.
- web-verify internal: `POST /p/revalidate { tenantSlug, productSlug, sig }` (HMAC with `PAGE_REVALIDATE_SECRET`) → `revalidatePath`.

Domain events:
- `product_page.published { tenantId, productPageId, productId, versionId, tenantSlug, productSlug, publishedAt, publishedById }` — E14 (optional tenant notice), E12 (analytics dimension), E16 webhooks later.
- `product_page.unpublished { tenantId, productPageId, productId, at }`

Prisma models: below.

## Data model

```prisma
// ─── E10 Product Pages ──────────────────────────────────────────────────────
enum ProductPageStatus { draft published unpublished }

model ProductPage {
  id                 String            @id @default(cuid())
  tenantId           String
  productId          String            @unique              // one page per product (v1)
  slug               String                                 // URL segment; tenant-unique
  status             ProductPageStatus @default(draft)
  schemaVersion      Int               @default(1)
  draftTheme         Json                                   // ThemeOverride
  draftBlocks        Json                                   // Block[]
  draftSeo           Json                                   // Seo
  draftUpdatedAt     DateTime          @updatedAt
  publishedVersionId String?           @unique
  publishedAt        DateTime?
  createdById        String
  createdAt          DateTime          @default(now())
  tenant             Tenant            @relation(fields: [tenantId], references: [id])
  product            Product           @relation(fields: [productId], references: [id])
  versions           ProductPageVersion[]
  @@unique([tenantId, slug])
  @@index([tenantId, status])
}

model ProductPageVersion {          // immutable snapshot written on every publish
  id             String      @id @default(cuid())
  tenantId       String
  productPageId  String
  version        Int                                        // 1, 2, 3 … per page
  schemaVersion  Int
  theme          Json
  blocks         Json
  seo            Json
  changeNote     String?
  publishedById  String
  publishedAt    DateTime    @default(now())
  page           ProductPage @relation(fields: [productPageId], references: [id])
  @@unique([productPageId, version])
  @@index([tenantId, productPageId, publishedAt])
}

model PageMediaAsset {
  id            String   @id @default(cuid())
  tenantId      String
  productPageId String?
  objectKey     String                                      // pages/{tenantId}/{assetId}/original.<ext>
  mimeType      String
  width         Int
  height        Int
  bytes         Int
  blurDataUrl   String
  variants      Json                                        // { webp: { 480: key, 960: key, 1600: key }, avif: {...} }
  alt           String   @default("")
  createdById   String
  createdAt     DateTime @default(now())
  @@index([tenantId, productPageId])
}
```

`Product.slug` is not added by E10 — the page carries its own `slug` so tenants can rename URLs without touching catalog data. Version rows are never updated or deleted (E19 retention: keep with tenant; purged only on tenant offboarding).

## Tasks

- [ ] T1 `packages/page-schema`: zod schemas for every block above, `pageSchema`, `defaultBlock`, `migratePage`, JSON fixtures, 100 % coverage (pure package, no deps beyond zod). Markdown sanitiser allow-list defined here as data so renderer and builder agree.
- [ ] T2 `ProductPagesModule` + E10 schema block + migration `E10_product_pages`; `ProductPageService` draft/publish/rollback/versions with optimistic concurrency on drafts (`If-Match: draftUpdatedAt`); tenant slug uniqueness; `product_page.published` event; `@Audited` on publish/rollback/delete; `PagesEntitlementPort` default.
- [ ] T3 Public read routes with caching headers, tier-1 lookup by `productId`, preview token (HMAC, 15 min, `no-store`), sitemap route; 410 for unpublished/offboarded, 404 never distinguishes tenant existence beyond slug.
- [ ] T4 `PageMediaService`: multipart upload → validate (magic bytes, ≤ 10 MB, ≤ 6000 px) → sharp pipeline (strip EXIF/GPS, generate webp 480/960/1600 + avif 960/1600, 16 px blur placeholder) → MinIO under `pages/{tenantId}/…` with public-read on the `pages` bucket → `PageMediaAsset` + `MediaRef`. Per-tenant storage quota check via E13 `QuotaService` (soft, `pages.storageBytes`).
- [ ] T5 `PageRevalidator` + web-verify `POST /p/revalidate` (HMAC-signed, replay-protected with timestamp) calling `revalidatePath('/p/<tenant>/<slug>')` and `revalidateTag('tier1:<tenantId>:<productId>')`; subscriber to E04 `product.updated` and E03 profile changes (`tenant.branding.updated` — request to E03) to revalidate all pages of that tenant.
- [ ] T6 Renderer: `apps/web-verify/app/p/[tenantSlug]/[productSlug]/page.tsx` (`generateStaticParams` from sitemap route at build for seeded pages, `dynamicParams = true`, `revalidate = 300` as safety net on top of on-demand revalidation), block renderers in `components/product-page/blocks/*` (one file per block, server components; only `gallery` lightbox and `faq` accordion are client islands), `TenantThemeProvider` + `ThemeOverride` applied as CSS variables on the page root, `next/image` with the MinIO loader and blur placeholders, mobile-first layout matching the prototype's rhythm (topbar, hero with floating bottle + stats, marquee kicker, story, gallery, ingredients cards, ritual steps, authenticity section with QR zone, registration, trademark, footer).
- [ ] T7 Tier-1 slot renderer: `ProductPageTier1Renderer` registers via E09's `registerTier1Renderer`; renders a compact subset (hero without CTA → `batch-info` (auto, filled from the verdict's `batchId`) → `verification-education` (auto) → "See full product page" link → links block) inside E09's verdict view, cached with `revalidateTag('tier1:…')`; falls back to E09's default slot when no published page exists.
- [ ] T8 SEO: `generateMetadata` from `seo` + tenant profile (title template `"<Product> — <Tenant>"`, description, canonical `https://<host>/p/<tenant>/<slug>`, OG/Twitter image = `seo.ogImageAssetId` or hero image 1200×630 variant), JSON-LD `Product` (`name`, `brand.name`, `gtin13` when E04 has GTIN, `image[]`, `description`, `url`) + `BreadcrumbList`; `robots` follows `seo.noindex`; per-tenant `GET /p/[tenantSlug]/sitemap.xml`.
- [ ] T9 Host-header routing readiness: `apps/web-verify/lib/product-page/resolve-tenant.ts` reads `Host`; if it matches `PLATFORM_HOSTS` → path-based tenant; otherwise looks up `GET /v1/tenants/by-domain/:host` (**request to E03** for a `TenantDomain(tenantId, host, verifiedAt)` model and route; E10 stubs to "not found" until then) and rewrites `/<productSlug>` → `/p/<tenant>/<productSlug>` in E09's `middleware.ts` via an exported `productPageRewrite(req)` hook E09 calls (one line, change request). Compose demo: `ivoryglow.localhost:3000/turmeric-curcumin` resolves via a seeded domain row when E03 ships; documented, tested with a mocked lookup.
- [ ] T10 Web-admin builder `/(console)/pages`: list (product, slug, status, last published, "View" link), create from product; `/(console)/pages/[id]` editor: three-pane layout — block list with drag-order (`@dnd-kit`), add-block menu with type descriptions, per-block form (react-hook-form + the shared zod schema, image picker uploading via T4 with alt-text required), right pane live preview `<iframe src="http://localhost:3000/p/<tenant>/<slug>?preview=<token>">` refreshed with `postMessage` after autosave (debounced `PUT …/draft`), viewport toggle mobile/desktop, theme override panel (palette pickers, font selects limited to the E11 font set), SEO panel with OG preview card.
- [ ] T11 Publish flow and history: "Publish" button (operator+; disabled with reason when `PagesEntitlementPort` says no or validation fails, showing per-block error badges), change note, confirmation showing the public URL; `/(console)/pages/[id]/history` lists versions with diff summary (blocks added/removed/changed by type) and "Restore this version" → `rollback` (creates a new version, never rewrites history); unpublish (owner) with 410 consequence explained.
- [ ] T12 IVORY GLOW seed: transcribe `../lumina/ivory-glow-page/index.html` into `packages/db/seed/product-pages/ivoryglow-turmeric-curcumin.json` — hero ("Turmeric & Curcumin" shower gel, eyebrow, stats, variant images `turmeric-front/back`), story, gallery (`model-2/5/8`), ingredients with percentages, ritual (Lather/Breathe/Rinse), verification-education, batch-info, registration (regulatory + cautions as printed), trademark (NG/TM/O/2020/11950, class 3, letter image), links; copy the `.webp` images into `packages/db/seed/product-pages/assets/` and have `pnpm db:seed` upload them through T4's pipeline and publish version 1; also seed draft-only pages for the Vitamin C and Retinol variants using `vitc-*`/`retinol-*` images so the builder has a realistic list. Theme override matches the prototype palette (`#C08A2D` gold, `#F8F3EA` ivory, `#231C10` ink, Cormorant Garamond / Manrope).
- [ ] T13 Quality: Lighthouse CI for `/p/ivoryglow/turmeric-curcumin` (mobile perf ≥ 90, a11y ≥ 95, SEO ≥ 95), Rich Results validity of the JSON-LD checked with `schema-dts` typing + a structured-data unit test, image weight budget ≤ 600 kB above the fold on mobile.
- [ ] T14 Playwright: builder flow (create → add blocks → upload image → autosave → preview updates → publish → public page shows content); rollback flow; viewer cannot edit; cross-tenant 403 on another tenant's page id; tier-1 verdict page shows the compact product page for `fixtures.tier1Ok` and the E09 default for a product without a page; `docs/product-pages.md` (block reference, authoring guide, theming rules, custom-domain readiness notes).

## Acceptance criteria

- [ ] AC1 `docker compose up && pnpm db:seed` → `http://localhost:3000/p/ivoryglow/turmeric-curcumin` renders the IVORY GLOW page (hero with bottle image and stats, story, gallery, ingredients with percentages, ritual steps, authenticity section linking to `/verify`, registration, trademark NG/TM/O/2020/11950, footer) in the gold/ivory theme; `curl -s localhost:3000/p/ivoryglow/turmeric-curcumin | grep -c '"@type":"Product"'` → `1`; response header `x-nextjs-cache: HIT` on the second request.
- [ ] AC2 Open `http://localhost:3000/v/<fixtures.tier1Ok>` (a unit of the Turmeric product) → E09's green tier-1 card followed by the compact product page: hero, batch-info populated with the scanned unit's batch id / commissioned month / OEM country, education steps, "See full product page" → `/p/ivoryglow/turmeric-curcumin`. For a tier-1 code of a product with no published page (seeded Retinol draft) the E09 default slot renders instead.
- [ ] AC3 Log in to `http://localhost:3001` as `operator@ivoryglow.test`, open `/pages/<vitamin-c page id>`: drag the `ingredients` block above `story`, edit the hero title to "Vitamin C & Kojic", upload `vitc-front.webp` with alt text → the preview iframe updates within 2 s without a manual reload; `PUT …/draft` requests visible in DevTools are debounced (≤ 1 per 800 ms of typing).
- [ ] AC4 Click "Publish" with change note "first publish" → success toast shows `http://localhost:3000/p/ivoryglow/vitamin-c-kojic`; opening it shows the new content within 5 s (on-demand revalidate, not the 300 s fallback); `select version from "ProductPageVersion" where "productPageId"=…` → `1`; `AuditLog` has `product_page.published`; api logs show `product_page.published` event.
- [ ] AC5 Change the hero title again, publish (version 2), then in `/pages/<id>/history` click "Restore" on version 1 → public page shows the version-1 title within 5 s, history shows version 3 with note "Rolled back to v1", `AuditLog` has `product_page.rolled_back`; versions 1 and 2 rows are byte-identical to before (`md5(blocks::text)` unchanged).
- [ ] AC6 `curl -F file=@e2e/fixtures/photo-with-gps.jpg -H "Authorization: Bearer <operator>" localhost:4000/v1/product-pages/<id>/media` → returns a `MediaRef` with webp variants 480/960/1600 and a `blurDataUrl`; `mc cat local/pages/<tenant>/<asset>/960.webp | exiftool -` shows no GPS/EXIF; a 12 MB upload → 413; a `.svg` upload → 415.
- [ ] AC7 As `viewer@ivoryglow.test` the editor is read-only and `PUT …/draft` → 403; as `owner@acme.test` (second seed tenant) `GET /v1/product-pages/<ivoryglow page id>` → 403 (not 404 leaking existence is acceptable — E13 isolation test asserts no cross-tenant read); `curl localhost:3000/p/ivoryglow/turmeric-curcumin?preview=<token from GET …/preview-token>` shows unpublished draft changes with `Cache-Control: no-store`; the same URL with a tampered token → 404.
- [ ] AC8 Unpublish (owner) → `http://localhost:3000/p/ivoryglow/vitamin-c-kojic` returns HTTP 410 with a themed "This page is no longer available — verify your product at /verify" body; tier-1 verdicts for that product fall back to E09's default slot; set tenant `acme` to `offboarded` → all acme pages 410.
- [ ] AC9 `pnpm --filter web-verify lighthouse -- --url=/p/ivoryglow/turmeric-curcumin` → mobile performance ≥ 90, accessibility ≥ 95, SEO ≥ 95; `pnpm test:e2e --grep product-pages` green; `curl -H 'Host: ivoryglow.localhost:3000' localhost:3000/turmeric-curcumin` with the domain lookup stub configured (`PAGE_DOMAIN_STUB=ivoryglow.localhost:ivoryglow` in compose) renders the same page as `/p/ivoryglow/turmeric-curcumin` (routing readiness; no DNS involved).

## Testing

- **Unit (`packages/page-schema`, 100 %):** every block schema accepts its default and rejects malformed input (extra keys stripped/rejected in strict mode), `migratePage` idempotency, markdown sanitiser allow-list (script/iframe/on* removed, links get `rel="noopener"`), JSON-LD builder produces valid `Product` per `schema-dts`, slug normalisation, HMAC preview/revalidate token verify incl. expiry and replay.
- **Integration (real Postgres + MinIO):** draft optimistic concurrency (stale `If-Match` → 409), publish creates immutable version and pointer, rollback appends, delete → 410 semantics, media pipeline outputs and EXIF stripping, tenant isolation on every route, entitlement port denial, revalidator signature and web-verify handler.
- **Component:** each block renderer snapshot at mobile and desktop widths against the seed JSON; theme override CSS variables applied; tier-1 compact renderer with and without batch data.
- **E2E (Playwright):** T14 flows; preview iframe update; drag-order persisted; axe on public page, builder, and history.
- **Perf:** Lighthouse CI and image budget on the seed page as required checks.

## Compose services added

None. Uses `minio` (new public-read bucket `pages` added to the `mc` init step), `api`, `web-verify`, `web-admin`. Adds env `PAGE_REVALIDATE_SECRET`, `PAGES_PUBLIC_BASE_URL=http://localhost:3000`, `PLATFORM_HOSTS=localhost:3000`, `PAGE_DOMAIN_STUB` (compose-only), `PAGES_MEDIA_BUCKET=pages`, `PAGES_MAX_UPLOAD_MB=10`.

## Notes and decisions

- **Blocks are a closed, typed set — not a freeform page builder.** Tenants compose from schemas we render; this is what keeps pages fast, accessible, themed and safe (no arbitrary HTML). New block types are a schema PR with a renderer and a form. `rich-text` is sanitised markdown, the only freeform surface.
- **Two auto blocks are the product's differentiator.** `batch-info` and `verification-education` pull live data and E09's education content; they are what makes a product page an *authenticity* page rather than a brochure. They cannot be removed from the tier-1 compact view; they can be reordered on the standalone page.
- **One page per product in v1.** Variants (Turmeric / Vitamin C / Retinol) are separate E04 products with separate pages; `hero.variantImages` covers the prototype's variant switcher visually. Multi-page per product (campaign pages) is a later schema version.
- **SSG/ISR with on-demand revalidation**, `revalidate = 300` only as a safety net. Publish must be visible within seconds (AC4) — tenants will hit refresh.
- **Schema sharing via `packages/page-schema`** means builder validation, API validation and renderer typing cannot drift. The package is pure so E01's hot-spot rule for `packages/core` isn't needed; it has its own owner (E10).
- **Custom domains: routing yes, infrastructure no.** `Host` → tenant resolution and the middleware rewrite are built and tested against a stub so that when DNS/TLS exist (cloud epic, out of scope) nothing in the app changes. The `TenantDomain` model belongs to E03 (tenant identity), proposed there.
- **Suspended tenants keep their pages live** (readiness §8 restricted mode: consumer surface never breaks for a billing lapse); only `offboarded` → 410.
- **IVORY GLOW seed is real content**, transcribed from the prototype with its imagery and trademark details, so the first tenant's page is the acceptance fixture and the design reference in one.
- Change requests raised: E09 — designate `lib/slots.registry.ts` for the one-line registration, allow `frame-ancestors` for web-admin on `/p/**?preview=`, call `productPageRewrite(req)` from `middleware.ts`, add MinIO `pages` bucket origin to CSP `img-src`; E03 — `TenantDomain(tenantId, host, verifiedAt)` + `GET /v1/tenants/by-domain/:host`, `tenant.branding.updated` event; E04 — `product.updated` event; E13 — `pages.storageBytes` quota key in `QuotaService`; E15 — implement `PagesEntitlementPort` when plans land.
