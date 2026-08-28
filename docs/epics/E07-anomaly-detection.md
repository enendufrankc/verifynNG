# E07 — Anomaly Detection & Unit Lifecycle

| | |
|---|---|
| Wave | 2 |
| Status | todo |
| Owner | — |
| GitHub Issue | — |
| Depends on | E06, E14, E13 (also consumes E04, E05 status/expectedShipDate, E11) |
| Unblocks | E08 (anomaly context on report detail), E16 (`unit.flagged`, `anomaly.detected` webhooks), E12 (anomaly counts) |
| Readiness items | `architecture.md` step 9 (rules first, no ML) · mental-model §4 anomaly signals table · §4 "verdicts are anomaly scores, not booleans" · §1 owner-only kill (RBAC on decommission) |

## Goal

Scan events become evidence automatically. A rules engine consumes every `scan.recorded`, plus scheduled sweeps, and raises `Anomaly` rows for the five signals the mental model names — geo dispersion, velocity, dead codes, pre-reveal, duplicate-first — with per-tenant thresholds, deduplication, and a score that auto-flags the unit when it crosses the line. Owners get an alert through E14, work a queue in web-admin with an evidence timeline (cities and times, never coordinates), and act on units — flag, decommission, restore — or recall a whole batch, every action audited. Without this the platform records counterfeits but never notices them.

## Scope

**In:** declarative rule definitions with defaults and tenant overrides, BullMQ consumers + repeatable sweeps, `Anomaly` model and lifecycle, dedupe/escalation, auto-flag, `UnitLifecycleService` (flag/decommission/restore/bulk recall) with a documented state machine and transition history, anomaly queue + detail + unit detail + batch bulk-action screens, alert emission to E14, rule-threshold settings API.

**Out:** the verdict shown to consumers (E06 reads `Unit.state` and computes the verdict; E07 only changes state), geo-IP lookup (E06 `GeoIpPort`; E07 uses `geoCity`/`geoCountry` already on `ScanEvent`), enumeration detection at the endpoint (E06 emits `scan.enumeration_detected`; E07 records it as a velocity anomaly), consumer fake reports (E08), ML of any kind, analytics dashboards (E12), tenant-facing webhooks (E16).

## Owned paths

```
apps/api/src/modules/anomaly/**                   (rules/, engine, consumers, sweeps, anomalies API)
apps/api/src/modules/units/**                     (UnitLifecycleService, units API, recall job)
apps/web-admin/app/(console)/anomalies/**         (replaces E11's EmptyState route group)
apps/web-admin/app/(console)/units/**             (unit detail, batch bulk actions)
packages/db/prisma/schema.prisma                  (additive block: "E07")
docs/anomaly/**                                   (rules.md, unit-lifecycle.md)
```

## Interfaces

