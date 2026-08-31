# Product Pages (E10)

Every tier-1 QR scan can lead to a brand's own product page: a tenant builds
it in the console (`apps/web-admin`) from a fixed set of typed blocks,
publishes it, and it renders at `/p/<tenantSlug>/<productSlug>` in
`apps/web-verify` — and as a compact subset inside the tier-1 verdict view.

## Block reference

Blocks are a closed, typed set defined once in `packages/page-schema`
(zod schemas, `BlockType`, `defaultBlock`) and shared by the API (validation),
the builder (forms), and the renderer (typing) — the three can never drift.

| Block                    | Purpose                                              | Notes                                                                       |
| ------------------------ | ---------------------------------------------------- | --------------------------------------------------------------------------- |
| `hero`                   | Title, subtitle, stats, CTAs, hero image             | `variantImages` covers a product's visual variants                          |
| `rich-text`              | Freeform copy                                        | Sanitised markdown — the only freeform surface (see below)                  |
| `story`                  | Brand/product narrative                              | Kicker + heading + paragraphs + attribution                                 |
| `gallery`                | Photo grid with lightbox                             | Client island (T6)                                                          |
| `ingredients`            | Ingredient list with % and role                      |                                                                             |
| `how-to-use`             | Numbered ritual/usage steps                          | ≤ 6 steps                                                                   |
| `batch-info`             | **Auto.** Scanned unit's batch/OEM/commission date   | Standalone page: "scan your bottle" prompt. Tier-1: filled from the verdict |
| `verification-education` | **Auto.** How verification works + link to `/verify` | Cannot be removed from the tier-1 compact view                              |
| `faq`                    | Accordion                                            | Client island (T6)                                                          |
| `links`                  | External links (store/social/support/other)          |                                                                             |
| `registration`           | Regulatory "on the record" section                   | Items + cautions                                                            |
| `trademark`              | Registered marks                                     | Name, number, class, jurisdiction, optional image                           |

`batch-info` and `verification-education` are the differentiator: they pull
live data and can be reordered on the standalone page but never removed from
the tier-1 compact view (`ProductPageTier1Renderer`).

## Authoring guide

1. In `apps/web-admin`, create a page from a product (`/pages`, "Create").
2. Add blocks, drag to reorder, fill in the per-block form. Every image
   upload requires alt text.
3. The preview pane shows the draft live (debounced autosave).
4. Publish with a change note. The public page updates within seconds via
   on-demand revalidation (`PageRevalidator` → `POST /p/revalidate`), not the
   300s ISR fallback.
5. History (`/pages/:id/history`) lists every version; "Restore" creates a
   new version from an old one — versions are never rewritten.

## Theming

- `packages/ui` tokens (`packages/ui/src/tokens.css`) are the only source of
  colour/spacing/radius/font values — no ad-hoc values in block renderers.
- A tenant's base palette comes from E03's public profile
  (`GET /v1/tenants/:slug/public-profile`, still a documented E09 stub —
  falls back to IVORY GLOW defaults until E03 ships it).
- A page's `theme` (`ThemeOverride`) layers on top as CSS custom properties
  (`lib/product-page/theme.ts`'s `pageThemeStyle`) — never touches E03's data.

## Markdown sanitisation

`rich-text` is the only block that accepts freeform content. Both the
builder and the renderer call `sanitizeMarkdown` from `packages/page-schema`
(an allow-list of tags — `MARKDOWN_ALLOWED_TAGS` — with `script`/`iframe`/
`on*` handlers stripped and `rel="noopener"` forced onto every link), so
what's saved and what's shown can never disagree about what "safe" means.

## Custom-domain readiness

`Host` → tenant resolution (`resolve-tenant.ts`, T9) and web-verify's
middleware rewrite are built and tested against a stub
(`PAGE_DOMAIN_STUB`) so that when DNS/TLS exist for a tenant (a later, cloud
epic — out of scope here) nothing in this app needs to change. No DNS or TLS
is provisioned by this epic. `TenantDomain(tenantId, host, verifiedAt)` is a
model proposed to E03, not one E10 owns.

## Known platform limitation: HTTP 410

Next.js App Router pages (`page.tsx`) can only signal `notFound()` (404) or
a redirect — there is no supported way to return an arbitrary status like
410 from a page component (confirmed:
[vercel/next.js#86345](https://github.com/vercel/next.js/discussions/86345)).
The API's public routes (`GET /v1/public/pages/:tenantSlug/:productSlug`)
correctly return a real `410` for an unpublished page or an offboarded
tenant. `apps/web-verify/app/p/[tenantSlug]/[productSlug]/page.tsx` collapses
that to a 404 with the same themed "no longer available" message
(`not-found.tsx` in the same route segment). Getting the literal 410 onto
the browser response requires a middleware-level change (a change request to
E09, which owns `middleware.ts`) — not done in this epic.

## Known platform limitation: no real ISR yet

`/p/[tenantSlug]/[productSlug]/page.tsx` ships as a plain dynamic
(SSR-per-request) route, not the static/ISR page T6 specifies
(`generateStaticParams` + `revalidate = 300`). E09's root `layout.tsx` calls
`headers()` for locale detection, which forces every nested route dynamic;
a child route that still declares `generateStaticParams`/`revalidate` under
that root hard-errors with `DYNAMIC_SERVER_USAGE` instead of silently
downgrading (confirmed against a live `docker compose up` build — bisected
down to a page with zero dynamic calls of its own). See the change request
to E09 in `CROSS-EPIC-REQUESTS.md`. Until that lands, freshness comes from
the API's `Cache-Control: public, s-maxage=300, stale-while-revalidate=86400`
(T3) and T5's on-demand `revalidatePath`/`revalidateTag` call on publish/
rollback/unpublish — AC1's `x-nextjs-cache: HIT` check will not pass until
`/p/**` gets its own root layout outside the locale-detecting one.

The draft preview (used by the page-builder's live-preview iframe) lives on
its own route, `/p/[tenantSlug]/[productSlug]/preview/page.tsx`
(`force-dynamic`, reads `?token=`) — it was never a candidate for ISR (a
draft must never be cached), so it's unaffected by the above.
