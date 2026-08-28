# E19 — Compliance & Data Governance

| | |
|---|---|
| Wave | 2 |
| Status | todo |
| Owner | — |
| GitHub Issue | — |
| Depends on | E02 (users, sessions, roles), E06 (ScanEvent fields and hashing), E03 (tenant status, signup acceptance records, tenant export), E13 (`@Audited`, AuditLog), E14 (`MailerPort` for DSAR verification mail; marketing/transactional split), E08 (Report + contact consent), E09 (web-verify app hosts `/legal/**`), E11 (admin shell, `loginAs`) |
| Unblocks | E15 (billing needs accepted ToS version before charging), E18 (incident register, DSAR queue in support), E03 offboarding purge (executes E19 policy) |
| Readiness items | `production-readiness.md` §3 all rows: privacy policy + ToS, NDPR/NDPA data mapping + lawful basis + retention + consent records, UK GDPR track, DPAs/subprocessor list, retention & deletion policy, AUP, subprocessor list public · §2 incident response plan + breach notification (NDPR 72 h) · §6 transactional vs promotional consent split |

## Goal

The platform tells consumers and tenants what it collects and why, keeps versioned proof of what they agreed to, deletes what it said it would delete on the schedule it said it would, answers a data-subject request without a database engineer, and has a rehearsed plan for the day something leaks. Concretely: versioned `LegalDocument`s served publicly and re-accepted on bump, a `ConsentRecord` model every consent-touching epic writes to, a data map for NDPR/NDPA and UK GDPR, a declarative retention engine run nightly with dry-run and audit, DSAR export/erasure endpoints for consumers (by report reference + email verification) and tenants (delegating to E03's export), a public subprocessor page, an incident register with the 72-hour breach runbook, and a test that asserts the consumer surface sets no cookies. Scan pages collect IP, geo and device data; without this epic the platform is non-compliant on day one in both its target jurisdictions.

## Scope

**In:** `LegalDocument` versioning + admin authoring (platform `support` role only) + public pages at `/legal/*` in web-verify + tenant re-acceptance gate in web-admin, `ConsentRecord` + `ConsentService`, `docs/compliance/data-map.md`, `RetentionPolicy` engine (declarative policies in code, nightly BullMQ jobs, dry-run, audit, `retention.executed`), DSAR request model + endpoints + email verification + export bundle to MinIO with expiring link + erasure with legal-hold check, subprocessor list (content + page), `Incident` register model + admin screen + breach runbook, cookie-less assertion suite, events.

**Out (with owner):**
- Acceptance of ToS/AUP **at signup** and the `TenantAcceptance` record — E03 owns the signup flow and writes the record; E19 owns which document version is current and the re-acceptance prompt when it bumps. Coordinate via `LegalDocumentService.current(kind, locale)`.
- Tenant data export **contents** — E03 (`TenantExportService`). E19's tenant DSAR endpoint calls it and packages the result.
- Sending emails — E14. E19 uses `MailerPort` templates `dsar.verify`, `dsar.ready`, `legal.reaccept`.
- Consumer report contact capture UI — E08; E08 calls `ConsentService.record()` for the contact-consent checkbox.
- Marketing email consent UI for tenant users — E14 (preferences screen); E14 reads `ConsentService.has()` before any non-transactional send.
- Operational incident detection/alerting — E17. E19's incident register is the legal/regulatory record; E17's runbook opens an entry in it when data exposure is suspected.
- Security hardening (headers, secrets, isolation tests) — E13.
- Cloud-provider DPAs and NDPC registration paperwork — human tasks tracked in the data map with owners, not code.

## Owned paths

```
apps/api/src/modules/legal/**               LegalDocument CRUD, current-version resolution, re-acceptance checks
apps/api/src/modules/consent/**             ConsentRecord + ConsentService
apps/api/src/modules/retention/**           policies, nightly jobs, dry-run, reports
apps/api/src/modules/dsar/**                DSAR requests, verification, export/erasure
apps/api/src/modules/incidents/**           incident register
apps/web-verify/app/legal/**                /legal/privacy, /legal/terms, /legal/aup, /legal/cookie, /legal/subprocessors (carve-out inside E09's app)
apps/web-admin/app/(console)/legal/**       re-acceptance interstitial, "your agreements" screen
apps/web-admin/app/(console)/compliance/**  retention runs, DSAR queue, incidents (owner + support)
apps/web-admin/app/(platform)/legal-docs/** platform-support authoring of LegalDocument versions (route group E11 reserves for platform roles)
packages/db/prisma/schema.prisma            (additive block: "E19")
packages/db/prisma/migrations/E19_*
packages/config/src/env.ts                  (section comment "E19")
docs/compliance/data-map.md
docs/compliance/retention-schedule.md
docs/compliance/subprocessors.md
docs/runbooks/breach-notification.md
content/legal/**                            seed markdown for each document kind × locale, versioned
```

## Interfaces

**Consumes**

- E02 `@TenantId()`, `@Roles()`, platform `support`; `User`, `Session` (retention target: 30 d), `sessions.revokeAllForUser()` for erasure.
- E03 `Tenant.status` (`offboarded` + `offboardedAt` — **change request on E03**: add `offboardedAt` so the 30-day purge clock has a start), `TenantAcceptance(tenantId, userId, documentKind, documentVersion, acceptedAt)` written at signup, `TenantExportService.export(tenantId) → { objectKey }`.
- E06 `ScanEvent` (ip already hashed at write; `geoCity` scrub target), E06 hashing salt rotation interplay documented.
- E08 `Report(referenceNumber, contactEmail?, photos[] object keys)` — DSAR lookup key is the `referenceNumber`; photo retention 2 y.
- E13 `@Audited(action)`, `AuditLog`; retention runs are audited with counts, never row contents.
- E14 `MailerPort.send({ template, to, data })` with templates `dsar.verify`, `dsar.ready`, `dsar.erased`, `legal.reaccept` (**change request on E14**); `NotificationService` must call `ConsentService.has(subject, 'marketing')` before non-transactional sends (**change request on E14**).
- E11 admin shell, `nav.config.ts` entries (Compliance under settings; Legal docs under platform), `EmptyState`, `loginAs(role)`.
- E09 `TenantThemeProvider` and `t()` for the `/legal/**` pages (platform-branded, not tenant-themed); E09 footer links to these routes.
- E12 retention hints from `docs/analytics-and-metering.md` (rollups indefinite, raw `UsageEvent` ≥ 24 months, `geoCity` scrub safe after rollup).
- E17 `ProbeResult` 90-day retention target; `probe.failed` may open an incident (manual).
- MinIO (E00) bucket `dsar-exports` with object expiry; presigned URL helper from E04/E08's `StorageService` (or `packages/storage` if extracted).

**Exposes**

Nest providers:
- `LegalDocumentService`: `current(kind, locale='en') → LegalDocument`, `list(kind)`, `publish(kind, locale, bodyMd, changeSummary) → version+1`, `needsReacceptance(tenantId, userId) → { kind, version }[]` (compares E03's `TenantAcceptance` against current versions for `terms|aup`).
- `ConsentService`: `record({ subjectType: 'consumer'|'user', subjectRef, purpose, granted, source, tenantId?, evidence? })`, `has(subjectType, subjectRef, purpose) → boolean` (latest record wins), `history(subject)`. Purposes enum: `contact_followup | marketing | analytics_optional | terms_acceptance`.
- `RetentionPolicyRegistry` + `RetentionRunner`: policies declared as code objects `{ name, model, where(cutoff), action: 'delete'|'scrub'(fields), schedule, legalHoldAware }`; `run({ dryRun, policyName? })` returns per-policy counts.
- `DsarService`: `request(...)`, `verify(token)`, `fulfil(id)`, `erase(id)`; `LegalHoldService.isHeld(subjectType, subjectRef)`.
- `IncidentService`: `open`, `update`, `assess72h()` (returns deadline and whether NDPC notice is required per severity), `close`.

HTTP routes:
- Public (web-verify calls server-side): `GET /v1/legal/:kind?locale=` → current document `{ kind, version, locale, bodyMd, publishedAt, changeSummary }`; `GET /v1/legal/:kind/versions`; `GET /v1/legal/subprocessors` (structured list).
- Tenant (`owner`): `GET /v1/legal/acceptance-status` → docs needing re-acceptance; `POST /v1/legal/accept { kind, version }` → writes E03 `TenantAcceptance` via E03's service + `ConsentRecord(purpose: terms_acceptance)`, `@Audited('legal.accepted')`.
- Platform (`support`): `POST /v1/legal/:kind/versions` publish new version; `GET /v1/retention/policies`; `POST /v1/retention/run { dryRun: true|false, policy? }` `@Audited('retention.run')`; `GET /v1/retention/runs`; `GET|POST|PATCH /v1/incidents`.
- Consumer DSAR (public, rate-limited by E06's limiter, no auth): `POST /v1/dsar/consumer { referenceNumber, email, action: 'export'|'erase' }` → 202 always (no enumeration) + sends `dsar.verify` mail if the pair matches a Report; `POST /v1/dsar/consumer/verify { token }` → 200 `{ status }`; `GET /v1/dsar/consumer/:id/download?token=` → 302 to presigned MinIO URL (24 h).
- Tenant DSAR (`owner`): `POST /v1/dsar/tenant { action: 'export' }` → 202, job calls E03 export, mails `dsar.ready` with link; `GET /v1/dsar/tenant/:id`.
- Consent: `POST /v1/consent` (internal use by E08/E14 through the service; HTTP route exists for web-admin user preferences with `@TenantId()`), `GET /v1/consent/me`.

Domain events:
- `consent.recorded { consentRecordId, tenantId?, subjectType, subjectRef (hashed for consumers), purpose, granted, source, at }`
- `retention.executed { runId, policy, dryRun, matched, affected, durationMs, at }`
- `dsar.requested { dsarRequestId, subjectType, action, tenantId?, at }`
- `dsar.completed { dsarRequestId, action, outcome: 'exported'|'erased'|'rejected_legal_hold', at }`
- `legal.document.published { kind, version, locale, publishedAt }` — E03 listens to prompt re-acceptance; E14 sends `legal.reaccept` to tenant owners.
- `incident.opened { incidentId, severity, dataCategories, detectedAt, notifyDeadlineAt }`

Prisma models: below.

## Data model

```prisma
// ─── E19 Compliance & Data Governance ───────────────────────────────────────
enum LegalDocumentKind { privacy terms aup cookie subprocessors }

model LegalDocument {            // platform-level, immutable once published
  id             String            @id @default(cuid())
  kind           LegalDocumentKind
  version        Int
  locale         String            @default("en")
  bodyMd         String
  changeSummary  String?
  requiresReacceptance Boolean     @default(false)     // true for material terms/aup changes
  publishedAt    DateTime
  publishedById  String                                // User (support role)
  @@unique([kind, locale, version])
  @@index([kind, locale, publishedAt])
}

enum ConsentSubjectType { consumer user }
enum ConsentPurpose { contact_followup marketing analytics_optional terms_acceptance }
enum ConsentSource { report_form signup admin_preferences legal_reaccept import }

model ConsentRecord {            // append-only; latest per (subject, purpose) wins
  id           String             @id @default(cuid())
  tenantId     String?                                 // null for platform-level (consumer contact on a report is tenant-scoped)
  subjectType  ConsentSubjectType
  subjectRef   String                                  // user id, or sha256(lowercased email + CONSENT_SALT) for consumers
  purpose      ConsentPurpose
  granted      Boolean
  source       ConsentSource
  documentKind LegalDocumentKind?
  documentVersion Int?
  evidence     Json?                                   // { ipHash, userAgent, formVersion } — never raw IP
  at           DateTime           @default(now())
  @@index([tenantId, subjectType, subjectRef, purpose, at])
  @@index([subjectType, subjectRef, purpose, at])
}

model RetentionRun {             // one row per policy per execution
  id          String   @id @default(cuid())
  policy      String
  dryRun      Boolean
  cutoff      DateTime
  matched     Int
  affected    Int
  startedAt   DateTime
  finishedAt  DateTime?
  error       String?
  triggeredBy String                                   // 'schedule' | userId
  @@index([policy, startedAt])
}

enum LegalHoldScope { tenant unit report consumer }
model LegalHold {                // blocks retention/erasure for evidence in disputes or investigations
  id          String         @id @default(cuid())
  tenantId    String?
  scope       LegalHoldScope
  ref         String                                   // tenantId | unitId | reportId | consumer subjectRef
  reason      String
  createdById String
  createdAt   DateTime       @default(now())
  releasedAt  DateTime?
  @@index([scope, ref, releasedAt])
}

enum DsarSubjectType { consumer tenant }
enum DsarAction { export erase }
enum DsarStatus { pending_verification verified processing completed rejected expired }
model DsarRequest {
  id              String          @id @default(cuid())
  tenantId        String?
  subjectType     DsarSubjectType
  action          DsarAction
  subjectRef      String                               // consumer: sha256(email+salt); tenant: tenantId
  lookupRef       String?                              // consumer: Report.referenceNumber
  status          DsarStatus      @default(pending_verification)
  verifyTokenHash String?
  verifyExpiresAt DateTime?
  exportObjectKey String?                              // MinIO dsar-exports/…
  exportExpiresAt DateTime?
  outcomeNote     String?
  requestedAt     DateTime        @default(now())
  completedAt     DateTime?
  @@index([subjectType, subjectRef, requestedAt])
  @@index([status, requestedAt])
}

enum IncidentSeverity { low medium high critical }
enum IncidentStatus { open assessing contained notified closed }
model Incident {                 // regulatory record, not the ops alert
  id                 String           @id @default(cuid())
  title              String
  severity           IncidentSeverity
  status             IncidentStatus   @default(open)
  detectedAt         DateTime
  occurredAt         DateTime?
  dataCategories     String[]                          // e.g. ["scan.ipHash","report.contactEmail"]
  affectedTenantIds  String[]
  estimatedSubjects  Int?
  ndpcNotifyRequired Boolean?
  ndpcNotifyDeadline DateTime?                         // detectedAt + 72h when required
  ndpcNotifiedAt     DateTime?
  icoNotifyRequired  Boolean?                          // UK GDPR track
  timeline           Json                              // [{ at, actorId, note }]
  postmortemUrl      String?
  openedById         String
  closedAt           DateTime?
  @@index([status, detectedAt])
}
```

No raw email or IP anywhere in these tables; consumer subjects are salted hashes (`CONSENT_SALT`, rotated only with a documented re-hash migration).

## Tasks

- [ ] T1 Module scaffolds (`LegalModule`, `ConsentModule`, `RetentionModule`, `DsarModule`, `IncidentsModule`, one import line each), E19 schema block + migration `E19_compliance`, env section (`CONSENT_SALT`, `DSAR_EXPORT_TTL_HOURS=24`, `RETENTION_CRON=0 2 * * *`, `RETENTION_DRY_RUN_DEFAULT=false`, `DSAR_EXPORT_BUCKET=dsar-exports`), MinIO bucket init in `mc` step with 7-day lifecycle expiry.
- [ ] T2 `LegalDocumentService` + routes + seed: `content/legal/{privacy,terms,aup,cookie,subprocessors}/en.md` v1 written for real (platform operator = Tunnel Light Global Concept Ltd; covers IP/geo/device collection on scan pages, lawful basis legitimate interest for anti-counterfeit, retention periods from T6, NDPC and ICO contact routes, subprocessors Resend/Termii/Paystack/MaxMind/hosting placeholder); `pnpm db:seed` publishes v1 of each; `legal.document.published` event; platform-support authoring screen at `/legal-docs` with markdown preview and "requires re-acceptance" toggle.
- [ ] T3 Public pages `apps/web-verify/app/legal/[kind]/page.tsx` (+ `/legal/subprocessors`): SSR from `GET /v1/legal/:kind`, markdown → sanitised HTML, version + published date + "previous versions" list, locale via E09 `t()` with `en` only for now, `revalidate = 3600`, platform-branded, print stylesheet, `robots` allowed.
- [ ] T4 Tenant re-acceptance: `needsReacceptance()` comparing E03 `TenantAcceptance` to current `terms|aup` versions flagged `requiresReacceptance`; web-admin interstitial at `/(console)/legal/reaccept` shown by a layout guard for `owner` (operators/viewers see a banner "your owner must accept updated terms"; nothing else blocked — verify for consumers is never affected); `POST /v1/legal/accept` writes via E03's `TenantAcceptanceService` + `ConsentRecord`; `legal.reaccept` mail on publish.
- [ ] T5 `ConsentService` + `POST /v1/consent`, `GET /v1/consent/me`; wire-in PRs proposed to E08 (report contact checkbox → `contact_followup`) and E14 (`has(…,'marketing')` gate) as change requests with tests E19 supplies under `test/contracts/`.
- [ ] T6 Retention policies (code, `apps/api/src/modules/retention/policies/*.ts`) and `docs/compliance/retention-schedule.md`:
  - `scanEvent.geoCity.scrub` — set `geoCity = null` where `createdAt < now-180d` (ip already hashed at write by E06; verdict/tier/country/counts kept indefinitely as anti-counterfeit evidence).
  - `scanEvent.userAgent.scrub` — null `userAgent` after 180 d.
  - `report.photos.delete` — delete MinIO objects + null keys for Reports older than 2 y unless `LegalHold(scope: report)`.
  - `session.delete` — `Session` rows older than 30 d (expired/revoked).
  - `dsarExport.delete` — export objects/rows past `exportExpiresAt`.
  - `probeResult.delete` — `ProbeResult` older than 90 d (E17).
  - `tenant.offboarded.purge` — tenants with `status = offboarded` and `offboardedAt < now-30d`: delete Users, Sessions, Products/Batches/Units, Reports, rollups, UsageEvents older than billing retention (24 m) — keep `AuditLog`, `UsageSummary`, `Incident`; unless `LegalHold(scope: tenant)`. Executes in chunks of 5,000 with progress in `RetentionRun`.
  - `consentRecord` and `LegalDocument` — never deleted (they *are* the compliance evidence); documented.
  - `UsageEvent.delete` — older than 24 months (E12 agreed).
- [ ] T7 `RetentionRunner`: BullMQ repeatable nightly 02:00 UTC, per-policy `RetentionRun` rows, dry-run mode that counts only, chunked deletes with `LIMIT`, legal-hold filter, `@Audited('retention.run')` with counts, `retention.executed` events, failure isolation (one policy failing doesn't stop others), `POST /v1/retention/run` for support with mandatory `dryRun` first (server refuses a wet run for a policy that has no dry-run in the last 24 h).
- [ ] T8 Consumer DSAR: `POST /v1/dsar/consumer` → always 202; if `(referenceNumber, sha256(email))` matches an E08 Report with `contactEmail`, create `DsarRequest`, mail `dsar.verify` with 30-min token; `verify` → status `verified` and enqueue; export job assembles JSON bundle `{ reports: [...], consentRecords: [...], scanEventsLinkedToReport: [redacted], legalDocumentsVersionsSeen }` to MinIO with 24 h presigned link, mails `dsar.ready`; erasure job: refuse if `LegalHold`, else null `contactEmail`/`contactPhone`, delete photos, write tombstone `ConsentRecord(granted:false)`, mail `dsar.erased` then discard the address; `dsar.completed`.
- [ ] T9 Tenant DSAR: `POST /v1/dsar/tenant { action: 'export' }` (`owner`) → job calls E03 `TenantExportService.export()` and adds E19's own data (consents, acceptance history, incidents affecting the tenant); download link mailed; `/(console)/compliance/dsar` list. Tenant *erasure* is E03 offboarding + T6 purge — the screen explains this and links to E03's offboarding flow.
- [ ] T10 `docs/compliance/data-map.md`: table per data element — element, where stored (model.field), source, purpose, lawful basis (NDPR/NDPA + UK GDPR article), retention (links T6 policy name), subprocessor, subject type, DSAR exportable/erasable, notes. Covers ScanEvent, Report, User/Session, Tenant KYC docs (E03), notifications, billing (E15 placeholder), logs/traces (E17: 7-day local, hashed identifiers), analytics rollups. Plus the human checklist: NDPC registration, DPAs signed (owner + status), UK representative decision, DPIA summary for the scan-history feature.
- [ ] T11 `docs/compliance/subprocessors.md` + `/legal/subprocessors` page fed from the `subprocessors` LegalDocument kind (structured YAML front-matter in the markdown: name, purpose, data, region, DPA status).
- [ ] T12 Incident register: `IncidentsModule` routes (`support` and affected-tenant `owner` read-only), `assess72h()` sets `ndpcNotifyDeadline = detectedAt + 72h` when severity ≥ high and any personal-data category is involved, timeline append, `incident.opened` event, web-admin `/(platform)/incidents` (support) and `/(console)/compliance/incidents` (tenant read-only of incidents naming them). `docs/runbooks/breach-notification.md`: detection → open incident within 1 h → contain → assess (data categories, subjects, tenants) → NDPC notice ≤ 72 h with template text → affected tenant notice via E14 → consumer notice decision → ICO track for UK data → post-mortem. Includes a tabletop rehearsal script.
- [ ] T13 Cookie-less assertion suite: Playwright `apps/web-verify/e2e/cookieless.spec.ts` walks `/`, `/verify`, `/v/<fixture>` (each verdict), `/legal/*`, `/status`, `/p/<tenant>/<product>` (when E10 lands) and asserts `context.cookies()` is empty and `localStorage`/`sessionStorage` hold no keys; imports E09's `document.cookie` assertion; the cookie policy document states this and the test is linked from it. Any epic adding a cookie to web-verify fails this suite and must update the policy first.
- [ ] T14 Web-admin `/(console)/compliance/retention` (support sees runs across platform; tenant owner sees the schedule read-only and which policies touched their data last night), `/(console)/legal` "Your agreements" (accepted versions, dates, who), nav entries under Settings; Playwright coverage per T15.
- [ ] T15 Playwright: owner re-acceptance interstitial after a `terms` bump; viewer sees banner only; consumer DSAR happy path via Mailpit API (fetch token from the mail, verify, download bundle); erasure blocked by legal hold; support runs dry-run then wet retention and sees counts.

## Acceptance criteria

- [ ] AC1 `docker compose up && pnpm db:seed` → `http://localhost:3000/legal/privacy`, `/legal/terms`, `/legal/aup`, `/legal/cookie`, `/legal/subprocessors` render v1 with version and published date; `curl localhost:4000/v1/legal/privacy | jq .version` → `1`; E09's footer links resolve.
- [ ] AC2 As `support@platform.test` in `http://localhost:3001/legal-docs`, publish `terms` v2 with "requires re-acceptance" on → `legal.document.published` in api logs, Mailpit receives `legal.reaccept` for `owner@ivoryglow.test`; log in as that owner → interstitial at `/legal/reaccept` blocks the console until "Accept"; after accepting, `select * from "TenantAcceptance" where "documentVersion"=2` has a row and `ConsentRecord(purpose: terms_acceptance, documentVersion: 2)` exists; `viewer@ivoryglow.test` sees only a banner; `http://localhost:3000/v/<fixture>` was never affected.
- [ ] AC3 Seed includes ScanEvents dated 200 days ago with `geoCity` set and Sessions 40 days old. `curl -X POST -H "Authorization: Bearer <support>" localhost:4000/v1/retention/run -d '{"dryRun":true}'` → JSON counts per policy, `select count(*) from "ScanEvent" where "geoCity" is not null and "createdAt" < now()-interval '180 days'` unchanged; rerun with `dryRun:false` → that count is `0`, verdict/country/`createdAt` on the same rows intact, old Sessions gone, `RetentionRun` rows for every policy, `AuditLog` action `retention.run` with counts only, `retention.executed` events in logs. A wet run without a prior dry-run in 24 h for a new policy → 409.
- [ ] AC4 Create a `LegalHold(scope: report, ref: <reportId>)` via `POST /v1/legal-holds` as support; set that Report's `createdAt` back 3 years in psql; run `report.photos.delete` wet → photos of the held report still exist in MinIO (`mc ls local/reports/<reportId>/`), others deleted.
- [ ] AC5 Consumer DSAR: submit a report via E08 with `contactEmail: alice@example.test` → `curl -X POST localhost:4000/v1/dsar/consumer -d '{"referenceNumber":"<ref>","email":"alice@example.test","action":"export"}'` → 202; Mailpit shows `dsar.verify`; `POST /v1/dsar/consumer/verify` with the token → 200; within 60 s Mailpit shows `dsar.ready`; following the link downloads a JSON bundle containing the report and consent records and no other subject's data. Same request with a wrong email → 202 and no mail (no enumeration).
- [ ] AC6 Erasure: `action: "erase"` for the same subject, verified → `select "contactEmail" from "Report" where "referenceNumber"='<ref>'` is `null`, photos gone from MinIO, a `ConsentRecord(granted: false)` tombstone exists, `dsar.completed { outcome: 'erased' }` logged; with an active `LegalHold` the outcome is `rejected_legal_hold` and the mail explains a retention obligation without detail.
- [ ] AC7 Tenant export: as owner `POST /v1/dsar/tenant {"action":"export"}` → 202, Mailpit `dsar.ready`, link downloads a zip containing E03's export plus `consents.json`, `acceptances.json`, `incidents.json`; the presigned link returns 403 after `DSAR_EXPORT_TTL_HOURS` (test with `DSAR_EXPORT_TTL_HOURS=0.01`).
- [ ] AC8 Offboarding purge: set tenant `acme` (second seed tenant) to `offboarded` with `offboardedAt = now()-31d`; run `tenant.offboarded.purge` wet → `select count(*) from "Unit" where "tenantId"='<acme>'` = 0, Users/Sessions/Reports 0, `AuditLog` and `UsageSummary` rows for acme remain, `Tenant` row remains with status `offboarded`; ivoryglow untouched.
- [ ] AC9 `pnpm --filter web-verify test:e2e --grep cookieless` passes across all listed routes with zero cookies and empty storage; `docs/compliance/data-map.md` lists every model.field that stores personal data and each links to a retention policy name that exists in `GET /v1/retention/policies` (checked by a unit test that parses the doc).
- [ ] AC10 Incident: as support `POST /v1/incidents {"title":"Test leak","severity":"high","detectedAt":"<now>","dataCategories":["report.contactEmail"],"affectedTenantIds":["<ivoryglow>"]}` → response has `ndpcNotifyRequired: true` and `ndpcNotifyDeadline` = detectedAt + 72 h; incident visible read-only at ivoryglow owner's `/compliance/incidents`; `incident.opened` event logged; runbook `docs/runbooks/breach-notification.md` walk-through completed once and linked in the issue.

## Testing

- **Unit:** `needsReacceptance` matrix (no acceptance / older version / current / non-material bump), consent "latest wins" resolution, subject-ref hashing determinism + salt, retention policy `where` builders per policy against the cutoff, 72-hour deadline computation incl. `ndpcNotifyRequired` rules, DSAR state machine transitions, data-map ↔ policy registry parser test, markdown sanitiser (no script/iframe survives).
- **Integration (real Postgres, MinIO):** each retention policy against seeded fixtures with legal holds; dry-run has zero side effects (row hashes before/after equal); chunked purge of a tenant with 20k units completes and leaves audit/summary rows; DSAR export bundle contents and cross-subject isolation (two consumers, two reports); token expiry; enumeration safety (timing within ±50 ms for match vs no-match); `Session` retention interplay with E02 (an active session is never deleted).
- **Contract:** payload fixtures E19 hands to E08/E14/E03 under `test/contracts/` for `ConsentService.record`, `MailerPort` templates, `TenantAcceptanceService`.
- **E2E (Playwright):** T13 cookie-less suite; T15 flows via Mailpit REST API; axe on `/legal/*`.

## Compose services added

None. Uses E00's `mailpit`, `minio` (new bucket `dsar-exports` added in the existing `mc` init step with 7-day expiry lifecycle) and the `api` worker role for nightly jobs. Adds `CONSENT_SALT` (compose default `dev-consent-salt`), `DSAR_EXPORT_TTL_HOURS`, `RETENTION_CRON`.

## Notes and decisions

- **E03 owns signup acceptance; E19 owns document versions and re-acceptance.** One record type (`TenantAcceptance`, E03) is written by both flows through E03's service; E19 adds a parallel `ConsentRecord(purpose: terms_acceptance)` so all consent evidence is queryable in one place. Agreed boundary — do not duplicate the acceptance table.
- **Consumer verification is never gated on legal acceptance.** Re-acceptance interstitials block the tenant console only; `/v/*` keeps working. A brand's lapse must not read as "counterfeit" to shoppers.
- **Scan history is evidence, geo detail is PII.** Retention keeps verdict, tier, country and counts indefinitely (lawful basis: legitimate interest — anti-counterfeit, documented in the data map with a DPIA summary) and scrubs city and user agent at 180 days. IP is hashed at write by E06, so there is nothing to scrub there; the hash salt rotation procedure (E06/E13) is referenced, not owned.
- **Consumers are identified by salted email hash only.** DSAR lookup requires both the report reference and the email so a leaked reference alone reveals nothing; responses are always 202 to prevent enumeration.
- **Dry-run before wet run is enforced by the server**, not by policy documents. Retention bugs are irreversible.
- **Legal holds win over everything**, including consumer erasure requests (documented exemption: evidence in an active counterfeit investigation; the requester is told a legal obligation applies and given the DPO contact).
- **Incident register ≠ ops alerting.** E17 detects and pages; E19 records, assesses the 72-hour clock and drives regulator/tenant notices. E17's runbook links here.
- **Cookie-less by default is a tested invariant** of web-verify. The cookie policy is therefore short and true; web-admin (which needs a session) is covered by the platform privacy policy, not this test.
- Change requests raised: E03 — `Tenant.offboardedAt`, expose `TenantAcceptanceService.record()` and `TenantExportService.export()`; E14 — templates `dsar.verify`, `dsar.ready`, `dsar.erased`, `legal.reaccept` and the `ConsentService.has(…,'marketing')` gate; E08 — call `ConsentService.record()` for the contact-consent checkbox and expose `Report.referenceNumber` + `contactEmail` lookup; E11 — confirm the `(platform)` route group for support-only screens; E09 — accept `app/legal/**` inside `apps/web-verify`.
