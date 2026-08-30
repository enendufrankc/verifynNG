# E08 — Consumer Fake Reporting

|                 |                                                                                                                                                                                                                        |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Wave            | 2                                                                                                                                                                                                                      |
| Status          | in-progress                                                                                                                                                                                                            |
| Owner           | @enendufrankc                                                                                                                                                                                                          |
| GitHub Issue    | [#9](https://github.com/enendufrankc/verifynNG/issues/9)                                                                                                                                                               |
| Depends on      | E06, E11 (also consumes E13, E14, E07 when available, E19 for consent)                                                                                                                                                 |
| Unblocks        | E09 (renders `ReportForm`), E12 (report counts), E16 (`report.created` webhook), E18 (support view of reports)                                                                                                         |
| Readiness items | `architecture.md` step 10 (consumers report fakes) · mental-model §5 "detection is the product" → enforcement loop · §3 consent records for consumer contact data (NDPR) · §2 per-IP limits on a public write endpoint |

## Goal

When the verify page shows red or amber, the consumer can do something about it. E08 owns the public reporting API (seller, location, channel, photos, optional contact with consent), the anti-abuse fence in front of it (captcha port + E13 quotas), photo ingestion that strips metadata, the `Report` model tied to the scan/unit/batch that triggered it, and the tenant's investigation workflow in web-admin — queue, detail with photos and linked scan/anomaly context, assignment, notes, audited status changes, CSV export — plus the `ReportForm` component E09 drops into the consumer page. Detection becomes evidence; evidence becomes enforcement.

## Scope

**In:** `Report`, `ReportPhoto`, `ReportNote`, `ReportStatusChange`; public endpoints for presigned upload and submission; photo processing worker (type sniffing, size limits, re-encode without EXIF); `CaptchaPort` with Turnstile and fake adapters + `tools/fakes/captcha`; per-IP quotas via E13; reference numbers; consumer acknowledgement/update emails via E14; tenant notification `report.received`; admin API and screens; CSV export; `ReportForm` in `packages/ui`.

**Out:** rendering the verify page and deciding when to show the button (E09 — it mounts `ReportForm` when E06's verdict is `red|amber`), the verdict itself and `ScanEvent` (E06), anomaly rules (E07 — E08 only displays `AnomalyQuery.forUnit`), consent storage semantics and retention purge (E19 — E08 writes a consent record through E19's port and exposes a purge hook), email templates' transport (E14), support cross-tenant triage (E18).

## Owned paths

```
apps/api/src/modules/reports/**                   (public API, admin API, photo worker, captcha port + adapters)
apps/web-admin/app/(console)/reports/**           (replaces E11's EmptyState route group)
packages/ui/src/components/ReportForm/**          (E11 owns packages/ui; this directory is delegated to E08 — noted on E11's issue)
tools/fakes/captcha/**                            (fake Turnstile siteverify service)
packages/db/prisma/schema.prisma                  (additive block: "E08")
docs/reports/**                                   (consumer-flow.md, triage-guide.md, photo-handling.md)
```

## Interfaces

**Consumes**

- E06: `ScanEvent` rows (the verify response includes `scanEventId` — **confirm with E06**; E08's submission takes `scanEventId` and derives `unitId`/`batchId`/`productId`/`verdict` server-side, never trusting the client), `ScanEventRepository.forUnit()` for the detail view.
- E07: `AnomalyQuery.forUnit(unitId)` / `.forBatch(batchId)` for context on the detail page (stubbed to empty until E07 ships).
- E13: `QuotaService.registerKind('reports_per_ip_per_hour', { defaultLimit: 5, window: 'hour' })`, `registerKind('report_uploads_per_ip_per_hour', { defaultLimit: 15, window: 'hour' })`, `assertWithinQuota(tenantId, kind, { key: ipHash })`; `@Audited('report.status.change' | 'report.assign' | 'report.note.add' | 'report.export')`.
- E14: event `report.created` routed to template `report.received` (owners/operators); direct `NotificationService.send('report.consumer_ack', { email }, …)` and `'report.consumer_update'` — **cross-epic request: E14 adds these two consumer templates** to its catalog (E08 supplies copy and data contract).
- E19: `ConsentPort.record({ subjectEmail|Phone, purpose: 'report_contact', tenantId, source: 'report_form', textVersion })` → `consentId`; `RetentionPolicyPort` hook `ReportsRetention.purgeContact(before)` registered so E19's scheduler can strip `contactEmail/contactPhone` after the tenant's retention window. Stub adapter until E19 ships.
- E03: tenant status guard — reporting stays available for `suspended` tenants (consumer safety), blocked for `offboarded`.
- E11: layout, `apiClient`, `nav.config.ts` entry "Reports" with new-count badge, `loginAs(role)`, `packages/ui` primitives; `EmptyState` for zero reports.
- E00: MinIO client (E08 ensures its own buckets at boot), BullMQ, `createTestDatabase()`.

**Exposes**

```ts
// public (unauthenticated, tenant from path, captcha + quota enforced) — CORS allowlist 'verify' (E13)
POST /v1/public/:tenantSlug/reports/upload-url   { contentType: 'image/jpeg'|'image/png'|'image/webp'|'image/heic', sizeBytes ≤ 8_000_000, captchaToken }
                                                 → { photoId, uploadUrl (presigned PUT, 5 min), maxBytes }
POST /v1/public/:tenantSlug/reports              { scanEventId, sellerName?, sellerLocation?, purchaseChannel, purchaseDate?, description?, photoIds[] (≤ 5),
                                                   contact?: { email?, phone?, consent: true }, captchaToken }
                                                 → { reference: 'RPT-7F3K2Q', statusUrl }
GET  /v1/public/:tenantSlug/reports/:reference   → { status, outcome?, updatedAt }   (no PII, no notes)
// admin (tenant-scoped)
GET  /v1/reports?status&outcome&assignedToId&batchId&from&to&q&cursor
GET  /v1/reports/summary                          → { new, triaged, investigating, closed, byOutcome }
GET  /v1/reports/:id                              → report + photos (presigned GET, 10 min) + scan history + anomalies + notes + status history
POST /v1/reports/:id/assign { memberId }          roles owner|operator   @Audited
POST /v1/reports/:id/notes { body }               roles owner|operator   @Audited
POST /v1/reports/:id/status { status, outcome?, note?, notifyConsumer?: boolean }   roles owner|operator   @Audited
GET  /v1/reports/export.csv?…same filters         roles owner|operator   @Audited('report.export')   (no photo URLs, contact only if role owner)

// providers
CaptchaPort { verify(token: string, ip: string): Promise<{ ok: boolean; reason? }> }   // TurnstileCaptcha, FakeCaptcha (calls tools/fakes/captcha)
ReportsQuery.forUnit(unitId) / .forBatch(batchId)          // E07/E12 may show "N consumer reports"
ReportsRetention.purgeContact(before: Date): Promise<number>

// packages/ui
<ReportForm tenantSlug scanEventId verdict apiBaseUrl captchaSiteKey onSubmitted={(ref) => …} locale? />
  // handles upload-url → PUT → submit, client-side image downscale to ≤ 2000px before upload, shows reference on success

// events
'report.created'         { reportId, tenantId, reference, unitId?, batchId?, productId?, verdictAtReport, purchaseChannel, hasPhotos, hasContact }
'report.status.changed'  { reportId, tenantId, reference, from, to, outcome?, actorId }
'report.assigned'        { reportId, tenantId, assignedToId, actorId }

// BullMQ: queue 'reports' job 'photo.process' { photoId }
```

## Data model

```prisma
// E08
model Report {
  id String @id @default(cuid())
  tenantId String
  reference String @unique                 // RPT- + 6 Crockford chars, collision-retried
  scanEventId String?
  unitId String?
  batchId String?
  productId String?
  verdictAtReport String
  sellerName String?
  sellerLocation String?
  purchaseChannel PurchaseChannel
  purchaseDate DateTime?
  description String?                      // ≤ 2000 chars, stripped of control chars
  contactEmail String?
  contactPhone String?
  contactConsentId String?                 // E19 consent record id
  contactPurgedAt DateTime?
  status ReportStatus @default(new)
  outcome ReportOutcome?
  assignedToId String?
  ipHash String
  userAgent String?
  locale String?
  closedAt DateTime?
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  photos ReportPhoto[]
  notes ReportNote[]
  statusChanges ReportStatusChange[]
  @@index([tenantId, status, createdAt])
  @@index([tenantId, batchId])
  @@index([unitId])
  @@index([tenantId, assignedToId])
}
enum PurchaseChannel { open_market street_vendor online_marketplace social_media pharmacy supermarket brand_store other }
enum ReportStatus { new triaged investigating closed }
enum ReportOutcome { confirmed_counterfeit legit insufficient }

model ReportPhoto {
  id String @id @default(cuid())
  tenantId String
  reportId String?                         // null until the report submission claims it
  incomingKey String                       // reports-incoming/{tenantId}/{photoId}
  objectKey String?                        // reports/{tenantId}/{reportId}/{photoId}.jpg after processing
  contentType String
  declaredBytes Int
  storedBytes Int?
  sha256 String?
  width Int?  height Int?
  status PhotoStatus @default(pending)
  rejectReason String?
  ipHash String
  createdAt DateTime @default(now())
  processedAt DateTime?
  @@index([reportId])
  @@index([status, createdAt])             // orphan sweep
}
enum PhotoStatus { pending uploaded processing ready rejected }

model ReportNote { id, tenantId, reportId, authorId, body String, createdAt   @@index([reportId, createdAt]) }
model ReportStatusChange { id, tenantId, reportId, fromStatus ReportStatus?, toStatus ReportStatus, outcome ReportOutcome?, note String?, actorId String, consumerNotified Boolean @default(false), createdAt   @@index([reportId, createdAt]) }
```

Status flow: `new → triaged → investigating → closed(outcome required)`; `closed → investigating` allowed (reopen, audited); any → `closed` allowed for `insufficient`.

## Tasks

- [ ] T1 Migration `E08_reports` with the four models and enums; `ReportsModule` skeleton with `AppModule` import line; env section "E08" (`CAPTCHA_PROVIDER=fake|turnstile`, `TURNSTILE_SECRET`, `FAKE_CAPTCHA_URL=http://fake-captcha:4106`, `REPORT_PHOTO_MAX_BYTES=8000000`, `REPORT_PHOTOS_MAX=5`, `REPORT_INCOMING_TTL_HOURS=24`); boot hook ensuring MinIO buckets `reports-incoming` (lifecycle expiry 1 day) and `reports` (private).
- [ ] T2 `tools/fakes/captcha`: Fastify service on 4106 with `POST /siteverify` (Turnstile response shape; token starting `ok-` → success, `fail-` → `invalid-input-response`, anything else → success after 200 ms), `GET /` page documenting the tokens, `/health`, Dockerfile; compose service entry.
- [ ] T3 `CaptchaPort` + `TurnstileCaptcha` (msw-tested) + `FakeCaptcha`; `CaptchaGuard` reading `captchaToken` from the body; quota kinds registered with E13; `ipHash = sha256(ip + REPORT_IP_SALT)` helper shared with the public routes.
- [ ] T4 Upload flow: `POST …/upload-url` creating a `ReportPhoto(pending)` and presigned PUT with `Content-Length-Range` and content-type conditions; `photo.process` worker triggered on submission: `HEAD` the object, sniff magic bytes (`file-type`), reject on mismatch or > max, `sharp` → re-encode to JPEG quality 85, `withMetadata(false)` (strips EXIF/GPS), max 2000 px, write to `reports/…`, delete incoming, set `ready` + dimensions + sha256. Orphan sweep job hourly for `pending` photos older than TTL.
- [ ] T5 Submission: `POST …/reports` validating DTO (class-validator), captcha, quota, resolving `ScanEvent` → unit/batch/product/verdict (reject if the scan's tenant ≠ path tenant or verdict is green — reports allowed for `red|amber|unknown|decommissioned|flagged` verdicts), claiming `photoIds` owned by the same `ipHash`, writing consent via E19 port when contact given, generating `reference`, enqueuing photo jobs, emitting `report.created`, sending `report.consumer_ack` if email given. Public status endpoint.
- [ ] T6 Admin API: list/summary/detail (presigned GETs, E06 scan history, E07 anomaly context), assign, notes, status with the transition table and `notifyConsumer` → `report.consumer_update`, all `@Audited`; `ReportsQuery` provider; `ReportsRetention.purgeContact`.
- [ ] T7 CSV export: streaming `GET /v1/reports/export.csv` (columns: reference, createdAt, status, outcome, verdict, product, batch, unit, purchaseChannel, sellerName, sellerLocation, assignedTo, photoCount; contact columns only for `owner`), audited once per export with the filter used.
- [ ] T8 `packages/ui` `ReportForm`: steps (details → photos → contact → done), client-side downscale via canvas before upload, progress per photo, consent checkbox with the E19-provided consent text version, Turnstile widget slot (renders the real widget when `captchaSiteKey` is set, otherwise a fake token input for compose), reference display and copy button, i18n-ready strings (en, pidgin placeholder). Storybook story + Vitest component tests. Coordinate with E11 on tokens/primitives.
- [ ] T9 web-admin `(console)/reports/`: queue table (reference, created, status, outcome, product/batch, channel, photos count, assignee), filters + saved views (New / Mine / Confirmed), detail page (photo gallery with lightbox, report fields, linked unit → `/units/:id` (E07), scan history list, anomaly chips, notes thread, assign dropdown of members, status change dialog with outcome + note + "notify consumer" toggle), export button. Nav badge from `/summary.new`. Replaces E11's EmptyState.
- [ ] T10 Notification copy: `report.received` (tenant) data contract to E14; `report.consumer_ack` and `report.consumer_update` templates PR'd into E14's catalog with E08's copy; `docs/reports/consumer-flow.md`, `docs/reports/triage-guide.md`, `docs/reports/photo-handling.md` (what is stripped, why, retention).
- [ ] T11 Dev harness: `POST /v1/_dev/reports/seed` creating 20 reports across statuses with fixture photos for the seeded `ivoryglow` tenant; Playwright fixtures; E2E for AC1, AC5, AC6, AC7.

## Acceptance criteria

- [ ] AC1 On compose, `curl -s localhost:4000/v1/verify/<seeded unknown tier-2 code>` returns a red verdict with `scanEventId`; opening `http://localhost:3000/ivoryglow/v/<code>` (E09; until E09 ships, the Storybook story for `ReportForm` at `pnpm --filter ui storybook` is the demo surface) shows "Report this product"; completing the form with two photos and token `ok-demo` yields a reference `RPT-…`, and `GET localhost:4000/v1/public/ivoryglow/reports/RPT-…` returns `status: new`.
- [ ] AC2 Photo hygiene: upload `apps/api/test/fixtures/photo-with-gps.jpg` through the flow; `mc cat local/reports/ivoryglow/<reportId>/<photoId>.jpg | exiftool -` shows no GPS/EXIF tags, dimensions ≤ 2000 px, and `mc ls local/reports-incoming/ivoryglow/` no longer lists the incoming object. Uploading `fixtures/not-an-image.jpg` (PDF bytes) → photo `rejected: magic_mismatch` and the report submission responds `422 photo_rejected`.
- [ ] AC3 Anti-abuse: token `fail-1` → `403 captcha_failed`; six submissions in a row from one IP with valid tokens → the sixth is `429` with `Retry-After` and `redis-cli KEYS 'quota:ivoryglow:reports_per_ip_per_hour:*'` shows the counter (E13); a submission whose `scanEventId` belongs to another tenant → `404`.
- [ ] AC4 Notifications: after AC1, `http://localhost:8025` contains `report.received` to the owner (with reference and product) and `report.consumer_ack` to the consumer email; `GET /v1/audit?action=report.status.change` is empty until AC5.
- [ ] AC5 Triage: as `loginAs('operator')` at `http://localhost:3001/reports`, open the report, assign to self, add a note, move `new → triaged → investigating → closed` with outcome `confirmed_counterfeit` and "notify consumer" on → consumer receives `report.consumer_update` in Mailpit, detail shows the status history, `GET /v1/audit?targetType=report&targetId=<id>` (E13) lists assign, note, and three status changes; `loginAs('viewer')` sees the detail read-only with no action buttons.
- [ ] AC6 Context: the detail page shows the unit's tier-2 scan history (E06) and, once E07 is on `main`, the open anomaly chips for that unit; linked unit opens `/units/<id>`.
- [ ] AC7 Export: `curl -H "Authorization: Bearer <owner jwt>" 'localhost:4000/v1/reports/export.csv?status=closed' | head` streams CSV with contact columns; the same as `operator` omits them; one `report.export` audit row per call.
- [ ] AC8 Consent + purge: a report with contact writes a consent record (E19, or the stub's in-memory list visible at `GET /v1/_dev/consents`); `POST /v1/_dev/reports/purge-contact?before=<now>` nulls `contactEmail/contactPhone`, sets `contactPurgedAt`, leaves everything else intact.
- [ ] AC9 `fake-captcha` is healthy in `docker compose ps`, and `pnpm test:e2e -g reports` passes against the stack.

## Testing

- Unit: DTO validation, reference generation/collision retry, status transition table, CSV column policy by role, `ReportForm` component tests (step flow, downscale, error states), Turnstile adapter against msw fixtures.
- Integration (real Postgres + Redis + MinIO + fake-captcha): upload-url → PUT → submit → worker → `ready`; magic-byte rejection; EXIF stripping asserted with `exifr`; quota and captcha guards; cross-tenant scanEvent rejection; purge hook; export streaming with 10k rows.
- E2E (Playwright): consumer flow via Storybook/E09 page, triage flow in web-admin with Mailpit assertions, role visibility.
- Never call Cloudflare Turnstile from tests.

## Compose services added

| Service      | Image               | Host port |
| ------------ | ------------------- | --------- |
| fake-captcha | tools/fakes/captcha | 4106      |

MinIO buckets `reports-incoming` (24 h lifecycle) and `reports` are created by the API at boot (idempotent), not by E00's `mc` init.

## Notes and decisions

- The server derives unit/batch/product from the `ScanEvent`; the consumer never posts a code. This keeps tier-2 codes out of report payloads, request logs and audit rows.
- Photos are always re-encoded, never stored as uploaded — the only reliable way to strip EXIF/GPS and neutralise polyglot files. HEIC is accepted at upload and converted; originals are deleted.
- Reports are keyed by `ipHash` (salted) rather than IP; the salt rotates with E13's secrets and old hashes become unlinkable, which is what E19's retention posture wants.
- `ReportForm` lives in `packages/ui` by agreement with E11 so E09 and any future embed (E10 product pages) reuse one component; E08 owns its directory and its tests.
- Reporting remains open for `suspended` tenants: a consumer holding a suspected fake should never be blocked by the brand's billing state (E03 guard exempts `/v1/public/:tenantSlug/reports*`).
