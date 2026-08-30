# E12 — Analytics & Usage Metering

| | |
|---|---|
| Wave | 2 |
| Status | in-progress |
| Owner | enendufrankc |
| GitHub Issue | [#13](https://github.com/enendufrankc/verifynNG/issues/13) |
| Depends on | E06 (ScanEvent, `scan.recorded`), E04 (Product/Batch, `batch.minted`), E11 (admin shell, tokens, `apiClient`, analytics EmptyState route group), E02 (`@TenantId()`, `@Roles()`), E00 (BullMQ, Redis) |
| Unblocks | E15 Billing (consumes `UsageSummary` and `GET /v1/tenants/:id/usage`), E18 Support (tenant volume view), E17 (per-tenant volume metric source) |
| Readiness items | `production-readiness.md` §7 "usage metering separated from pricing" · §5 "per-tenant volume" (metric feed) · `architecture.md` step 8 (scan event store → analytics dashboard) |

## Goal

Two things that look similar and must never be confused. **Analytics** turns the append-only `ScanEvent` stream into materialised daily rollups and a tenant dashboard that answers "which batch is being hit hardest this week, from where, with what verdicts" — without the UI ever scanning raw events. **Metering** writes a raw, immutable `UsageEvent` for every billable-shaped thing that happens (a code minted, a tier-1 scan, a tier-2 verify, an API call, a notification sent), rolls it into a monthly `UsageSummary`, and exposes it to E15 — priced nowhere in this epic. Analytics is for the tenant; metering is for the invoice; both come from the same events and neither may mutate them.

## Scope

**In:** BullMQ rollup jobs (hourly incremental + nightly reconcile), `ScanRollupDaily`, analytics read API, web-admin analytics dashboard (overview KPIs, per-batch, per-product, geo, verdict-over-time, CSV export), charting lib choice and `packages/ui/charts` wrappers, `UsageEvent` writers subscribed to upstream events, `UsageSummary` monthly rollup, `GET /v1/tenants/:id/usage`, `usage.recorded` event, `MeterPort` for other epics to record usage, retention hooks for E19.

**Out (with owner):**
- Pricing, plans, invoices, entitlement enforcement — E15. E12 hands over quantities only.
- Anomaly scoring and unit flagging — E07. E12 charts `flagged` counts from E07's events; it computes nothing about them.
- ScanEvent writes and verdict semantics — E06.
- Page-view beacon endpoint `POST /v1/events/page` — **E12 owns it** (E09 fires it); page views are analytics only, never metered.
- Retention *policy* for raw `ScanEvent`, `UsageEvent` and rollups — E19 defines and executes; E12 documents which tables and what the rollups need retained.
- Platform-wide (cross-tenant) analytics for support — E18 builds on E12's read models.
- Public API exposure of analytics — E16.

## Owned paths

```
apps/api/src/modules/analytics/**           rollup jobs, read API, page-event ingest
apps/api/src/modules/metering/**            UsageEvent writers, MeterPort, usage API
apps/web-admin/app/(console)/analytics/**   dashboard route group (replaces E11 EmptyState)
packages/ui/src/charts/**                   recharts wrappers bound to design tokens
packages/db/prisma/schema.prisma            (additive block: "E12")
packages/db/prisma/migrations/E12_*         
packages/config/src/env.ts                  (section comment "E12")
docs/analytics-and-metering.md
```

## Interfaces

**Consumes**

- E06 `ScanEvent(tenantId, unitId?, tier, verdict, ip (hashed), geoCountry?, geoCity?, userAgent?, createdAt)` — read by rollup jobs via Prisma, keyed on `(tenantId, createdAt)`. Event `scan.recorded { tenantId, scanEventId, unitId?, batchId?, productId?, tier, verdict, geoCountry?, geoCity?, occurredAt }` — **change request on E06**: include `batchId` and `productId` in the payload so the metering writer and the incremental rollup don't join back to Unit per event.
- E06 `scan.enumeration_detected { tenantId, ipHash, count, windowStart }` — counted into rollup `rateLimitHits`.
- E04 `batch.minted { tenantId, batchId, productId, count, occurredAt }` → `UsageEvent(kind: code.minted, quantity: count)`.
- E07 `unit.flagged { tenantId, unitId, batchId, reason }` → increments `flaggedUnits` in the daily rollup.
- E14 `notification.sent { tenantId, channel, templateKey, occurredAt }` → `UsageEvent(kind: notification.sent)`.
- E16 (later) `api.call { tenantId, apiKeyId, route }` → `UsageEvent(kind: api.call)`; E12 ships the subscriber now, dormant until E16 emits.
- E02 `@TenantId()`, `@Roles('owner','operator','viewer')`, platform `support` role for cross-tenant read.
- E11 `apiClient`, `nav.config.ts` (one entry: Analytics), `EmptyState`, design tokens, Playwright `loginAs(role)`.
- E13 `@Audited` on CSV export (exports are data leaving the tenant boundary).
- E00 BullMQ connection (`QUEUE_REDIS_URL`), `createTestDatabase()`.

**Exposes**

Nest providers:
- `MeterPort` (`apps/api/src/modules/metering/meter.port.ts`): `record(input: { tenantId, kind: UsageKind, quantity: number, occurredAt?: Date, ref?: string, idempotencyKey?: string }): Promise<void>` — the only sanctioned way for another module to meter usage. Idempotent on `(tenantId, kind, idempotencyKey)`.
- `AnalyticsReadService`: `overview(tenantId, range)`, `byBatch(tenantId, range)`, `byProduct(tenantId, range)`, `geo(tenantId, range, groupBy: 'country'|'city')`, `verdictSeries(tenantId, range, bucket: 'day')` — read rollups only.
- `UsageReadService.summary(tenantId, month)` and `.raw(tenantId, from, to, cursor)` — E15 and E18 consume.

HTTP routes (all tenant-scoped via `@TenantId()`, `viewer`+ unless stated):
- `GET /v1/analytics/overview?range=7d|30d|90d` → `{ scans, tier1Scans, tier2Verifies, suspiciousPct, flaggedUnits, distinctCountries, deltas vs prior range }`
- `GET /v1/analytics/batches?range=&sort=` → per-batch rows `{ batchId, productId, scans, tier2Verifies, suspicious, flagged, topCountry }`
- `GET /v1/analytics/products?range=`
- `GET /v1/analytics/geo?range=&groupBy=country|city` → `[{ country, city?, scans, tier2Verifies, suspicious }]`
- `GET /v1/analytics/verdicts?range=&bucket=day` → `[{ date, verdict, count }]`
- `GET /v1/analytics/export.csv?range=&dimension=batch|product|geo|verdict` (`operator`+, `@Audited('analytics.export')`, streamed)
- `GET /v1/tenants/:id/usage?month=YYYY-MM` (`owner` for own tenant, `support` for any) → `{ month, kinds: { 'code.minted': n, 'scan.tier1': n, 'scan.tier2': n, 'api.call': n, 'notification.sent': n }, finalisedAt? }`
- `GET /v1/tenants/:id/usage/events?from=&to=&cursor=` (`support` only — raw audit of meter)
- `POST /v1/events/page` (public, no auth, rate-limited by E06's limiter, body `{ tenantSlug, route, verdict?, tier?, locale, referrerType }`) → 204; batched into `PageViewRollupDaily`.
- `POST /v1/analytics/rollups/rebuild` (`support` only) → enqueues a full rebuild for a tenant/date range.

Domain events:
- `usage.recorded { tenantId, usageEventId, kind, quantity, occurredAt, ref? }` — emitted after every `UsageEvent` insert. E15 subscribes for real-time quota headroom; E13 `QuotaService` may subscribe.
- `usage.summary.finalised { tenantId, month, kinds }` — emitted when the monthly rollup closes (day 1, 02:00 UTC, for the previous month). E15's invoicing trigger.
- `analytics.rollup.completed { tenantId?, date, rowsWritten, durationMs }` — for E17 dashboards.

Prisma models: below.

## Data model

```prisma
// ─── E12 Analytics & Metering ───────────────────────────────────────────────
enum UsageKind { code_minted scan_tier1 scan_tier2 api_call notification_sent }  // serialised as dotted names in the API

model UsageEvent {              // RAW, IMMUTABLE. No updates, no deletes except E19 retention purge.
  id             String    @id @default(cuid())
  tenantId       String
  kind           UsageKind
  quantity       Int                                   // ≥ 1
  occurredAt     DateTime
  recordedAt     DateTime  @default(now())
  ref            String?                               // batchId / scanEventId / notificationId / apiKeyId
  idempotencyKey String?
  tenant         Tenant    @relation(fields: [tenantId], references: [id])
  @@unique([tenantId, kind, idempotencyKey])
  @@index([tenantId, occurredAt])
  @@index([tenantId, kind, occurredAt])
}

model UsageSummary {            // one row per tenant × month × kind; rebuilt idempotently from UsageEvent
  id           String    @id @default(cuid())
  tenantId     String
  month        String                                  // "YYYY-MM"
  kind         UsageKind
  quantity     Int
  eventCount   Int
  finalisedAt  DateTime?                               // set by the month-close job; E15 bills only finalised rows
  updatedAt    DateTime  @updatedAt
  @@unique([tenantId, month, kind])
  @@index([tenantId, month])
}

model ScanRollupDaily {         // materialised from ScanEvent; the ONLY thing the dashboard reads
  id               String   @id @default(cuid())
  tenantId         String
  date             DateTime @db.Date
  productId        String?
  batchId          String?
  tier             Int
  verdict          String                              // E06 verdict string
  count            Int
  distinctIpCount  Int                                 // count(distinct ipHash) within the day/key
  topCountries     Json                                // [{ country, city?, count }] top 10
  rateLimitHits    Int      @default(0)
  flaggedUnits     Int      @default(0)                // from unit.flagged that day, only on rows with verdict = 'flagged'
  computedAt       DateTime @default(now())
  @@unique([tenantId, date, productId, batchId, tier, verdict])
  @@index([tenantId, date])
  @@index([tenantId, batchId, date])
  @@index([tenantId, productId, date])
}

model PageViewRollupDaily {     // from POST /v1/events/page; analytics only, never metered
  id           String   @id @default(cuid())
  tenantId     String
  date         DateTime @db.Date
  route        String                                  // '/v', '/verify', '/p'
  referrerType String                                  // qr|manual|camera|direct
  locale       String
  count        Int
  @@unique([tenantId, date, route, referrerType, locale])
  @@index([tenantId, date])
}

model RollupCheckpoint {        // incremental job cursor
  id           String   @id                            // `${tenantId}:scan` | `global:scan`
  lastEventAt  DateTime
  lastEventId  String
  updatedAt    DateTime @updatedAt
}
```

All tables carry `tenantId` first in every index. `UsageEvent` gets a Postgres trigger (in the migration) that raises on `UPDATE` — immutability enforced in the database, not by convention.

## Tasks

- [ ] T1 Module scaffolds: `AnalyticsModule`, `MeteringModule` (one import line each in `AppModule`), E12 schema block + migration `E12_analytics_metering` including the `UsageEvent` no-update trigger, env section (`ANALYTICS_ROLLUP_CRON`, `METERING_MONTH_CLOSE_CRON`, `ANALYTICS_RETENTION_HINT_DAYS`).
- [ ] T2 `MeterPort` + `MeteringService.record()` with idempotency, `usage.recorded` emission, and `@Audited`-free hot path (metering is high-volume; audit the summaries, not the events).
- [ ] T3 Metering subscribers: `batch.minted` → `code.minted`; `scan.recorded` → `scan.tier1` / `scan.tier2` (tier-2 counted only for verdicts that hit the registry: `authentic|already-verified|suspicious|flagged|decommissioned`; `invalid|unknown|rate-limited` are not billable — documented); `notification.sent` → `notification.sent`; dormant `api.call` subscriber. Idempotency keys = upstream event ids.
- [ ] T4 Monthly `UsageSummary` rollup: BullMQ repeatable job (hourly upsert of the current month, day-1 02:00 UTC finalise of previous month emitting `usage.summary.finalised`); `POST` rebuild for support; `GET /v1/tenants/:id/usage` and `/usage/events`.
- [ ] T5 Incremental scan rollup job: BullMQ repeatable every 10 min; reads `ScanEvent` after `RollupCheckpoint`, aggregates into `ScanRollupDaily` upserts (count, distinctIpCount via `count(distinct ip)` per key/day recomputed for touched days, topCountries), advances checkpoint; single-flight lock in Redis.
- [ ] T6 Nightly reconcile job: recomputes the last 3 days from raw `ScanEvent` and diffs against rollups (fixes late-arriving events and any drift), folds `unit.flagged` and `scan.enumeration_detected` counters in, emits `analytics.rollup.completed`.
- [ ] T7 `AnalyticsReadService` + the five read routes + CSV export (streamed, `@Audited`), all querying rollups only; Vitest guard that fails if any query in the module touches `ScanEvent` outside `jobs/`.
- [ ] T8 `POST /v1/events/page` ingest: validates body, resolves `tenantSlug` → `tenantId`, buffers in Redis and flushes to `PageViewRollupDaily` every 60 s; 204 always (never leaks tenant existence).
- [ ] T9 `packages/ui/src/charts/`: choose **recharts** (see Notes); wrappers `KpiTile`, `TimeSeries`, `StackedBars`, `RankedTable`, `GeoTable`, `ChoroplethLite` (SVG world map by ISO-3166 country fill, no tile server) bound to token palette (`--chart-1..6`, verdict colours = E09's green/amber/red/grey). Tokens for chart colours are a **change request on E11** if not present.
- [ ] T10 Web-admin `/analytics` overview: KPI row (scans 7d/30d with delta, tier-2 verifies, suspicious %, flagged units, countries), verdict distribution over time (stacked), top batches table, range picker (7d/30d/90d), tenant-themed. Replaces E11's EmptyState; registers nav entry.
- [ ] T11 Web-admin `/analytics/batches/[batchId]`, `/analytics/products/[productId]`: per-entity time series, verdict split, geo table; deep links from E04's batch/product screens via URL only (no cross-epic component imports).
- [ ] T12 Web-admin `/analytics/geo`: country/city table with toggle, `ChoroplethLite`, "share of suspicious by country"; `/analytics/export` with dimension picker → CSV download.
- [ ] T13 `docs/analytics-and-metering.md`: what is metered and what is not (with the tier-2 verdict rule), rollup timing guarantees (≤ 10 min lag, nightly correction), which tables E19 may purge and what must be retained (rollups and summaries indefinitely; raw `UsageEvent` ≥ 24 months for billing disputes), how E15 should consume `usage.summary.finalised`.
- [ ] T14 Playwright: `loginAs('viewer')` sees dashboards and no export button; `loginAs('operator')` exports CSV; cross-tenant isolation — tenant B's viewer hitting tenant A's `/v1/analytics/overview` gets 403 and an empty dashboard.

## Acceptance criteria

- [ ] AC1 `docker compose up && pnpm db:seed` (seed includes 2,000 synthetic `ScanEvent`s across 3 products/4 batches/6 countries over 30 days, per E21 seed contract) → within 10 minutes (or immediately after `pnpm --filter api jobs:run analytics.rollup`) `psql -c "select count(*) from \"ScanRollupDaily\" where \"tenantId\"='<ivoryglow>'"` > 0 and `select sum(count)` equals `select count(*) from "ScanEvent"` for the same tenant and range.
- [ ] AC2 Log in to `http://localhost:3001` as `owner@ivoryglow.test`, open `/analytics` → KPI tiles show non-zero scans/verifies/suspicious %, the stacked verdict chart renders 30 daily buckets, and Chrome DevTools shows every request going to `/v1/analytics/*` returning in < 200 ms with no request touching `/v1/scans` or raw events.
- [ ] AC3 Scan a fixture tier-2 code twice via `http://localhost:3000/v/<code>` → `select kind, sum(quantity) from "UsageEvent" where "tenantId"=… group by kind` shows `scan_tier2 = 2`; mint a batch of 500 via E04's admin flow → `code_minted` increases by exactly 500; repeat the same `batch.minted` event by re-emitting in a test → count unchanged (idempotent).
- [ ] AC4 `psql -c 'update "UsageEvent" set quantity = 999 where id = (select id from "UsageEvent" limit 1)'` → fails with the trigger's error `UsageEvent is immutable`.
- [ ] AC5 `curl -H "Authorization: Bearer <owner token>" localhost:4000/v1/tenants/<id>/usage?month=$(date +%Y-%m)` → JSON with all five kinds (zeros allowed) and `finalisedAt: null`; run `pnpm --filter api jobs:run metering.month-close --month=<previous>` → previous month returns `finalisedAt` set and Mailpit shows nothing (E12 sends no mail; `usage.summary.finalised` event visible in api logs).
- [ ] AC6 `/analytics/geo` shows a country table matching `select "geoCountry", count(*) from "ScanEvent" … group by 1` for the range, the choropleth fills those countries, and toggling to city shows city rows only where E06 recorded `geoCity`; no coordinates or IPs anywhere in the response bodies (`grep -c '"ip"' ` on the JSON → 0).
- [ ] AC7 As `operator`, `/analytics/export?dimension=batch&range=30d` downloads a CSV whose row count equals the batches table; an `AuditLog` row `analytics.export` exists (E13); as `viewer` the export button is absent and the route returns 403.
- [ ] AC8 `curl -X POST localhost:4000/v1/events/page -d '{"tenantSlug":"ivoryglow","route":"/v","referrerType":"qr","locale":"en"}' -H 'content-type: application/json'` → 204 with no `Set-Cookie`; after 60 s `PageViewRollupDaily` has the row; posting with `tenantSlug: "nope"` also returns 204.
- [ ] AC9 Playwright suite `apps/web-admin/e2e/analytics.spec.ts` green: viewer/operator/owner visibility matrix and the cross-tenant 403 test.

## Testing

- **Unit:** rollup aggregation functions (pure, given arrays of events → rollup rows, including distinct-IP and topCountries truncation), tier-2 billable-verdict rule, month boundary handling in UTC, idempotency key derivation, CSV serialisation (escaping, BOM).
- **Integration (real Postgres via `createTestDatabase()`):** incremental job then reconcile job produce identical rollups to a from-scratch rebuild; late event (createdAt 2 days ago inserted now) is corrected by reconcile; `UsageEvent` immutability trigger; `MeterPort.record` idempotency under concurrent calls (Promise.all × 20 → 1 row); month-close finalises exactly once; cross-tenant read returns 403 and never leaks rows.
- **Contract:** subscriber tests fed with the published payload shapes of `batch.minted`, `scan.recorded`, `notification.sent`, `unit.flagged` (fixtures checked in under `test/contracts/`; upstream epics are asked to keep them in sync).
- **E2E (Playwright):** T14; visual snapshot of the overview at 1280 px for regression of chart rendering.
- **Load (k6, with E21):** 5,000 `scan.recorded` events/min for 10 min → rollup lag stays < 10 min, API p95 for `/v1/analytics/overview` < 200 ms.

## Compose services added

None. Rollup and metering jobs run as BullMQ workers inside the existing `api` service (`API_ROLE=web|worker|all`, default `all` in compose). Adds `pnpm --filter api jobs:run <name>` for on-demand job execution in acceptance tests.

## Notes and decisions

- **Analytics ≠ metering, by construction.** Different modules, different tables, different consumers. Analytics may be approximate and rebuilt; metering is exact and immutable. A bug that conflates them is a billing incident.
- **Nothing is priced here.** `UsageSummary` has quantities only. E15 owns plan, price, currency, invoice.
- **Tier-2 billable verdicts** exclude `invalid|unknown|rate-limited` so a tenant is never charged for an attacker probing their namespace. Tier-1 scans are all billable (`scan.tier1`) because each is real consumer traffic served on the tenant's behalf; E15 decides whether to price them at zero.
- **recharts over visx:** smaller surface for the five chart shapes needed, SSR-tolerant, and the team has one lib to theme. visx revisited only if the choropleth needs projections beyond the static SVG country map.
- **Rollups only in the UI** is enforced by a test, not a code review note.
- **Retention hand-off to E19:** raw `ScanEvent.geoCity` may be scrubbed after 180 days without affecting rollups (city is already folded into `topCountries` at rollup time); `ScanRollupDaily`, `UsageSummary` are kept indefinitely; raw `UsageEvent` retained ≥ 24 months. E19 encodes these as policies.
- Change requests raised: E06 — add `batchId`/`productId` to `scan.recorded`; E11 — chart colour tokens `--chart-1..6` in `packages/ui` tokens; E21 — seed must include the synthetic 30-day scan history described in AC1.
