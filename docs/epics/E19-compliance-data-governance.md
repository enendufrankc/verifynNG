# E19 — Compliance & Data Governance

|                 |                                                                                                                                                                                                                                                                                                                                                   |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Wave            | 2                                                                                                                                                                                                                                                                                                                                                 |
| Status          | in-progress                                                                                                                                                                                                                                                                                                                                       |
| Owner           | @enendufrankc                                                                                                                                                                                                                                                                                                                                     |
| GitHub Issue    | [#20](https://github.com/enendufrankc/verifynNG/issues/20)                                                                                                                                                                                                                                                                                        |
| Depends on      | E02 (users, sessions, roles), E06 (ScanEvent fields and hashing), E03 (tenant status, signup acceptance records, tenant export), E13 (`@Audited`, AuditLog), E14 (`MailerPort` for DSAR verification mail; marketing/transactional split), E08 (Report + contact consent), E09 (web-verify app hosts `/legal/**`), E11 (admin shell, `loginAs`)   |
| Unblocks        | E15 (billing needs accepted ToS version before charging), E18 (incident register, DSAR queue in support), E03 offboarding purge (executes E19 policy)                                                                                                                                                                                             |
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

- [x] T1 Module scaffolds (`LegalModule`, `ConsentModule`, `RetentionModule`, `DsarModule`, `IncidentsModule`, one import line each), E19 schema block + migration `E19_compliance`, env section (`CONSENT_SALT`, `DSAR_EXPORT_TTL_HOURS=24`, `RETENTION_CRON=0 2 * * *`, `RETENTION_DRY_RUN_DEFAULT=false`, `DSAR_EXPORT_BUCKET=dsar-exports`), MinIO bucket init in `mc` step with 7-day lifecycle expiry.
- [x] T2 `LegalDocumentService` + routes + seed: `content/legal/{privacy,terms,aup,cookie,subprocessors}/en.md` v1 written for real (platform operator = Tunnel Light Global Concept Ltd; covers IP/geo/device collection on scan pages, lawful basis legitimate interest for anti-counterfeit, retention periods from T6, NDPC and ICO contact routes, subprocessors Resend/Termii/Paystack/MaxMind/hosting placeholder); `pnpm db:seed` publishes v1 of each; `legal.document.published` event; platform-support authoring screen at `/legal-docs` with markdown preview and "requires re-acceptance" toggle.
- [x] T3 Public pages `apps/web-verify/app/legal/[kind]/page.tsx` (+ `/legal/subprocessors`): SSR from `GET /v1/legal/:kind`, markdown → sanitised HTML, version + published date + "previous versions" list, `revalidate = 3600`, print stylesheet. Not done: locale via E09 `t()` (E09 doesn't exist yet — plain `en`-only rendering instead), explicit `platform-branded` styling from `packages/ui` tokens, explicit `robots` meta (Next defaults to allowed, not verified).
- [x] T4 Tenant re-acceptance: `needsReacceptance()` comparing E03's `PolicyAcceptance` to current `terms|aup` versions; web-admin interstitial at `/(console)/legal` (guard component `policy-reaccept-guard.tsx`, wired into `(console)/layout.tsx`) shown for `owner` (operators/viewers see a banner only; verify is never affected — not re-tested against a `/v/<fixture>` since E06/E09 verify pages don't exist yet); `POST /v1/legal/policies/accept` writes via E03's `TenantLifecycleService.acceptPolicy()` + `ConsentRecord`; `legal.reaccept` mail on publish via a new `LegalReacceptListener`. Verified live end-to-end (see issue comment).
- [x] T5 `ConsentService` + `POST /v1/consent`, `GET /v1/consent/me`. Not done: the E08/E14 wire-in PRs and `test/contracts/` fixtures (E08 doesn't exist yet to wire into; E14's `NotificationService.send()` marketing-consent gate not added — no current caller to gate).
- [x] T6 Retention policies (code, `apps/api/src/modules/retention/policies/*.ts`) and `docs/compliance/retention-schedule.md`:
  - `scanEvent.geoCity.scrub` — set `geoCity = null` where `createdAt < now-180d` (ip already hashed at write by E06; verdict/tier/country/counts kept indefinitely as anti-counterfeit evidence).
  - `scanEvent.userAgent.scrub` — null `userAgent` after 180 d.
  - `report.photos.delete` — registered as a no-op; E08 has no `Report` model yet, nothing to delete.
  - `session.delete` — `Session` rows older than 30 d (expired/revoked), never an active session. Verified live.
  - `dsarExport.delete` — export objects/rows past `exportExpiresAt`.
  - `probeResult.delete` — `ProbeResult` older than 90 d (E17).
  - `tenant.offboarded.purge` — tenants with `status = offboarded` and `offboardedAt < now-30d`: delegates to E03's `TenantOffboardingProcessor.runDelete()` (Products/Batches/Units/ScanEvents/storage) then additionally purges Users/Sessions/Memberships (which that processor doesn't touch) — keeps `AuditLog`, `UsageSummary`, `Incident`, the `Tenant` row; unless `LegalHold(scope: tenant)`. Verified live with a manually-fixtured second tenant. Not done: chunking in batches of 5,000 (no batch this large has been exercised).
  - `consentRecord` and `PolicyDocument`/`PolicyAcceptance` — never deleted (they _are_ the compliance evidence); documented.
  - `usageEvent.delete` — registered as a no-op; E12 has no `UsageEvent` model yet.
