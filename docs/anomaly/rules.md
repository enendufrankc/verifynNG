# Anomaly rules

Five declarative rules, no ML (architecture step 9). Each rule has a default
threshold set (`apps/api/src/modules/anomaly/rules/defaults.json`, schema-
validated with Zod at boot) which a tenant can override per-rule via
`GET`/`PUT /v1/anomaly-rules` (owner-only to write, any role to read).

Every rule produces an `Anomaly` row with a fixed `score` (from the rule
definition) and an `autoFlagAt` threshold. Repeated hits on the same
dedupe key **escalate** the existing anomaly's score by the rule's base
score again (capped at 100) rather than creating a new row — see
`rules/dedupe.ts`. When an anomaly's score reaches `autoFlagAt` and it has a
single `unitId`, the unit is auto-flagged (system actor, audited).

Evidence (`Anomaly.evidence`) stores city, country, and scan ids only —
**never raw IPs or coordinates**. `duplicate_first` computes a distance at
evaluation time from a bundled city-centroid table (`rules/city-distance.ts`)
but never persists the coordinates it used to do so.

## geo_dispersion

**Trigger:** both — every `scan.recorded` for a tier-2 code, and the
`sweep:geo_dispersion` repeatable job (catches slow-burn dispersion that
never crossed the threshold on any single event).

**Defaults:** `{ distinctCities: 3, windowDays: 7 }` · score 60 · autoFlagAt 60

**Fires when:** a unit's tier-2 code has been scanned from `distinctCities`
or more distinct `geoCity` values within the trailing `windowDays`.

**Evidence:** the list of distinct cities (with the scan id and timestamp of
each city's first appearance in the window).

## velocity

**Trigger:** event only — evaluated on every `scan.recorded` (distinct-unit
count by `ipHash` in the window) and directly on E06's
`scan.enumeration_detected` (the endpoint already decided this IP is
enumerating).

**Defaults:** `{ distinctUnits: 25, windowMinutes: 10 }` · score 40 ·
autoFlagAt 80

**Fires when:** one IP hash verifies `distinctUnits` or more distinct units
within `windowMinutes`.

**Never auto-flags.** A velocity anomaly has no single `unitId` — flagging
every unit an attacker probes would let the attacker decommission a batch
just by scanning it. `batchId` is set only when every scanned unit shares
one batch; otherwise the anomaly is tenant-scoped (`unitId` and `batchId`
both null). A human reviews the anomaly and, if warranted, recalls the
batch themselves.

## dead_code

**Trigger:** both — event (every tier-2 `scan.recorded`) and the
`sweep:dead_code` repeatable job (catches scans that arrived in the window
before the batch's status caught up).

**Defaults:** none (the check has no numeric threshold) · score 70 ·
autoFlagAt 70

**Fires when:** a tier-2 code is scanned while its batch's status is not
`shipped` or `closed` — i.e. the code shouldn't be reachable by a consumer
yet.

## pre_reveal

**Trigger:** event only.

**Defaults:** `{ graceDays: 0 }` · score 50 · autoFlagAt 100 (alert only)

**Fires when:** a tier-2 code is scanned before
`Batch.expectedShipDate - graceDays`. Requires `Batch.expectedShipDate`
(added by E07 for both E07 and E05 — see `CROSS-EPIC-REQUESTS.md`); when
it's unset the rule never fires — that's a documented no-op, not a bug.

**Alert-only by design.** `autoFlagAt` is 100 and the engine additionally
hard-excludes `pre_reveal` from auto-flag regardless of score — legitimate
early handling (photography, QA) is common enough that a human should
decide, not the engine.

## duplicate_first

**Trigger:** event only.

**Defaults:** `{ windowMinutes: 30, minDistanceKm: 200 }` · score 80 ·
autoFlagAt 80

**Fires when:** the same unit's tier-2 code is scanned twice within
`windowMinutes`, from cities at least `minDistanceKm` apart (via the
bundled centroid table — a city missing from that table can't be
distance-checked and never triggers this rule).

## Sweeps

`sweep:geo_dispersion` and `sweep:dead_code` run on `ANOMALY_SWEEP_CRON`
(default every 15 minutes) as BullMQ job schedulers on the `anomaly` queue.
Both are idempotent: dedupe keys for these two rules are bucketed by day
_and_ tagged with the triggering path (`event` vs `sweep`), so a sweep run
never collides with (or double-counts) whatever the live verify path has
already raised for the same unit on the same day, and re-running a sweep
with no new matching scans is a silent no-op (see `AnomalyEngine.upsertAnomaly`'s
evidence-aware dedupe — it only escalates when the sweep surfaces scan ids
the anomaly doesn't already know about).

## Dev-only test surface

`POST /v1/_dev/anomaly/seed-scans` and `POST /v1/_dev/anomaly/sweep`
(present only when `NODE_ENV !== 'production'`) let tests plant backdated
`ScanEvent` rows and trigger both sweeps synchronously, without waiting for
the cron or for E06's not-yet-built dev scan-replay endpoint.