**Consumes**
- E06: append-only `ScanEvent` (`tenantId, unitId?, tier, verdict, ip?, ipHash, geoCountry?, geoCity?, userAgent?, createdAt`), events `scan.recorded {tenantId, unitId, tier, verdict, geo}` and `scan.enumeration_detected {tenantId, ipHash, attempts, window}`, `ScanEventRepository.forUnit(unitId, {tier?, limit})` and `.byIpHash(tenantId, ipHash, since)`. E06 reads `Unit.state` for the `flagged`/`decommissioned` verdicts — E07 is the only writer.
- E04: `Batch.status`, `Batch.expectedShipDate` (added by E05's change request), `Unit.batchId`.
- E05: `BatchLifecycleService.expectedShipDate(batchId)`, status semantics (`shipped` = codes legitimately in the wild).
- E13: `@Audited('unit.flag' | 'unit.decommission' | 'unit.restore' | 'batch.recall' | 'anomaly.acknowledge' | 'anomaly.resolve' | 'anomaly.dismiss' | 'anomaly.rules.update')`, `AuditService.record` with actor `system` for auto-flags.
- E14: routing rule `anomaly.detected → anomaly.alert` (default seeded by E14 to owners by email); E07 supplies the `anomaly.alert` template data contract `{ tenantName, rule, score, unitRef?, batchRef, summary, cities[], adminUrl }`.
- E02: `@Roles()` — flag/acknowledge/resolve: `owner|operator`; decommission/recall/restore: `owner`; read: all roles.
- E11: layout, `apiClient`, `nav.config.ts` entries "Anomalies" (with open-count badge from `GET /v1/anomalies/summary`) and "Units", `loginAs(role)`, `EmptyState` (used for zero-anomaly state), `packages/ui` table/drawer/badge primitives.
- E00: BullMQ/Redis, `createTestDatabase()`.

**Exposes**

```ts
// rules
type RuleId = 'geo_dispersion' | 'velocity' | 'dead_code' | 'pre_reveal' | 'duplicate_first'
interface RuleDefinition { id: RuleId; trigger: 'event' | 'sweep' | 'both'; defaults: Record<string, number>; score: number; autoFlagAt: number; description: string }
// defaults (rules/defaults.json):
//  geo_dispersion  { distinctCities: 3, windowDays: 7 }                 score 60  autoFlagAt 60
//  velocity        { distinctUnits: 25, windowMinutes: 10 }             score 40  autoFlagAt 80  (per ipHash; unit-less anomaly, batch-scoped if all units share a batch)
//  dead_code       { }  tier-2 scan on a batch whose status ∉ {shipped, closed}   score 70  autoFlagAt 70
//  pre_reveal      { graceDays: 0 } tier-2 scan before Batch.expectedShipDate    score 50  autoFlagAt 100 (alert only)
//  duplicate_first { windowMinutes: 30, minDistanceKm: 200 }           score 80  autoFlagAt 80
RulesService.effective(tenantId): Promise<Record<RuleId, { enabled; thresholds; score; autoFlagAt }>>
AnomalyEngine.evaluate(scan: ScanRecordedEvent): Promise<Anomaly[]>
AnomalyQuery.forUnit(unitId) / .forBatch(batchId) / .summary(tenantId): { open, acknowledged, byRule }   // E08 and E12 use these
UnitLifecycleService.flag(unitId, ctx) / .decommission(unitId, ctx) / .restore(unitId, ctx) / .recallBatch(batchId, ctx): Promise<{ jobId }>
  // ctx: { actor: { type: 'user'|'system'; id? }, reason: string, anomalyId?: string }

// HTTP (tenant-scoped)
GET  /v1/anomalies?status&rule&batchId&unitId&minScore&cursor
GET  /v1/anomalies/summary
GET  /v1/anomalies/:id                                   → anomaly + evidence + unit + batch + linked scans (city/time list)
POST /v1/anomalies/:id/acknowledge | /resolve { note } | /dismiss { note }     @Audited
GET  /v1/anomaly-rules          PUT /v1/anomaly-rules { [ruleId]: { enabled, thresholds } }   roles owner   @Audited
GET  /v1/units/:id                                       → unit, state, transitions, tier-1/tier-2 scan history (paged), anomalies
POST /v1/units/:id/flag | /decommission | /restore { reason }                  @Audited
POST /v1/batches/:batchId/recall { reason }              roles owner → BullMQ job decommissioning all active/flagged units   @Audited('batch.recall')
GET  /v1/batches/:batchId/units?state&cursor             (E07 owns this listing; E04 owns batch metadata)

// events
'anomaly.detected'     { anomalyId, tenantId, rule, score, unitId?, batchId?, autoFlagged: boolean, summary }
'anomaly.escalated'    { anomalyId, tenantId, rule, previousScore, score }
'unit.flagged'         { tenantId, unitId, batchId, reason, anomalyId?, actorType }
'unit.decommissioned'  { tenantId, unitId, batchId, reason, actorType, recallJobId? }
'unit.restored'        { tenantId, unitId, batchId, reason, actorType }
'batch.recalled'       { tenantId, batchId, unitsDecommissioned, jobId }

// BullMQ: queue 'anomaly' jobs 'evaluate' {scanEventId}, 'sweep:geo_dispersion', 'sweep:dead_code' (repeat every 15 min); queue 'units' job 'recall' {batchId, reason, actorId}
```

## Data model

```prisma
// E07
model Anomaly {
  id String @id @default(cuid())
  tenantId String
  rule String
  unitId String?
  batchId String?
  score Int
  evidence Json                    // { scans: [{ scanEventId, at, city, country }], thresholds, computed: {...} } — never raw IPs or coordinates
  status AnomalyStatus @default(open)
  dedupeKey String @unique         // `${tenantId}:${rule}:${unitId ?? batchId ?? ipHash}:${windowBucket}`
  assignedToId String?
  note String?
  firstSeenAt DateTime @default(now())
  lastSeenAt DateTime @default(now())
  resolvedAt DateTime?
  resolvedById String?
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  @@index([tenantId, status, score])
  @@index([tenantId, rule, createdAt])
  @@index([unitId])
  @@index([batchId])
}
enum AnomalyStatus { open acknowledged resolved dismissed }

model AnomalyRuleConfig { id, tenantId, rule String, enabled Boolean @default(true), thresholds Json, createdAt, updatedAt   @@unique([tenantId, rule]) }

model UnitStateTransition { id, tenantId, unitId, fromState String, toState String, reason String, actorType String, actorId String?, anomalyId String?, recallJobId String?, createdAt
  @@index([unitId, createdAt])
  @@index([tenantId, createdAt]) }
```

`Unit.state` (`active|flagged|decommissioned`, E00) is unchanged; E07 adds no columns to `Unit` — history lives in `UnitStateTransition`.

Unit lifecycle (`docs/anomaly/unit-lifecycle.md`):

```
active ──flag(operator|system)──► flagged ──restore(owner)──► active
  │                                  │
  └──decommission(owner|recall)──────┴──decommission(owner|recall)──► decommissioned ──restore(owner, reason required)──► active
```
Consumer effect (E06): `flagged` → amber verdict with caution copy; `decommissioned` → red "withdrawn by the brand".

## Tasks

- [ ] T1 Migration `E07_anomaly`: `Anomaly`, `AnomalyRuleConfig`, `UnitStateTransition`. `AnomalyModule` + `UnitsModule` skeletons, `AppModule` import lines, env section "E07" (`ANOMALY_SWEEP_CRON=*/15 * * * *`, `ANOMALY_ALERT_DEBOUNCE_MIN=60`).
- [ ] T2 `UnitLifecycleService`: transitions per the state machine, `UnitStateTransition` rows, events, `@Audited` routes `POST /v1/units/:id/flag|decommission|restore`, `GET /v1/units/:id` aggregating E06 scan history. Role checks (decommission/restore owner-only). Integration tests including illegal transitions → `409`.
- [ ] T3 Rules infrastructure: `rules/defaults.json` (schema-validated with Zod at boot), `RulesService.effective()` merging tenant `AnomalyRuleConfig`, `GET/PUT /v1/anomaly-rules`. `docs/anomaly/rules.md` describing each rule, its evidence and its default thresholds.
- [ ] T4 `AnomalyEngine` core: `upsertAnomaly()` with dedupe (open anomaly with same `dedupeKey` → escalate score/lastSeenAt/evidence, emit `anomaly.escalated`), auto-flag when `score ≥ autoFlagAt` and unit is `active` (system actor, audited), `anomaly.detected` emission debounced per anomaly. BullMQ consumer of `scan.recorded` → job `evaluate`.
- [ ] T5 Rules — event-triggered: `dead_code` (tier-2 scan, batch status ∉ shipped/closed), `pre_reveal` (tier-2 scan `createdAt < Batch.expectedShipDate - graceDays`), `duplicate_first` (tier-2 scan on a unit whose previous tier-2 scan was < `windowMinutes` ago in a city ≥ `minDistanceKm` away — city centroid distance table bundled, no coordinates persisted in evidence).
- [ ] T6 Rules — velocity: consume `scan.enumeration_detected` directly, plus evaluate on each `scan.recorded`: distinct `unitId` count by `ipHash` in `windowMinutes` via `ScanEventRepository.byIpHash`; batch-scoped anomaly when all units belong to one batch, tenant-scoped otherwise (`unitId` and `batchId` null).
- [ ] T7 Rules — sweeps: repeatable jobs `sweep:geo_dispersion` (per tenant: tier-2 units with ≥ `distinctCities` distinct `geoCity` in `windowDays`, one SQL query with `GROUP BY unitId HAVING COUNT(DISTINCT geoCity) ≥ n`) and `sweep:dead_code` (catches scans that arrived before the batch status changed). Idempotent via dedupe keys bucketed by day.
- [ ] T8 Anomaly API: list/summary/detail/acknowledge/resolve/dismiss with `@Audited`, assignment (`assignedToId` must be a member — E02), `AnomalyQuery` provider for E08/E12.
- [ ] T9 Bulk recall: `POST /v1/batches/:id/recall` → BullMQ job iterating units in pages of 500, one `UnitStateTransition` per unit with `recallJobId`, single audit row for the action plus `batch.recalled` event; job progress endpoint `GET /v1/batches/:id/recall/:jobId`.
- [ ] T10 web-admin `(console)/anomalies/`: queue table (rule chip, score, unit/batch ref, cities count, first/last seen, status, assignee) with filters and saved "Open · score ≥ 60" default; detail page with evidence timeline (vertical list of `time — city, country — verdict`; a simple city-count map is out — list only), linked unit card with flag/decommission buttons, acknowledge/resolve/dismiss with note. Nav badge from `/summary`. Replaces E11's EmptyState.
- [ ] T11 web-admin `(console)/units/[unitId]` (state, transitions timeline, scan history table tier-1/tier-2, anomalies, actions with reason dialog) and `(console)/units/batch/[batchId]` (unit list by state, "Recall batch" owner-only dialog with typed confirmation, progress bar). Ask E04 (comment on its issue) to link "Units & recall" from its batch detail.
- [ ] T12 `anomaly.alert` template data contract handed to E14 (PR to E14's template if E14 has not defined it yet), Playwright fixtures that replay a scan sequence through E06's verify endpoint to produce each rule's anomaly, E2E for AC4–AC7. `docs/anomaly/unit-lifecycle.md`.

## Acceptance criteria

- [ ] AC1 Geo dispersion: with fake-geo (E06) configured to return Lagos, Accra, Nairobi for three source IPs (`docker compose exec fake-geo …` or its `/admin/map` endpoint), verify the same seeded tier-2 code three times with `curl -H 'X-Forwarded-For: <ip>' localhost:4000/v1/verify/<code>` → `GET localhost:4000/v1/anomalies?rule=geo_dispersion` shows one open anomaly with score 60, evidence listing the three cities, and `GET /v1/units/<id>` shows `state: flagged` with a `system` transition; `http://localhost:8025` has the `anomaly.alert` email to the owner.
- [ ] AC2 Velocity: `for c in $(head -30 packages/core/test/fixtures/tier2-codes.txt); do curl -s -H 'X-Forwarded-For: 41.58.1.1' localhost:4000/v1/verify/$c; done` → one `velocity` anomaly scoped to the batch, no unit flagged (score 40 < 80), and a second burst escalates it (`anomaly.escalated`, score 80, still no auto-flag because it is unit-less — documented).
- [ ] AC3 Dead code: verify a tier-2 code from the seeded batch still in status `delivered` → `dead_code` anomaly, unit auto-flagged, verdict on the next verify returns E06's flagged copy. After E05 moves the batch to `shipped`, verifying a *different* unit from that batch produces no anomaly.
- [ ] AC4 Pre-reveal: set the batch `expectedShipDate` to +7 d via E05, verify a tier-2 code → `pre_reveal` anomaly with score 50, unit **not** flagged (alert-only rule), email sent.
- [ ] AC5 Duplicate-first: two verifies of one unit within 2 min from IPs mapping to Lagos and Kano → `duplicate_first` anomaly, score 80, auto-flag; `http://localhost:3001/anomalies/<id>` renders the two-entry timeline without any coordinates in the DOM (Playwright asserts no `lat`/`lng` text).
- [ ] AC6 Lifecycle: as `loginAs('operator')` flag a unit from `http://localhost:3001/units/<id>` with reason "test"; as operator the Decommission button is disabled; as `loginAs('owner')` decommission then restore with a reason → three rows in the transitions timeline and three rows in `GET /v1/audit?targetType=unit&targetId=<id>` (E13).
- [ ] AC7 Recall: as owner at `http://localhost:3001/units/batch/<batchId>` recall the seeded 1,000-unit batch → progress reaches 100 % within 60 s, `GET /v1/batches/<id>/units?state=decommissioned` has 1,000 items, exactly one `batch.recall` audit row, and `curl localhost:4000/v1/verify/<any tier-2 code in batch>` returns the decommissioned verdict.
- [ ] AC8 Thresholds: `PUT /v1/anomaly-rules {"geo_dispersion":{"thresholds":{"distinctCities":5}}}` as owner → repeating AC1's three scans on a fresh unit raises nothing; as `viewer` the same PUT returns `403`.
- [ ] AC9 Sweep: insert (via E06's dev replay endpoint) tier-2 scans dated across the last 6 days from 4 cities for one unit, then trigger `POST localhost:4000/v1/_dev/anomaly/sweep` → `geo_dispersion` anomaly created by the sweep path with `evidence.source: 'sweep'`; triggering again creates no duplicate.

## Testing

- Unit: each rule as a pure function over a scan window fixture (table-driven), dedupe key derivation, state machine transitions, city distance lookup, rule config merge.
- Integration (real Postgres + Redis): engine end-to-end from a `scan.recorded` event to `Anomaly` + `UnitStateTransition` + emitted events; sweeps idempotent across two runs; recall job over 5,000 seeded units; role checks; cross-tenant: anomalies of tenant A never listed for tenant B (extend E02 harness).
- E2E (Playwright): AC1, AC5, AC6, AC7 through web-admin with Mailpit checks.
- Load (with E21): engine keeps up with 200 `scan.recorded`/s on compose for 5 min without queue growth (k6 script under `apps/api/test/load/anomaly.js`).

## Compose services added

None. Uses E06's `fake-geo` for city mapping and E14's Mailpit path for alerts.

## Notes and decisions

- Rules only, thresholds declarative, no ML — per architecture step 9. Scores are additive per rule but the anomaly is per rule; a unit's overall risk is the max open score (`AnomalyQuery.forUnit`), which E06 may later surface as amber.
- Evidence stores city/country and scan ids, never IPs or coordinates — consistent with the mental-model privacy question and E19's retention: anomalies outlive scan PII.
- Velocity anomalies have no unit and never auto-flag; flagging every unit an attacker probes would let an attacker decommission a batch. Humans decide.
- Batch `recall` reuses `decommission` semantics unit by unit, so restore remains possible per unit; there is deliberately no bulk restore.
- E07 owns `GET /v1/batches/:id/units` because unit state is its domain; E04 keeps batch metadata routes. Agreed at planning; recorded here to avoid a route clash.