- [x] T7 `RetentionRunner`: per-policy `RetentionRun` rows, dry-run mode that counts only, `@Audited('retention.run')` with counts, `retention.executed` events, failure isolation, `POST /v1/retention/run` for support with mandatory `dryRun` first (409 otherwise) — all verified live. `RetentionScheduler` registers a nightly BullMQ repeatable job (`upsertJobScheduler`, BullMQ 6.x's replacement for the old `add(...,{repeat})` API) but the nightly firing itself hasn't been observed (would take 24h+ of real time). Not done: chunked deletes with `LIMIT` (no policy here needs it yet at seed-data volumes).
- [x] T8 Consumer DSAR: `DsarService`/`DsarProcessor` fully implement request/verify/download/erase against a `ReportLookupPort` interface with a `NullReportLookupAdapter` default (always "no match" — also the enumeration-safe default). **Genuinely blocked**: E08 has shipped no `Report` model on `main`, so there is no real adapter and this cannot be exercised end-to-end with real data. Logic verified by unit tests with a fake matching adapter (request → verify → correct token rejection → download URL), not by a live E08-backed flow.
- [x] T9 Tenant DSAR: `POST /v1/dsar/tenant { action: 'export' }` (`owner`) → delegates to E03's `TenantOffboardingProcessor.runExport()` (there is no standalone `TenantExportService` — that method is the actual export writer) and adds a sibling `consents.json`/`acceptances.json` object (not merged into the same zip); download link mailed; `/(console)/compliance/dsar` list. Verified live end-to-end including mail delivery and the MinIO objects. Tenant _erasure_ is E03 offboarding + T6 purge — the screen explains this.
- [x] T10 `docs/compliance/data-map.md`, parsed by a unit test against the live policy registry.
- [x] T11 `docs/compliance/subprocessors.md` + `/legal/subprocessors` page. Not done: structured YAML front-matter parsing (T11's page renders the same as any other `/legal/:kind` page — plain markdown, not a structured table read from front-matter).
- [x] T12 Incident register: `IncidentsModule` (`support` full CRUD, tenant `owner`/`operator`/`viewer` read-only at `GET /v1/incidents/mine`), `assess72h()`/`open()` set `ndpcNotifyDeadline = detectedAt + 72h` for severity ≥ high with a non-empty `dataCategories`, timeline append, `incident.opened` event, web-admin `/incidents` (support) and `/compliance/incidents` (tenant read-only). `docs/runbooks/breach-notification.md` written including a tabletop script; the script has not actually been walked through and posted to the issue yet (AC10's evidence below covers the API-level checks, not the full document walkthrough).
- [x] T13 Cookie-less assertion suite: `tests/e2e/cookieless.spec.ts` (this repo's actual Playwright convention is `tests/e2e/`, not `apps/web-verify/e2e/`) walks `/`, `/status`, `/legal/*` — `/verify`, `/v/<fixture>`, `/p/<tenant>/<product>` don't exist yet (E06/E09/E10). Passes; skips itself on the `web-admin-desktop` project.
- [x] T14 Web-admin `/compliance/retention` (support only — the tenant-owner simplified read-only view is **not built**), `/compliance/dsar` (owner), `/compliance/incidents` (tenant read-only), `/legal` "Your agreements", nav entries. Playwright coverage per T15 not written (see T15).
- [ ] T15 Playwright: owner re-acceptance interstitial and viewer banner verified live via curl, not via Playwright. Consumer DSAR / legal-hold-blocked-erasure Playwright flows not written (blocked on E08 same as T8). Support dry-run/wet-run retention Playwright flow not written (verified live via curl instead).

## Acceptance criteria

- [x] AC1 Verified (evidence on issue #20). Sub-item not verified: "E09's footer links resolve" — E09 doesn't exist yet, no footer to check.
- [x] AC2 Verified live end-to-end (evidence on issue #20): publish `terms` v2 with `requiresReacceptance` → `legal.reaccept` mail in Mailpit → owner blocked (403 `policy_acceptance_required`) → accept via `POST /v1/legal/policies/accept` → `PolicyAcceptance` + `ConsentRecord(purpose: terms_acceptance)` rows exist → guard clears → operator never blocked, sees the same pending list for its banner. (Route names differ from the epic's literal text — `/policies/accept` not `/legal/accept`, forced by E03's `TenantStatusGuard` hardcoding that suffix; see commit history.)
- [x] AC3 Verified live end-to-end with manually-inserted fixtures (a 200-day-old ScanEvent with `geoCity` set, a 40-day-old expired Session) — evidence on issue #20: dry run counts correctly without mutating; wet run scrubs `geoCity` (verdict/country/tier intact), deletes the session, leaves the append-only trigger re-enabled; `RetentionRun` rows for all 8 policies; `AuditLog` action `retention.run` now recorded (found and fixed two bugs in the process — see commit history); wet run without a fresh dry run → 409.
- [ ] AC4 **Blocked on E08** — `report.photos.delete` is a no-op with no `Report` model to hold. `LegalHold` create/release/`isHeld()` verified by unit tests only, not demonstrated against a real report.
- [ ] AC5 **Blocked on E08** — no `Report` model exists to look up a consumer's submission against. `DsarService.requestConsumer/verifyConsumer` logic verified by unit tests with a fake matching `ReportLookupPort`, not a live E08-backed flow.
- [ ] AC6 **Blocked on E08**, same reason as AC5.
- [x] AC7 Verified live end-to-end (evidence on issue #20): export completes, `dsar.ready` mail delivered with a working download link, MinIO objects present (main zip + `consents.json`/`acceptances.json` supplement, not merged into one bundle as the epic's literal text describes — see T9). Not verified: the `DSAR_EXPORT_TTL_HOURS=0.01` expiry-returns-403 sub-check.
- [x] AC8 Verified live end-to-end with a manually-fixtured second tenant (`acme`, evidence on issue #20): dry run then wet `tenant.offboarded.purge` → Units/Users/Sessions/Memberships all 0 for acme, `Tenant` row remains `offboarded`, `AuditLog` rows for acme untouched; `ivoryglow` fully unaffected (3 products, 3 users, active status).
- [x] AC9 Verified: `tests/e2e/cookieless.spec.ts` passes for all listed routes (script name/path differs from the epic's literal text — see T13); `data-map.spec.ts` parses `docs/compliance/data-map.md` against the live policy registry and passes.
- [x] AC10 Verified live end-to-end (evidence on issue #20): `ndpcNotifyRequired: true`, `ndpcNotifyDeadline` = `detectedAt` + 72h exactly; visible read-only at the ivoryglow owner's `GET /v1/incidents/mine`. Not done: the runbook tabletop walkthrough hasn't actually been performed and posted as its own artifact (the runbook document exists and includes the script).

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
