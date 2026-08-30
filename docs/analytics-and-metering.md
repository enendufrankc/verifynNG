# Analytics & Usage Metering (E12)

Two systems that read the same upstream events and must never be confused.
**Analytics** (`apps/api/src/modules/analytics/**`) turns `ScanEvent` into
materialised daily rollups for the tenant dashboard — approximate, rebuildable,
never billed from. **Metering** (`apps/api/src/modules/metering/**`) writes a
raw, immutable `UsageEvent` for every billable-shaped thing that happens —
exact, append-only, never displayed as a chart. A bug that conflates the two
is a billing incident, not a dashboard glitch.

## What is metered

`MeterPort.record()` is the only way to write a `UsageEvent`. Five kinds:

| Kind                | Source                                             | Idempotency key   |
| ------------------- | -------------------------------------------------- | ----------------- |
| `code.minted`       | E04 `batch.minted`                                 | the batch id      |
| `scan.tier1`        | E06 `scan.recorded`, tier 1                        | the scan event id |
| `scan.tier2`        | E06 `scan.recorded`, tier 2, billable verdict only | the scan event id |
| `notification.sent` | E14 `notification.sent`                            | the outbox id     |
| `api.call`          | E16 `api.call` (dormant — E16 hasn't shipped)      | —                 |

**The tier-2 billable-verdict rule**: only `authentic`, `already-verified`,
`suspicious`, `flagged`, `decommissioned` are metered. `invalid`, `unknown`,
`rate-limited` are not — a tenant is never charged for an attacker probing
their namespace. Tier-1 scans are billable regardless of verdict: each one is
real consumer traffic served on the tenant's behalf. See
`apps/api/src/modules/metering/subscribers/metering.subscribers.ts`.

**Page views are never metered.** `POST /v1/events/page` (E09's beacon) only
ever writes to `PageViewRollupDaily`, an analytics table.

`UsageEvent` is immutable at the database level — the migration
(`E12_analytics_metering`) installs a trigger that raises `UsageEvent is
immutable` on any `UPDATE`. `DELETE` is still permitted, for E19's retention
purge. `MeterPort.record()` is only idempotent when the caller passes an
`idempotencyKey`; a call without one writes a new row every time.

## Contract gaps found against upstream epics

The epic spec's drafted event payloads don't all match what the shipped
upstream code actually emits. Documented here rather than silently patched
around, since another consumer may hit the same surprise:

- `scan.recorded` (E06) carries `batchId` but not `productId`. Not a problem
  for metering (which doesn't need it) or for the rollup (which reads
  `productId` off `ScanEvent` directly, not off the event payload).
- `batch.minted` (E04) uses a timestamp field named `at`, not `occurredAt`.
- `notification.sent` (E14) is shaped `{outboxId, tenantId, templateId,
channel, recipientHash, providerMessageId}` — no `occurredAt`, and
  `templateId` not `templateKey`.
- `scan.enumeration_detected` (E06) is shaped `{ipHash, tenantSlug,
invalidCount, windowSec, blockedForSec, at}` — no `tenantId` (only a
  nullable `tenantSlug`), no `count`/`windowStart`. The rollup counter
  subscriber resolves `tenantSlug` → `tenantId` itself and silently drops the
  event if the tenant can't be resolved.
- `unit.flagged` (E07) doesn't exist yet — the subscriber for it is wired and
  dormant.

## Rollup timing guarantees

- **Incremental** (`ANALYTICS_ROLLUP_CRON`, default every 10 min): reads
  `ScanEvent` after a global checkpoint (`RollupCheckpoint` id `global:scan`),
  finds every `(tenant, UTC day)` the new events touched, and fully
  recomputes each touched day from scratch — `distinctIpCount` can't be
  derived incrementally, so there's no partial-merge path to get subtly
  wrong.
- **Reconcile** (`ANALYTICS_RECONCILE_CRON`, default nightly): unconditionally
  recomputes the last 3 UTC days for every tenant with any scan activity in
  that window. This is what actually corrects a late-arriving event —
  because the incremental job's checkpoint is monotonic, an event whose
  `createdAt` lands before the checkpoint is never picked up by the
  incremental pass at all, no matter how many times it runs. Reconcile has no
  checkpoint and doesn't have that blind spot.
- Steady-state lag on `ScanRollupDaily` is therefore ≤ 10 minutes for a
  same-time event, with definitive correction of any out-of-order arrival by
  the next nightly reconcile.
- `rateLimitHits` and `flaggedUnits` are **not** recomputed from `ScanEvent`
  by either job — they're maintained live by `RollupCountersSubscriber` off
  `scan.enumeration_detected` and `unit.flagged`, which have no raw-event
  table to recompute from. Both fields are additive and neither rollup job
  ever resets them, so ordering between the subscriber and the jobs doesn't
  matter. `scan.enumeration_detected` hits land on a dedicated per-tenant-
  per-day row (`productId=null, batchId=null, tier=0` — a sentinel value
  `aggregateScanEvents` never produces, `verdict='rate-limited'`) since the
  signal carries no product/batch/tier context.
- `ScanRollupDaily`'s natural key includes nullable `productId`/`batchId`.
  Postgres unique indexes never dedupe on NULL, so a plain `upsert()` against
  that compound key silently stops working the moment either column is null.
  `ScanRollupRowRepository` falls back to `findFirst` + create for that case;
  it is not atomic there (safe in practice — the only concurrent writers are
  the incremental job, single-flighted by design, the nightly reconcile, and
  the rare live-counter subscriber).

## Monthly usage summary

`UsageSummary` is one row per `(tenantId, month, kind)`. An hourly job upserts
the current month's running totals; a `METERING_MONTH_CLOSE_CRON` job (day 1,
02:00 UTC) finalises the _previous_ month by setting `finalisedAt` and
emitting `usage.summary.finalised { tenantId, month, kinds }` once per tenant.
Finalising is idempotent — a second run finds no open rows and emits nothing.

**E15 must only bill `UsageSummary` rows with `finalisedAt` set.** The
current month's numbers are a running total, not a final invoice line — they
can still change until close.

## Running jobs on demand

`pnpm --filter api jobs:run <name>` bootstraps the full Nest application
context and runs one job synchronously, for acceptance tests that don't want
to wait out a cron:

```
pnpm --filter api jobs:run analytics.rollup
pnpm --filter api jobs:run analytics.reconcile
pnpm --filter api jobs:run metering.upsert-month [--month=YYYY-MM]
pnpm --filter api jobs:run metering.month-close [--month=YYYY-MM]
pnpm --filter api jobs:run pageviews.flush
```

## Retention (policy owned by E19; this is the hand-off)

- `ScanRollupDaily`, `PageViewRollupDaily`, `UsageSummary`: keep indefinitely.
  They're small, aggregated, and are the only things E19 needs to preserve
  for historical reporting.
- `UsageEvent` (raw): retain **at least 24 months** for billing disputes.
  Deletes are allowed (the immutability trigger only blocks `UPDATE`).
- `ScanEvent.geoCity` may be scrubbed after 180 days without affecting any
  rollup — city is already folded into `topCountries` at rollup time, and the
  rollup keeps no reference back to the raw row.
- `RollupCheckpoint` has no retention concern; it's a single cursor row.

## Known scope trim: no ChoroplethLite

The spec calls for `ChoroplethLite`, an SVG world map filled by ISO-3166
country code. This pass shipped `GeoTable` instead — the same country/city
breakdown with a proportional share bar, no map. Building a correct
per-country SVG path set was out of scope for the time available; the
information is the same, just not literally cartographic. `packages/ui/src/
charts/GeoTable.tsx` documents this at the call site.

## URL contract for other epics

- E04's batch/product detail screens should deep-link to
  `/analytics/batches/:batchId` and `/analytics/products/:productId` via
  plain URL (no cross-epic component imports, per the epic's own
  constraint) — both routes exist and take no other setup.
- `nav.config.ts`'s `monitoring.analytics` entry (added by E11) points at
  `/analytics`, already wired.
