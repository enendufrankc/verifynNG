# E03 — Tenant Lifecycle

| | |
|---|---|
| Wave | 1 |
| Status | todo |
| Owner | — |
| GitHub Issue | [#4](https://github.com/enendufrankc/verifynNG/issues/4) |
| Depends on | E02 (interfaces: `MembershipService.addOwner`, `@Roles`, `@PlatformRole('support')`, `TenantContextGuard`), E00 |
| Unblocks | E15 (plan/suspension hooks), E18 (support review UI extends this queue), E19 (offboarding deletion honours retention), E09/E10 (branding settings) |
| Readiness items | `production-readiness.md` §8 all rows (onboarding, identity verification, suspension/reactivation, offboarding) · §3 "Acceptable Use Policy", "Privacy policy + ToS" acceptance records · `architecture.md` step 6 |

## Goal

A business can sign itself up, upload the documents that prove it is a real brand (CAC certificate, trademark certificate, director ID), and wait in a review queue; a platform-support user approves or rejects it; only an `active` tenant can mint. Tenants can be suspended (consumers keep verifying, the console goes read-only), reactivated, and offboarded (export ZIP, then scheduled deletion). Every tenant has recorded, versioned acceptance of the AUP and ToS. This is the gate the whole trust story depends on: a platform that would authenticate a counterfeiter's goods is worse than no platform, and IVORY GLOW's trademark `NG/TM/O/2020/11950` is the model artifact for what "verified" means.

## Scope

**In:** self-serve signup that creates a `pending` tenant, business-verification document upload to MinIO, support review queue (approve / reject with reason / request more documents), tenant status state machine with a guard other epics inherit, AUP/ToS versioned documents and acceptance records (at signup and re-prompt on version bump), suspension/reactivation with reason, offboarding with data export ZIP and BullMQ-scheduled deletion, tenant settings (name, legal name, trademark number, country, branding placeholders), tenant events, the onboarding wizard and the support review screens in web-admin, the `settings/organization` page.

**Out:** user accounts and roles (E02), billing-triggered suspension (E15 calls `TenantLifecycleService.suspend(reason:'billing')`), the retention rules the deletion job applies (E19 provides `RetentionPolicy`; E03 ships an allow-all default), support impersonation and ticketing (E18), what the branding placeholders render as (E09/E10), audit trail persistence (E13 subscribes to `tenant.*`), the admin shell/nav the screens plug into (E11), email templates (E14 — E03 sends via the `MAILER` token E02 already binds).

## Owned paths

```
apps/api/src/modules/tenants/**                       (TenantsModule: lifecycle, settings, verification, policies, offboarding)
apps/api/src/common/tenant-status/**                  (TenantStatusGuard, @AllowWhenSuspended(), @RequireTenantStatus())
apps/api/src/jobs/tenant-offboarding.processor.ts     (BullMQ queue "tenant-offboarding")
apps/web-admin/app/(onboarding)/**                    (signup wizard: account → business → documents → policies → pending screen)
apps/web-admin/app/(console)/settings/organization/** (tenant settings; E11 owns settings/ shell + other sub-pages)
apps/web-admin/app/(console)/support/tenant-review/** (support queue; E18 owns the rest of support/)
packages/db/prisma/schema.prisma                      (additive block: "E03")
packages/db/prisma/seed/policies.ts                   (AUP v1, ToS v1 seed text)
packages/config/src/env.ts                            (section "E03": S3_*, OFFBOARDING_GRACE_DAYS, POLICY_*)
docs/tenant-lifecycle.md
```

## Interfaces

**Consumes**
- E02: `MembershipService.addOwner(userId, tenantId)`, `@Roles('owner')`, `@PlatformRole('support')`, `@TenantId()`, `@Principal()`, `TenantContextGuard` (already resolves `tid` from the JWT; E03 makes `POST /auth/switch-tenant` meaningful for a fresh tenant by creating the membership before returning).
- E00: `Tenant` base model (`status` enum already exists), `prisma`, compose `minio` (S3 at `minio:9000`, bucket `verifyng`), `redis` for BullMQ.
- E14 (interface only): `MAILER` token for `tenant-verified`, `tenant-rejected`, `tenant-suspended`, `tenant-offboarding-scheduled` mails.
- E19 (interface only): `RetentionPolicy { scanEventsDays: number; consumerPiiDays: number; tenantDataAfterOffboardDays: number }` under Nest token `RETENTION_POLICY`; E03 provides a default `{ 3650, 30, 30 }` until E19 replaces it.
- E04 (soft): the `api-worker` compose service E04 adds runs E03's processor too; until it exists, `WORKER_INLINE=true` runs the processor in the api process.

**Exposes**

Nest providers (exported from `TenantsModule`):
```ts
TenantLifecycleService
  create({ ownerUserId, name, legalName, country }): Tenant                   // status pending, adds owner membership, emits tenant.created
  submitForReview(tenantId): void                                             // pending → in_review (all required docs present + policies accepted)
  approve(tenantId, by): void                                                 // in_review → active, emits tenant.verified
  reject(tenantId, by, reason, canResubmit: boolean): void                    // in_review → rejected | pending
  suspend(tenantId, { by, reason: 'billing' | 'aup' | 'security' | 'manual', note? }): void   // active → suspended
  reactivate(tenantId, by): void                                              // suspended → active
  offboard(tenantId, by): void                                                // active|suspended → offboarded, enqueues export + deletion
TenantSettingsService.get(tenantId) / update(tenantId, patch)
TenantBrandingService.get(tenantId): Branding                                 // { displayName, logoUrl?, primaryColor?, accentColor?, supportEmail?, supportPhone?, websiteUrl? } — E09/E10 read this
PolicyService.currentVersions(): { aup: string; tos: string }; pendingAcceptances(userId, tenantId): PolicyKind[]
TenantStatusGuard (global APP_GUARD, after E02's guards)
  // Rule applied to every route that has tenant context and is not @Public():
  //   pending | in_review | rejected → only routes tagged @RequireTenantStatus('pending') (onboarding, settings read) are allowed; others 403 { error: 'tenant_not_active' }
  //   suspended → GET allowed; POST/PUT/PATCH/DELETE → 403 { error: 'tenant_suspended' } unless @AllowWhenSuspended()
  //   offboarded → everything 410 { error: 'tenant_offboarded' } except GET /tenants/:id/export
  //   active → pass
  // Public verify routes (E06) are @Public() and never see this guard: consumers keep verifying a suspended tenant's units.
@AllowWhenSuspended()        // e.g. E15 payment-method update, E02 member removal
@RequireTenantStatus(...statuses)
```

HTTP routes:
```
POST   /tenants                                  { name, legalName, country, acceptPolicies: { aup: version, tos: version } }   authenticated user, no tenant context → 201 { tenant, accessToken, refreshToken } (tokens re-issued with tid)
GET    /tenants/:tenantId                                                              @Roles('viewer')   → tenant + status + verification summary
PATCH  /tenants/:tenantId/settings               { name?, legalName?, trademarkNumber?, country?, branding? }   @Roles('owner')  @RequireTenantStatus('pending','in_review','rejected','active')   (suspended tenants are read-only)
GET    /tenants/:tenantId/verification                                                 @Roles('owner')   → { status, documents[], required[], reviewNotes[] }
POST   /tenants/:tenantId/verification/documents { kind, fileName, contentType, size }  @Roles('owner')   → { documentId, uploadUrl (S3 presigned PUT, 10 min) }
POST   /tenants/:tenantId/verification/documents/:id/complete                          @Roles('owner')   → marks uploaded, virus-scan hook no-op, 400 if object missing
DELETE /tenants/:tenantId/verification/documents/:id                                   @Roles('owner')   (only while pending/rejected)
POST   /tenants/:tenantId/verification/submit                                          @Roles('owner')   → in_review
GET    /tenants/:tenantId/policies                                                     @Roles('viewer')  → current versions + this user's acceptances + pending[]
POST   /tenants/:tenantId/policies/accept        { kind: 'aup' | 'tos', version }      @Roles('owner')   @AllowWhenSuspended()
POST   /tenants/:tenantId/offboard               { confirmSlug }                       @Roles('owner')   @AllowWhenSuspended()
GET    /tenants/:tenantId/export                                                       @Roles('owner')   → { status, downloadUrl? (signed, 24 h), scheduledDeletionAt }

GET    /support/tenants?status=in_review                                               @PlatformRole('support') → queue, oldest first
GET    /support/tenants/:tenantId/verification                                          @PlatformRole('support') → documents with signed GET URLs (5 min)
POST   /support/tenants/:tenantId/approve                                              @PlatformRole('support')
POST   /support/tenants/:tenantId/reject         { reason, canResubmit }               @PlatformRole('support')
POST   /support/tenants/:tenantId/suspend        { reason, note }                      @PlatformRole('support')
POST   /support/tenants/:tenantId/reactivate                                           @PlatformRole('support')
GET    /policies/:kind/current                                                         @Public() → { version, effectiveFrom, markdown }
```

Domain events:
```ts
'tenant.created'      { tenantId, slug, ownerUserId, country, at }
'tenant.submitted'    { tenantId, documentKinds: string[], at }
'tenant.verified'     { tenantId, by, at }
'tenant.rejected'     { tenantId, by, reason, canResubmit, at }
'tenant.suspended'    { tenantId, by, reason, note?, at }
'tenant.reactivated'  { tenantId, by, at }
'tenant.offboarded'   { tenantId, by, scheduledDeletionAt, at }
'tenant.exported'     { tenantId, objectKey, sizeBytes, at }
'tenant.deleted'      { tenantId, at }
'policy.accepted'     { tenantId, userId, kind, version, at }
```

BullMQ queue `tenant-offboarding`: jobs `export` (immediate) and `delete` (delayed `OFFBOARDING_GRACE_DAYS`, default 30; `RetentionPolicy.tenantDataAfterOffboardDays` overrides).

## Data model

```prisma
// ─── E03 ───────────────────────────────────────────────────────────────
// Tenant (E00) — E03 adds fields and extends the status enum:
//   enum TenantStatus { pending in_review rejected active suspended offboarded }
//   slug is assigned from name (kebab, unique, immutable after tenant.verified — it appears in printed codes)
model Tenant {
  legalName          String?
  trademarkNumber    String?
  country            String?     @db.Char(2)
  statusReason       String?
  statusChangedAt    DateTime?
  verifiedAt         DateTime?
  suspendedAt        DateTime?
  offboardedAt       DateTime?
  scheduledDeletionAt DateTime?
  branding           Json?       // Branding shape above; validated by zod in TenantBrandingService
  supportEmail       String?
  websiteUrl         String?
}

enum VerificationDocumentKind { cac_certificate trademark_certificate director_id other }
enum VerificationDocumentStatus { awaiting_upload uploaded accepted rejected }

model VerificationDocument {
  id          String   @id @default(cuid())
  tenantId    String
  kind        VerificationDocumentKind
  status      VerificationDocumentStatus @default(awaiting_upload)
  objectKey   String   @unique         // tenants/{tenantId}/verification/{documentId}/{fileName}
  fileName    String
  contentType String
  sizeBytes   Int
  uploadedBy  String
  reviewedBy  String?
  reviewNote  String?
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  @@index([tenantId, kind])
}

model TenantReviewNote {                // support ↔ tenant thread on a verification
  id        String   @id @default(cuid())
  tenantId  String
  authorId  String
  visibleToTenant Boolean @default(true)
  body      String
  createdAt DateTime @default(now())
  @@index([tenantId, createdAt])
}

enum PolicyKind { aup tos privacy }
model PolicyDocument {
  id            String     @id @default(cuid())
  kind          PolicyKind
  version       String                 // "2026-08-01"
  markdown      String
  effectiveFrom DateTime
  createdAt     DateTime   @default(now())
  @@unique([kind, version])
}

model PolicyAcceptance {
  id         String     @id @default(cuid())
  tenantId   String
  userId     String
  kind       PolicyKind
  version    String
  ipPrefix   String?
  userAgent  String?
  acceptedAt DateTime   @default(now())
  @@unique([tenantId, kind, version])
  @@index([tenantId])
}

model TenantExport {
  id          String    @id @default(cuid())
  tenantId    String
  status      String                     // queued | running | done | failed
  objectKey   String?                    // tenants/{tenantId}/exports/{exportId}.zip
  sizeBytes   Int?
  error       String?
  createdAt   DateTime  @default(now())
  completedAt DateTime?
  @@index([tenantId])
}
```

## Tasks

- [ ] T1 Schema + migration `E03_tenant_lifecycle`: enum extension (Postgres `ALTER TYPE … ADD VALUE`), Tenant fields, new models; env section (`S3_ENDPOINT=http://minio:9000`, `S3_BUCKET=verifyng`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`, `S3_FORCE_PATH_STYLE=true`, `OFFBOARDING_GRACE_DAYS=30`); `S3Client` provider (`@aws-sdk/client-s3` + presigner) exported for E04/E05/E19 to reuse under token `S3`.
- [ ] T2 Seed `PolicyDocument` AUP v`2026-08-01` and ToS v`2026-08-01` from `prisma/seed/policies.ts` (short real text: no authenticating goods you do not own the mark for; platform may suspend on evidence of counterfeiting); `GET /policies/:kind/current`.
- [ ] T3 `TenantLifecycleService.create` + `POST /tenants`: slug generation, owner membership via E02, policy acceptance rows, tokens re-issued with `tid`; `tenant.created` event; `pnpm db:seed` moves `ivoryglow` to `active` with `trademarkNumber=NG/TM/O/2020/11950`, `legalName=Tunnel Light Global Concept Ltd`, `country=NG`.
- [ ] T4 `TenantStatusGuard` + decorators, registered as global guard; table-driven unit tests for every (status × method × decorator) cell; `docs/tenant-lifecycle.md` explains what other epics get for free.
- [ ] T5 Verification documents: presigned PUT flow, `complete` verifies the object exists (`HeadObject`) and size ≤ 10 MB and content-type ∈ {pdf, png, jpeg}; required set = `cac_certificate` + `director_id` (+ `trademark_certificate` optional but shown as "strongly recommended"); `submit` → `in_review`.
- [ ] T6 Support queue API: list/approve/reject/suspend/reactivate with `TenantReviewNote`; `tenant.verified|rejected|suspended|reactivated` events; mails via `MAILER`.
- [ ] T7 Settings + branding: `PATCH /tenants/:id/settings` with zod-validated `branding` (hex colours, https URLs, logo must be an object key under `tenants/{tenantId}/branding/` uploaded via the same presigned flow); slug immutable after verification.
- [ ] T8 Offboarding: `POST /tenants/:id/offboard` → status `offboarded`, enqueue `export` then `delete` (delayed); export processor streams Products/Oems/Batches/Units (hashes only, never raw tier-2)/ScanEvents/Members/AuditLog rows as NDJSON into a ZIP in MinIO; `GET /tenants/:id/export` with signed URL; deletion processor deletes tenant-owned rows in FK order and MinIO prefix `tenants/{tenantId}/`, respecting `RetentionPolicy` (scan events older than policy are dropped, newer are kept anonymised — E19 may tighten); `tenant.exported`, `tenant.deleted` events.
- [ ] T9 Policy version bump: when `PolicyDocument` gets a newer version, `pendingAcceptances()` is non-empty; `TenantStatusGuard` returns 403 `{ error: 'policy_acceptance_required', pending: [...] }` for owner writes until accepted (viewers/operators unaffected).
- [ ] T10 web-admin `(onboarding)` wizard: create account (E02 routes) → business details → document uploads (direct-to-MinIO presigned PUT with progress) → AUP/ToS checkboxes → "pending review" screen that polls `GET /tenants/:id`; rejected state shows reason and lets the owner replace documents and resubmit.
- [ ] T11 web-admin `(console)/support/tenant-review`: queue table (E11 `DataTable`), detail drawer with document viewer (signed GET URLs), approve/reject/suspend/reactivate actions with reason dialog; registers nav entry `support.tenantReview` for `platformRole=support` only.
- [ ] T12 web-admin `(console)/settings/organization`: settings + branding form (react-hook-form + zod from E11), suspended banner (read-only), offboard danger zone with slug confirmation and export download.
- [ ] T13 Isolation spec `apps/api/test/isolation/E03.isolation.spec.ts` using E02's harness for every `/tenants/:tenantId/*` route; E2E flows below.

## Acceptance criteria

- [ ] AC1 Self-serve signup end-to-end: `http://localhost:3001/signup` → account → business "Test Brand Ltd" (NG) → upload a PDF as CAC and a PNG as director ID → accept AUP + ToS → "Pending review". `docker compose exec postgres psql -U verifyng -c "select slug,status from \"Tenant\" where slug='test-brand-ltd'"` → `in_review`. `mc ls local/verifyng/tenants/<id>/verification/` lists two objects.
- [ ] AC2 Pending tenant cannot mint: as the new owner, `curl -X POST localhost:4000/tenants/<id>/batches -H "Authorization: Bearer $AT"` (E04's route, or any non-onboarding POST) → 403 `tenant_not_active`; `GET /tenants/<id>` → 200.
- [ ] AC3 Support approval: login as `support@verifyng.local` at `http://localhost:3001/support/tenant-review`, open "Test Brand Ltd", view both documents inline, click Approve → tenant `active`; Mailpit (`http://localhost:8025`) shows "Your business is verified" to the owner; `docker compose logs api | grep tenant.verified` shows the event.
- [ ] AC4 Rejection with resubmit: reject another pending tenant with reason "CAC certificate illegible", `canResubmit=true` → owner's wizard shows the reason, allows replacing the document and resubmitting → back to `in_review`.
- [ ] AC5 Suspension semantics: `POST localhost:4000/support/tenants/<ivoryglow>/suspend {"reason":"manual","note":"test"}` → owner `GET /tenants/<id>/batches` → 200, `POST /tenants/<id>/batches` → 403 `tenant_suspended`, and `curl localhost:4000/v1/verify/<any ivoryglow tier-1 code>` (E06) → 200 with a verdict. `POST …/reactivate` → minting POST works again.
- [ ] AC6 Policy bump: insert `PolicyDocument(kind=tos, version='2026-09-01')` via `pnpm db:seed --policies-bump` (seed flag) → owner's next PATCH → 403 `policy_acceptance_required`; console shows the acceptance modal; accept → PATCH succeeds; `PolicyAcceptance` row has `version='2026-09-01'`.
- [ ] AC7 Offboarding: `POST /tenants/<test-brand>/offboard {"confirmSlug":"test-brand-ltd"}` → 202; within 30 s `GET /tenants/<id>/export` → `downloadUrl`; `curl -o export.zip "$URL" && unzip -l export.zip` lists `products.ndjson units.ndjson scan_events.ndjson members.ndjson …`; `scheduledDeletionAt` ≈ now + 30 d; with `OFFBOARDING_GRACE_DAYS=0` in the compose override the `delete` job runs and `select count(*) from "Unit" where tenant_id='<id>'` → 0 and `mc ls local/verifyng/tenants/<id>/` is empty; `tenant.deleted` logged.
- [ ] AC8 Isolation: `pnpm --filter @verifyng/api test test/isolation/E03` passes — tenant A's owner gets 404 on every `/tenants/<B>/…` route including verification document URLs, and support routes return 403 to non-support users.

## Testing

- Unit: status state machine (every legal and illegal transition), `TenantStatusGuard` decision table, slug generation/immutability, branding zod schema, required-documents rule.
- Integration (real Postgres + real MinIO via compose or testcontainers): presigned upload → complete → submit; approve/reject; suspend blocks writes but not reads; policy bump gating; export ZIP contents and deletion job in FK order; `RetentionPolicy` default honoured.
- Isolation: harness spec for all tenant routes.
- E2E (Playwright): signup-to-pending wizard; support approve flow; suspended banner + disabled mint button in settings; offboard confirmation and export download link appears.

## Compose services added

None. Uses `minio` (9000/9001), `mailpit`, `redis` from E00 and the `api-worker` service from E04 (until then `WORKER_INLINE=true`). Adds bucket policy note: `verifyng` bucket stays private; all downloads are presigned.

## Notes and decisions

- Status enum gains `in_review` and `rejected` beyond E00's four values so the review queue has explicit states; E00's base enum is extended additively in E03's migration.
- Verification is human-reviewed by design. Automated CAC lookups may come later (E18) but the AUP gate is a judgement call about trademark ownership, not a checkbox.
- Suspended = read-only console, live verification. This is deliberate: a brand's payment failure must never make a consumer see "counterfeit".
- Export never contains raw tier-2 codes (only hashes) — the tenant already received them via E04/E05 manifests; re-exporting them at offboarding would create a second leak surface.
- The `S3` provider lives here because E03 is the first wave-1 epic that needs object storage; E04 and E05 import it rather than re-creating a client.
