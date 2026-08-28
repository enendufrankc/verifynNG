# E05 — OEM Manifest Delivery

| | |
|---|---|
| Wave | 2 |
| Status | todo |
| Owner | — |
| GitHub Issue | [#6](https://github.com/enendufrankc/verifynNG/issues/6) |
| Depends on | E04, E14 (also consumes E02, E13) |
| Unblocks | E07 (dead-code and pre-reveal rules need batch status + `expectedShipDate`), E16 (`batch.printed` webhook) |
| Readiness items | `architecture.md` step 5 (codes must reach the factory safely) · mental-model §5 "OEM code sharing" · §1 service-to-service / OEM endpoints carry tenant context (P1) |

## Goal

The brand never emails a spreadsheet of codes to a factory. An owner *delivers* a minted batch to a verified OEM: the platform re-signs E04's manifest for that OEM and delivery, hands the OEM a short-lived download link by email, records every download with IP, and waits for the OEM to come back with a receipt hash computed over what was actually printed. Match → batch `printed`; OEM marks it `shipped` with shipment metadata. Mismatch → alert, batch stays `delivered`. Every step is audited and every code in the receipt is checked for the batch watermark, so a leak is attributable and a swap is detectable. This is milestone 2 of the mental model and the step that makes the "verified OEM" claim true.

## Scope

**In:** `OemUser` (external party login, role `oem`, scoped to one `Oem`), delivery flow and records, per-OEM manifest re-signing and encrypted storage, tokenised short-lived download URLs, download log, receipt submission + verification (hash + count + watermark set), batch state machine `minted → delivered → printed → shipped → closed`, shipment record, `expectedShipDate` capture, OEM portal in web-admin, tenant-side deliveries screen, `pnpm oem:receipt` CLI, audit via E13, notifications via E14.

**Out:** minting and the original encrypted manifest object (E04), QR artwork rendering (E04 — E05 links to E04's artwork zip), auth primitives and MFA (E02 — E05 only adds the `oem` role value and a scope guard), anomaly rules consuming batch status (E07), public webhooks for `batch.printed` (E16), OEM onboarding/KYC (E03 handles tenant KYC; OEM verification is a tenant-owner attestation in this epic — see Notes).

## Owned paths

```
apps/api/src/modules/oem-manifest/**              (deliveries, downloads, receipts, shipments, batch state machine, OemScopeGuard)
apps/web-admin/app/(console)/deliveries/**        (tenant side: deliver a batch, list deliveries, receipts, revoke)
apps/web-admin/app/(oem)/**                       (OEM portal route group: layout for role oem, batches, download, receipt, ship)
tools/oem-receipt/**                              (pnpm oem:receipt CLI — publishable, depends only on @verifyng/core)
packages/db/prisma/schema.prisma                  (additive block: "E05")
docs/oem/**                                       (oem-portal-guide.md, receipt-cli.md, batch-state-machine.md)
```

## Interfaces

**Consumes**
- E01 `@verifyng/core`: `signManifest`, `verifyManifest`, `canonicalize`, `receiptHash`, `parseCode`, `watermarkOf`, `deriveBatchWatermark`.
- E02: login/JWT, `@Roles()`, `@TenantId()`, `req.user`; **cross-epic change request: add `oem` to the role enum** (User.role / Membership.role) and include `oemId` in the JWT claims when present. Until merged, E05 stubs the guard behind `OemScopeGuard`.
- E04: `Product`, `Oem`, `Batch` models; `ManifestStore.read(tenantId, batchId): Promise<Manifest>` (decrypts the MinIO object) and `ManifestStore.write(key, manifest)`; `ArtworkService.presignZip(batchId, ttl)`; `BatchService.setStatus(batchId, status)` (unvalidated setter — E05 validates); `MintService` event `batch.minted`; batch status enum `minted|delivered|printed|shipped|closed`. **Cross-epic change request: E04 adds `Batch.expectedShipDate DateTime?`** (E05 writes it at delivery time, E07 reads it).
- E13: `@Audited(...)` on every mutating route, `AuditService.record` for the download log (actor type `oem`), `QuotaService` kind `manifest_downloads_per_hour` (registered by E05, default 20).
- E14: events below routed to templates `manifest.delivered` (to OEM users + tenant owner) and `receipt.mismatch` (tenant owner); `NotificationService.send('manifest.delivered', { email }, …)` directly for OEM recipients who are not tenant members.
- E11: `apiClient`, layout primitives, `nav.config.ts` entry "Deliveries" (tenant console) and a second nav set for the `(oem)` group, `loginAs('oem')` (E05 adds the fixture user).
- E00: MinIO client, `createTestDatabase()`.

**Exposes**

```ts
// providers
BatchLifecycleService.transition(batchId, to: BatchStatus, ctx: { actor; reason? }): Promise<Batch>   // enforces the state machine, calls E04 setStatus, emits batch.* events
BatchLifecycleService.canTransition(from, to): boolean
BatchLifecycleService.expectedShipDate(batchId): Promise<Date | null>
DeliveryService.deliver(batchId, { oemId, expiresInHours, maxDownloads, expectedShipDate }, actor): Promise<ManifestDelivery>
DeliveryService.revoke(deliveryId, actor)
ReceiptService.verify(deliveryId, receipt: { receiptHash; codeCount; watermarks: string[] }, oemUser): Promise<PrintReceipt>
OemScopeGuard   // for role oem: resolves OemUser by req.user.id, injects req.oem = { oemId, tenantId }; 403 on any other oem's resource
@OemId() param decorator

// HTTP — tenant side (roles owner unless noted)
POST /v1/batches/:batchId/deliveries            { oemId, expiresInHours=72, maxDownloads=5, expectedShipDate }   @Audited('batch.deliver')
GET  /v1/batches/:batchId/deliveries            roles owner|operator|viewer
POST /v1/deliveries/:id/revoke                  @Audited('delivery.revoke')
POST /v1/deliveries/:id/resend                  re-issues token + email, increments token version   @Audited('delivery.resend')
POST /v1/batches/:batchId/close                 @Audited('batch.close')
GET  /v1/batches/:batchId/receipts
POST /v1/oems/:oemId/users                      { email, displayName } → creates User(role oem) + OemUser, sends invite via E14 password.reset flow   @Audited('oem.user.invite')

// HTTP — OEM portal (role oem, OemScopeGuard)
GET  /v1/oem/deliveries                         batches delivered to my oem, with status
GET  /v1/oem/deliveries/:id                     detail incl. download count, expiry, receipt state
GET  /v1/oem/deliveries/:id/manifest?token=     streams the re-signed manifest JSON; logs ManifestDownload; 410 after expiry/maxDownloads/revoke
GET  /v1/oem/deliveries/:id/artwork?token=      302 to E04's presigned artwork zip
POST /v1/oem/deliveries/:id/receipt             { receiptHash, codeCount, watermarks[] }   @Audited('batch.receipt')
POST /v1/oem/deliveries/:id/ship                { carrier, trackingRef, shippedAt, expectedArrivalAt?, meta }   @Audited('batch.ship')

// events
'manifest.delivered'  { tenantId, batchId, oemId, deliveryId, expiresAt, recipientEmails[] }
'manifest.downloaded' { tenantId, batchId, oemId, deliveryId, downloadCount, ip }
'batch.printed'       { tenantId, batchId, oemId, receiptId, codeCount }
'batch.shipped'       { tenantId, batchId, oemId, shipmentId, shippedAt, expectedArrivalAt? }
'receipt.mismatch'    { tenantId, batchId, oemId, deliveryId, reason: 'hash'|'count'|'watermark', detail }
'batch.status.changed'{ tenantId, batchId, from, to }
```

Re-signed manifest shape: `{ ...manifestFromE04, delivery: { deliveryId, oemId, issuedAt, expiresAt }, kid, alg: 'HS256', signature }` via `core.signManifest`. The OEM can verify it offline with the tenant's published verification key later (E16); today the CLI verifies structure only.

## Data model

```prisma
// E05
model OemUser { id String @id @default(cuid()), tenantId String, oemId String, userId String @unique, invitedById String?, createdAt DateTime @default(now())
  @@index([tenantId, oemId]) }

model ManifestDelivery {
  id String @id @default(cuid())
  tenantId String
  batchId String
  oemId String
  objectKey String                     // manifests/{tenantId}/{batchId}/deliveries/{id}.json.enc (E04 ManifestStore encryption)
  signatureKid String
  signature String
  tokenHash String                     // sha256 of the download token; token itself only in the email link
  tokenVersion Int @default(1)
  expiresAt DateTime
  maxDownloads Int @default(5)
  downloadCount Int @default(0)
  expectedShipDate DateTime?           // mirrored to Batch.expectedShipDate (E04 field) on create
  status DeliveryStatus @default(delivered)
  deliveredById String
  deliveredAt DateTime @default(now())
  revokedAt DateTime?
  downloads ManifestDownload[]
  receipts PrintReceipt[]
  @@index([tenantId, batchId])
  @@index([oemId, status])
}
enum DeliveryStatus { delivered downloaded receipted revoked expired }

model ManifestDownload { id, deliveryId, oemUserId String?, ip String, userAgent String?, createdAt   @@index([deliveryId, createdAt]) }

model PrintReceipt {
  id, tenantId, batchId, deliveryId, oemUserId, receiptHash String, expectedHash String, codeCount Int, expectedCount Int,
  watermarks String[], expectedWatermark String, matched Boolean, mismatchReason String?, mismatchDetail Json?, createdAt
  @@index([tenantId, batchId])
}

model Shipment { id, tenantId, batchId @unique, oemId, oemUserId, carrier String?, trackingRef String?, shippedAt DateTime, expectedArrivalAt DateTime?, meta Json?, createdAt
  @@index([tenantId, shippedAt]) }
```

Batch state machine (documented in `docs/oem/batch-state-machine.md`):

```
minted ──deliver──► delivered ──receipt ok──► printed ──ship──► shipped ──close──► closed
   │                   │  ▲                       │                  │
   │                   │  └─ resend/revoke (stays delivered; revoke sets delivery.status=revoked)
   └──────────────── close ──────────────────────┴──────────────────┘   (owner may close from any state; closed is terminal)
receipt mismatch: stays delivered, emits receipt.mismatch
```

## Tasks

- [ ] T1 Cross-epic PRs: comment on E02's issue and open the PR adding `oem` to the role enum + `oemId` JWT claim; comment on E04's issue and open the PR adding `Batch.expectedShipDate`. Meanwhile scaffold `OemManifestModule` with `OemScopeGuard` reading `oemId` from `OemUser`.
- [ ] T2 `BatchLifecycleService` with the transition table, `batch.status.changed` event, unit tests for every legal/illegal pair; wires to E04's `BatchService.setStatus`.
- [ ] T3 Migration `E05_oem_delivery`: `OemUser`, `ManifestDelivery`, `ManifestDownload`, `PrintReceipt`, `Shipment`.
- [ ] T4 `DeliveryService.deliver`: read E04 manifest, attach `delivery` block, `core.signManifest` with the active kid (E13 `KeyRing`), write encrypted object via E04 `ManifestStore`, generate 32-byte token (store hash), set `expectedShipDate` on batch, transition `minted → delivered`, emit `manifest.delivered` → E14 email with `https://<admin>/oem/deliveries/{id}?token=…`. `revoke`, `resend` (rotates token, bumps `tokenVersion`).
- [ ] T5 OEM download routes: token check (constant-time), expiry, `maxDownloads`, `QuotaService` per-hour limit, `ManifestDownload` row, `AuditService.record({ actor: { type: 'oem' } })`, `manifest.downloaded`; status `delivered → downloaded`. Artwork redirect via E04 presign.
- [ ] T6 `ReceiptService.verify`: recompute `expectedHash = core.receiptHash(manifest.units.map(u => u.tier2Code))`, `expectedWatermark = core.deriveBatchWatermark(ring, { tenant, batchId })`; compare hash, count, and that `watermarks` equals `[expectedWatermark]`; on match transition `→ printed`, emit `batch.printed`; on mismatch store reason, emit `receipt.mismatch` (→ E14 `receipt.mismatch` to owners). Idempotent for repeated identical submissions.
- [ ] T7 Shipment: `POST /v1/oem/deliveries/:id/ship` creates `Shipment`, transitions `printed → shipped`, emits `batch.shipped`. Owner `close`.
- [ ] T8 OEM user management: `POST /v1/oems/:oemId/users` creating the `User(role oem, tenantId)` + `OemUser`, invite email through E14 (`password.reset` template with `invite: true` variant — coordinate wording with E02/E14), listing/removal. Seed: `pnpm db:seed` adds OEM "Guangzhou Pack Co." for `ivoryglow` with user `oem@guangzhou-pack.test`.
- [ ] T9 web-admin tenant side `(console)/deliveries/`: list (batch, OEM, status, downloads, expiry, receipt badge), "Deliver batch" dialog (OEM select, expiry, max downloads, expected ship date), delivery detail (download log with IPs, receipts, revoke/resend). Nav entry "Deliveries".
- [ ] T10 web-admin OEM portal `(oem)/`: separate layout (no tenant nav), list of deliveries, detail with "Download manifest", "Download QR artwork", receipt form (paste JSON from CLI or upload), ship form. Accessible only with role `oem`; tenant roles hitting `/oem/*` get redirected to `/`.
- [ ] T11 `tools/oem-receipt`: `pnpm oem:receipt <printed.csv> [--column tier2Code] [--out receipt.json] [--submit <url> --token <jwt>]` — parses codes with `core.parseCode`, drops malformed rows with a count, computes `receiptHash`, `codeCount`, distinct `watermarks` via `core.watermarkOf`; prints a summary; optional submit. Bundled as a single-file executable via tsup for OEMs without pnpm. `docs/oem/receipt-cli.md` + `docs/oem/oem-portal-guide.md` (what the factory does, step by step).
- [ ] T12 Playwright fixtures: `loginAs('oem')` user; E2E flows for AC5–AC7. Wire `OemManifestModule` into `AppModule`; env section "E05" (`OEM_PORTAL_BASE_URL`, `DELIVERY_DEFAULT_EXPIRY_HOURS=72`).

## Acceptance criteria

- [ ] AC1 As `loginAs('owner')` at `http://localhost:3001/deliveries`, deliver the seeded minted batch to "Guangzhou Pack Co." with expected ship date +14 d → row appears with status `delivered`; `http://localhost:8025` shows the `manifest.delivered` email to `oem@guangzhou-pack.test` and the owner; `GET localhost:4000/v1/batches/<id>` (E04) reports `status: delivered` and `expectedShipDate` set.
- [ ] AC2 Following the email link as `loginAs('oem')` downloads a JSON whose `core.verifyManifest` passes with the active kid (check with `node -e` against `@verifyng/core`), `downloadCount` becomes 1 and the download log in the tenant view shows the IP; a second OEM user from another seeded OEM requesting the same URL gets `403`.
- [ ] AC3 `curl "localhost:4000/v1/oem/deliveries/<id>/manifest?token=<token>"` six times → the sixth returns `410 max_downloads_reached`; after `POST /v1/deliveries/<id>/resend` the old token returns `410 token_revoked` and the new one works.
- [ ] AC4 `pnpm oem:receipt tools/oem-receipt/fixtures/printed-ok.csv` prints `codeCount`, one watermark and a `receiptHash`; `--submit http://localhost:4000 --token <oem jwt>` → batch becomes `printed`; `GET /v1/audit?action=batch.receipt` shows the audited row with actor type `oem`.
- [ ] AC5 `pnpm oem:receipt tools/oem-receipt/fixtures/printed-swapped.csv --submit …` (one code replaced by a code from a different batch) → `matched: false, mismatchReason: 'watermark'`, batch stays `delivered`, `receipt.mismatch` email arrives in Mailpit for the owner and the tenant deliveries screen shows a red receipt badge.
- [ ] AC6 In the OEM portal, submit the ship form with carrier `DHL`, tracking `1234567890` → batch `shipped`; `GET /v1/batches/<id>/deliveries` includes the shipment; attempting `POST /v1/oem/deliveries/<id>/ship` again returns `409 illegal_transition shipped→shipped`.
- [ ] AC7 Illegal transitions are rejected with `409` for every non-edge in the state machine (table-driven integration test), and `POST /v1/batches/<id>/close` as owner works from `shipped`; as `operator` it returns `403`.
- [ ] AC8 Cross-tenant: E02's isolation harness extended with the OEM role — an `oem` user of tenant A listing `/v1/oem/deliveries` never sees tenant B rows (integration test in E05, using E02's harness).

## Testing

- Unit: state machine table, token hashing/constant-time compare, receipt comparison logic (hash/count/watermark branches), CLI parsing with malformed rows.
- Integration (real Postgres + MinIO + Redis): deliver → download → receipt → ship happy path; expiry and max-download `410`s; revoke; mismatch path emits event and stores detail; OEM scope guard; idempotent receipt resubmission.
- E2E (Playwright): AC1, AC2, AC5, AC6 driven through both consoles with Mailpit assertions.
- CLI: `tools/oem-receipt` has its own Vitest suite with the two fixture CSVs (generated from `packages/core/test/fixtures`).

## Compose services added

None. Uses E00 MinIO (bucket `manifests`, created by E04) and Mailpit.

## Notes and decisions

- An OEM user is a `User` row with `tenantId` = the brand that verified it and role `oem`, further scoped by `OemUser.oemId`. A factory serving two brands gets two logins; this keeps E02's tenant isolation model untouched and is documented in the portal guide.
- OEM "verification" in this epic is the tenant owner creating the `Oem` (E04) and inviting its users; platform-level OEM KYC is deferred and noted in E03's backlog.
- The download URL carries a random token in addition to requiring the `oem` session: the link in the email is useless to anyone who is not logged in as that OEM, and a stolen session is useless without the link.
- Receipt watermark checking works because the watermark is a visible 4-char block in the payload (E01 T7); the OEM's CLI needs no key material.
- `expectedShipDate` lives on `Batch` (E04) so E07 can read it in one join; `ManifestDelivery.expectedShipDate` is a copy for the delivery record's own history.
