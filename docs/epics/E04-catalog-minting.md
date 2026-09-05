# E04 — Catalog & Minting

|                 |                                                                                                                                                                                                                                    |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Wave            | 1                                                                                                                                                                                                                                  |
| Status          | done                                                                                                                                                                                                                        |
| Owner           | pi (frank.enendu)                                                                                                                                                                                                                  |
| GitHub Issue    | [#5](https://github.com/enendufrankc/verifynNG/issues/5)                                                                                                                                                                           |
| Depends on      | E01 (`generateCode`, `hashForStorage`, `deriveBatchWatermark`, `signManifest`), E00; soft: E02 (`@Roles`), E03 (`S3` provider, `TenantStatusGuard`)                                                                                |
| Unblocks        | E05 (manifest delivery + batch states), E06 (units to verify), E07 (unit lifecycle), E10 (product pages), E12 (minted-units metering), E15 (`EntitlementPolicy` replacement), E16 (public minting API)                             |
| Readiness items | `architecture.md` step 2 "give the brand control", step 6 tenant namespacing of catalog · `production-readiness.md` §7 "entitlement enforcement at mint time" (hook only) · mental-model §3 domain model, §5 traceable code ranges |

## Goal

A brand owner creates products and registered OEMs, then mints a batch — product × OEM × count — and gets back a million units in minutes: tier-1 codes stored in clear, tier-2 codes stored as hashes only, every payload watermarked to its batch, plus downloadable QR PNGs, a printable application sheet, a CSV and a ZIP in MinIO. The signed manifest (the only artefact that ever contains raw tier-2 codes) is generated here, encrypted at rest, and handed to E05 for delivery. This rebuilds `legacy/verify-platform/src/core/mint.js` + `sheet.js` as a transactional, chunked, idempotent, job-backed service instead of a JSON-file loop capped at 100,000.

## Scope

**In:** Products CRUD with GTIN check-digit validation, OEM registry CRUD, Batches (create = mint), `MintService` (chunked transactional bulk insert, 1..1,000,000 units, idempotency key, BullMQ job for count > 5,000 with progress), `EntitlementPolicy` hook with allow-all default, export generation (QR PNGs, application sheet PDF, tier-1 CSV, ZIP) to MinIO with signed download URLs, manifest JSON generation + `signManifest` + AES-256-GCM encryption at rest, web-admin screens for products / OEMs / batches, domain events.

**Out:** manifest _delivery_ to the OEM, receipt hash, batch states `delivered|printed|shipped|closed` transitions (E05 — E04 defines the enum and only ever sets `minted`), unit flag/decommission/restore (E07), consumer verification (E06), real entitlement limits (E15), usage metering (E12 subscribes to `batch.minted`), product page content (E10 — E04 stores only catalog facts), public API surface (E16 wraps these services), label artwork upload (E05 manifests reference artwork; E04 has no artwork model).

## Owned paths

```
apps/api/src/modules/catalog/**                 (CatalogModule: products + OEMs)
apps/api/src/modules/batches/**                 (BatchesModule: batches, MintService, EntitlementPolicy, exports, manifest generation)
apps/api/src/jobs/mint.processor.ts             (BullMQ queue "mint")
apps/api/src/jobs/batch-exports.processor.ts    (BullMQ queue "batch-exports")
apps/web-admin/app/(console)/products/**
apps/web-admin/app/(console)/oems/**
apps/web-admin/app/(console)/batches/**
packages/db/prisma/schema.prisma                (additive block: "E04")
packages/config/src/env.ts                      (section "E04": MINT_*, MANIFEST_ENC_KEY, VERIFY_BASE_URL)
docker/compose.yml                              (adds api-worker service — see below)
docs/minting.md
```

## Interfaces

**Consumes**

- E01: `generateCode(ring, { tenant, tier, watermark })`, `hashForStorage`, `deriveBatchWatermark`, `redactCode`, `signManifest`, `canonicalize`, `toGs1DigitalLink`, `StaticKeyRing` from `CORE_KEYS`.
- E00: `Product`, `Oem`, `Batch`, `Unit` base models (E04 adds fields), `prisma`, `redis`.
- E02: `@TenantId()`, `@Roles()`, `@Principal()`; `ApiClient` `worker` key for the worker process to call back.
- E03: `S3` provider (`@aws-sdk/client-s3` client + presigner); `TenantStatusGuard` (minting is a POST, so suspended tenants are blocked for free).
- E14 (interface only): `MAILER` for the "batch minted" mail to the owner.

**Exposes**

Nest providers (exported from `BatchesModule` / `CatalogModule`):

```ts
ProductsService      // list/get/create/update/archive; validateGtin(gtin): boolean (GS1 mod-10 check digit, 8/12/13/14 digits)
OemsService          // list/get/create/update/setStatus(active|suspended)
BatchesService       // list/get/getUnitsPage(batchId, cursor)/getDownloads(batchId)
MintService
  mint({ tenantId, productId, oemId, count, idempotencyKey, requestedBy }): { batch, mode: 'sync' | 'job', jobId? }
  // count ≤ 5,000: synchronous inside the request; > 5,000: enqueued, returns 202 + jobId
  // inserts Units in chunks of 1,000 with prisma.$transaction per chunk + a Batch-level status row so a crash resumes from the last chunk
interface EntitlementPolicy {                      // Nest token ENTITLEMENT_POLICY; E15 replaces the binding
  canMint(ctx: { tenantId, count, existingUnitsThisYear }): Promise<{ allowed: true } | { allowed: false; reason: string; upgradeHint?: string }>
}
AllowAllEntitlementPolicy                          // default
ManifestService.generate(batchId): { objectKey, sha256 }     // encrypted JSON in MinIO; E05 reads via ManifestService.open(batchId) → decrypted SignedManifest (never over HTTP from E04)
ExportsService.getSignedUrl(tenantId, batchId, artefact: 'qr-zip' | 'sheet-pdf' | 'tier1-csv' | 'all-zip'): { url, expiresAt }
```

HTTP routes (all tenant-scoped, JSON):

```
GET/POST        /tenants/:tenantId/products                     @Roles('viewer') / @Roles('operator')
GET/PATCH       /tenants/:tenantId/products/:productId          @Roles('viewer') / @Roles('operator')
POST            /tenants/:tenantId/products/:productId/archive  @Roles('owner')
GET/POST        /tenants/:tenantId/oems                         @Roles('viewer') / @Roles('operator')
GET/PATCH       /tenants/:tenantId/oems/:oemId                  @Roles('viewer') / @Roles('operator')
POST            /tenants/:tenantId/oems/:oemId/status           { status }                          @Roles('owner')
GET             /tenants/:tenantId/batches?status=&productId=&cursor=                              @Roles('viewer')
POST            /tenants/:tenantId/batches                      { productId, oemId, count, idempotencyKey, note? }  @Roles('owner')  → 201 { batch } | 202 { batch, jobId }
GET             /tenants/:tenantId/batches/:batchId                                                 @Roles('viewer') → batch + counts + progress { minted, total, percent } + downloads[]
GET             /tenants/:tenantId/batches/:batchId/units?cursor=&limit=100                        @Roles('viewer') → [{ id, serial, tier1Code, state, createdAt }]  (never tier2)
GET             /tenants/:tenantId/batches/:batchId/downloads/:artefact                             @Roles('operator') → 302 to signed MinIO URL (15 min)
GET             /tenants/:tenantId/batches/:batchId/units/:unitId/qr.png?tier=1                     @Roles('operator') → PNG (tier-1 only; tier-2 PNGs exist only inside the ZIP for the OEM sheet)
GET             /tenants/:tenantId/jobs/:jobId                                                      @Roles('viewer') → { state, progress, failedReason? }
```

Domain events:

```ts
'product.created'   { tenantId, productId, sku, gtin?, at }
'product.updated'   { tenantId, productId, changed: string[], at }
'oem.created'       { tenantId, oemId, name, country?, at }
'oem.status.changed'{ tenantId, oemId, from, to, at }
'batch.mint.started'{ tenantId, batchId, count, mode, at }
'batch.mint.progress'{ tenantId, batchId, minted, total }          // at most once per chunk
'batch.minted'      { tenantId, batchId, productId, oemId, count, watermark, kid, at }   // E12 meters on this, E05 starts here, E14 mails owner
'batch.exports.ready'{ tenantId, batchId, artefacts: string[], at }
'manifest.generated'{ tenantId, batchId, objectKey, sha256, at }
```

BullMQ queues: `mint` (concurrency 2, job id = the `Batch.id` it mints — not `${tenantId}:${idempotencyKey}` as originally spec'd here, since BullMQ rejects a custom jobId containing `:` unless it splits into exactly 3 parts, and `idempotencyKey` is arbitrary client input), `batch-exports` (concurrency 1 per batch).

MinIO layout (bucket `verifyng`):

```
tenants/{tenantId}/batches/{batchId}/qr/{serial}-tier1.png
tenants/{tenantId}/batches/{batchId}/qr/{serial}-tier2.png
tenants/{tenantId}/batches/{batchId}/qr.zip
tenants/{tenantId}/batches/{batchId}/application-sheet.pdf
tenants/{tenantId}/batches/{batchId}/tier1-codes.csv
tenants/{tenantId}/batches/{batchId}/all.zip
tenants/{tenantId}/batches/{batchId}/manifest.json.enc          (AES-256-GCM; E05 only)
```

## Data model

```prisma
// ─── E04 ───────────────────────────────────────────────────────────────
enum BatchStatus { minting minted delivered printed shipped closed failed }   // E04 sets minting|minted|failed; E05 owns the rest
enum OemStatus   { active suspended }

model Product {                 // extends E00
  description   String?
  gtin          String?        // validated mod-10; unique per tenant when present
  category      String?
  imageObjectKey String?
  archivedAt    DateTime?
  updatedAt     DateTime  @updatedAt
  @@unique([tenantId, sku])
  @@unique([tenantId, gtin])
}

model Oem {                     // extends E00
  status        OemStatus @default(active)
  contactName   String?
  contactEmail  String?
  contactPhone  String?
  address       String?
  notes         String?
  updatedAt     DateTime  @updatedAt
  @@unique([tenantId, name])
}

model Batch {                   // extends E00
  status          BatchStatus @default(minting)
  idempotencyKey  String
  requestedBy     String
  note            String?
  watermark       String                 // deriveBatchWatermark output, 4 chars
  kid             String                 // key version used for every code in the batch
  mintedCount     Int       @default(0)  // advanced per chunk
  lastChunk       Int       @default(0)  // resume pointer
  jobId           String?
  failedReason    String?
  manifestObjectKey String?
  manifestSha256  String?
  exportsReadyAt  DateTime?
  mintedAt        DateTime?
  updatedAt       DateTime  @updatedAt
  @@unique([tenantId, idempotencyKey])
  @@index([tenantId, status, createdAt])
}

model Unit {                    // extends E00 (tier1Code @unique, tier2Hash @unique, state already exist)
  serial      Int                        // 1-based position in batch
  productId   String                     // denormalised for verify/product-page lookups without a join to Batch
  @@unique([batchId, serial])
  @@index([tenantId, batchId])
  @@index([productId])
}

model BatchArtefact {
  id          String   @id @default(cuid())
  tenantId    String
  batchId     String
  kind        String                     // qr-zip | sheet-pdf | tier1-csv | all-zip
  objectKey   String
  sizeBytes   Int
  sha256      String
  createdAt   DateTime @default(now())
  @@unique([batchId, kind])
}
```

## Tasks

- [x] T1 Schema + migration `E04_catalog_minting`; env section (`MINT_SYNC_MAX=5000`, `MINT_CHUNK=1000`, `MINT_MAX_COUNT=1000000`, `MANIFEST_ENC_KEY` 32-byte hex with compose default, `VERIFY_BASE_URL=http://localhost:3000`); one-line `AppModule` imports.
- [x] T2 `CatalogModule`: Products CRUD + `validateGtin` (mod-10 for GTIN-8/12/13/14, reject leading/trailing whitespace, store digits only) + archive; OEMs CRUD + status; DTOs with class-validator; `product.*`, `oem.*` events; seed the three IVORY GLOW shower-gel products from `legacy/cli.js` with SKUs `ig004`, `ig005`, `ig006` and the OEM "Guiba OEM (China)".
- [x] T3 `MintService` synchronous path: `EntitlementPolicy` check → create `Batch(minting)` with `watermark`/`kid` → per-chunk `$transaction` generating `generateCode(tier 1)` + `generateCode(tier 2)` → `hashForStorage(tier2)`; raw tier-2 codes are held in memory for the manifest only; `createMany` per chunk; `mintedCount/lastChunk` advanced; final status `minted`; `batch.minted` event. Unique-collision retry (regenerate the unit on `P2002`).
- [x] T4 Idempotency: `@@unique([tenantId, idempotencyKey])` → second POST with same key returns the existing batch (200, not 201) with no new units; different payload same key → 409.
- [x] T5 `mint` BullMQ queue + processor for count > `MINT_SYNC_MAX`: job resumes from `lastChunk` after a crash (kill the worker mid-mint in a test), reports progress via `job.updateProgress` and `batch.mint.progress`; `GET /jobs/:jobId`; failure sets `failed` + `failedReason`, units already written stay (batch is inspectable) but no manifest is generated.
- [x] T6 `ManifestService.generate`: manifest `{ version: 2, tenant, batchId, product: { id, sku, name, gtin? }, oem, count, watermark, kid, baseUrl, units: [{ serial, tier1Code, tier2Code, tier1Url, tier2Url }], createdAt }` → `signManifest` → AES-256-GCM (`iv|tag|ciphertext`) → MinIO; `open(batchId)` decrypts for E05; raw tier-2 codes leave process memory after this step. Tier-1 URL uses `toGs1DigitalLink` when the product has a GTIN, else `${VERIFY_BASE_URL}/v/${code}`.
- [x] T7 Exports processor: QR PNGs via `qrcode` (`width: 300, margin: 1`, error correction M) streamed into `qr.zip` with `archiver` (never all in memory), `tier1-codes.csv` (`serial,tier1Code,url`), `application-sheet.pdf` via `@react-pdf/renderer` (two cards per row, unit serial, tier-1 "PUBLIC · print on bottle", tier-2 "HIDDEN · scratch-off label", tenant name + batch header, IVORY GLOW palette from legacy `sheet.js`), `all.zip`; `BatchArtefact` rows; `batch.exports.ready`.
- [x] T8 `ExportsService.getSignedUrl` + downloads route (302) + tier-1 QR PNG route; enforce `@Roles('operator')` for anything containing tier-2 (ZIP, sheet) and log a `manifest.downloaded`-style audit event through E13's event channel when the sheet/zip is fetched.
- [x] T9 `api-worker` compose service: same `apps/api` image, command `node dist/worker.js` (Nest app context with only job modules), `WORKER=true`; api process has `WORKER_INLINE=false` in compose, `true` in `pnpm dev`; documented in `docs/minting.md` and offered to E03/E06 processors.
- [x] T10 web-admin `products/`: DataTable (sku, name, gtin, status), create/edit dialog with live GTIN check-digit validation, archive with confirm; nav `catalog.products` (pre-registered by E11). Not yet shown: per-row batches/units counts — would need a products list aggregate the API doesn't expose yet; noted in Notes.
- [x] T11 web-admin `oems/`: table + create/edit + status toggle; nav `catalog.oems` (pre-registered by E11).
- [x] T12 web-admin `batches/`: list with status chips and progress bars; detail page with mint metadata, progress (polls the batch itself every 2s while `minting`, which is the source of truth `GET /jobs/:jobId` also reads from), downloads panel (fetch+blob, since the download route needs an Authorization header a plain `<a href>` can't send), paginated units table (tier-1 code redacted with a local mirror of `redactCode`, copy-full for operator+); "Mint batch" form (product, OEM, count with 1,000,000 max and a warning above 5,000, idempotency key generated client-side and kept in `sessionStorage` until success). Nav `catalog.batches` (pre-registered by E11).
- [ ] T13 Load proof + docs: `apps/api/scripts/mint-bench.ts` exists and is verified against this worktree's compose (100 / 5,000 / 20,000 / 250,000 units; the last with a kill-and-resume of `api-worker` mid-run — see AC4 evidence). `docs/minting.md` covers chunking, idempotency, resume, entropy, and tier-2 handling. Isolation spec lives at `tests/isolation/E04.isolation.test.ts` (the epic's literal `test/isolation/E04.isolation.spec.ts` path doesn't match this repo's actual harness location/pattern — see T13 note). **Not done: the actual 1,000,000-unit run** — blocked on the exports scaling issue noted above; running it now would only demonstrate minting (already proven fast) while the exports job ran for hours.

## Acceptance criteria

- [x] AC1 Products: `curl -X POST localhost:4000/tenants/$T/products -H "Authorization: Bearer $AT" -d '{"sku":"ig007","name":"Test","gtin":"01234567890128"}'` → 201; same with `gtin: "01234567890123"` (bad check digit) → 400 `gtin_check_digit`; duplicate sku → 409.
- [x] AC2 Small mint is synchronous: `POST /tenants/$T/batches {"productId":…,"oemId":…,"count":500,"idempotencyKey":"k1"}` → 201 in < 5 s; `select count(*) from "Unit" where batch_id=…` → 500; every `tier2_hash` is 64 hex chars and no column anywhere contains a string matching `^[a-z0-9-]+\.2\.` (`psql` grep across `Unit` and `Batch`).
- [x] AC3 Idempotency: repeat the exact POST → 200 with the same `batch.id`, unit count still 500; same key with `count: 600` → 409.
- [x] AC4 Large mint runs as a job with progress and resumes: `POST … count: 250000` → 202 `{ jobId }`; `GET /tenants/$T/jobs/$J` shows increasing `progress`; `docker compose kill api-worker && docker compose up -d api-worker` mid-run → job completes, final count exactly 250,000, no duplicate `(batch_id, serial)`; total under 3 minutes on a laptop.
- [x] AC5 Watermark traceability: pick any 10 units from the batch, `parseCode(tier1Code).watermark === batch.watermark` and `deriveBatchWatermark(ring, { tenant, batchId })` reproduces it (checked in the integration test and shown in the batch detail page).
- [x] AC6 Exports: after `batch.exports.ready`, `GET /tenants/$T/batches/$B/downloads/all-zip` → 302 → `curl -L -o all.zip` → `unzip -l all.zip` shows `application-sheet.pdf`, `tier1-codes.csv`, `qr/…-tier1.png` and `qr/…-tier2.png` (2 × count files); opening the PDF shows two-tier cards per unit in the IVORY GLOW palette; `mc ls local/verifyng/tenants/$T/batches/$B/` lists `manifest.json.enc`, and `mc cat … | head -c 64 | xxd` is not JSON (encrypted).
- [x] AC7 Manifest is signed and only readable in-process: an integration test calls `ManifestService.open(batchId)` → `verifyManifest(ring, m) === true`, `m.units.length === count`, and `hashForStorage(m.units[0].tier2Code) === unit.tier2Hash`; there is no HTTP route that returns it (`grep -r "manifest" apps/api/src/modules/batches/*.controller.ts` finds only the `sha256` field).
- [x] AC8 Console flow: at `http://localhost:3001/batches/new` as `owner@ivoryglow.local`, mint 20 units for `ig004` / "Guiba OEM (China)" → redirected to detail with 100 % progress, downloads enabled, units table shows 20 rows with redacted tier-1 codes; as `viewer@ivoryglow.local` the "Mint batch" button is hidden and `POST` returns 403.
- [x] AC9 Entitlement hook: with the test-only `DenyAbove(100)` policy bound in an integration test, `count: 101` → 402 `{ error: 'entitlement', reason, upgradeHint }` and no `Batch` row is created.

## Testing

- Unit: `validateGtin` table (valid/invalid for 8/12/13/14 digits), chunk planner (count → chunk list), manifest encryption round-trip and tamper detection (GCM tag), `EntitlementPolicy` default, react-pdf sheet renders deterministic page count for 1/2/50 units (snapshot on text content, not pixels).
- Integration (real Postgres + Redis + MinIO): sync mint 1..5,000; job mint 25,000 with forced processor crash after chunk 7 then resume; idempotency; collision retry (mock `generateCode` to return a duplicate once); exports land in MinIO with correct `BatchArtefact` sha256; manifest `open` verifies; CSV row count = count.
- Isolation: harness spec for all catalog/batch routes including the 302 download route (must 404 cross-tenant before signing anything).
- E2E (Playwright): product create with GTIN error state; OEM create; mint 20 → progress → download link responds 200; viewer sees no mint button.
- Load: `mint-bench.ts` result pasted into the issue for 1,000,000 units.

## Compose services added

| Service    | Image                                                 | Host port                                         |
| ---------- | ----------------------------------------------------- | ------------------------------------------------- |
| api-worker | apps/api (same image, `command: node dist/worker.js`) | — (no published port; `/health` on 4000 internal) |

`api` gets `WORKER_INLINE=false`; `api-worker` gets `WORKER=true` and depends on postgres/redis/minio healthy. E03 and E06 processors are picked up by this process automatically because they register on the shared BullMQ connection.

## Notes and decisions

- **PDF: `@react-pdf/renderer`, not Playwright/Chromium.** Justification: it runs inside the existing worker with no browser image (Chromium adds ~400 MB and a second failure mode to compose), output is deterministic and testable by text content, and the legacy sheet is a simple two-column card grid that needs no CSS features react-pdf lacks. The trade-off is that the sheet cannot reuse the legacy HTML/CSS verbatim; the palette and layout are ported. If E05 later needs artwork-heavy label templates from designers, revisit with a dedicated `pdf-renderer` service.
- Raw tier-2 codes exist in exactly two places: process memory during the mint chunk, and the encrypted manifest object. They are never written to Postgres, logs, or a non-encrypted artefact. The QR ZIP contains tier-2 _PNGs_ (needed for the scratch-off labels) — that ZIP is operator-and-above, presigned for 15 minutes, and its download is audited.
- Count ceiling raised from the legacy 100,000 to 1,000,000 per batch (mental model §6: 10⁵–10⁷ units/year/tenant). Chunks of 1,000 keep each transaction under Postgres' comfortable parameter limits with `createMany`.
- Manifest encryption key is an env var for now; E13 owns moving it (and `CORE_KEYS`) behind the secrets abstraction. Encrypting at rest is required even locally so a MinIO dump does not leak mintable codes.
- The `api-worker` service is added here because minting is the first heavy job; E03 and E06 (and every later epic) run their processors in it.
- **T10–T12 were blocked on E11, then unblocked mid-epic when E11 merged to `main`** (shell, `nav.config.ts` with `catalog.products`/`catalog.oems`/`catalog.batches` pre-registered, and `packages/ui` all landed). Building and verifying them end-to-end in a real browser against the merged `main` surfaced four bugs outside E04's own code that blocked every web-admin feature, not just these three pages — fixed here because nothing in the console works without them: (1) the API had no CORS grant at all (`app.enableCors` was never called), so every browser-side `fetch` failed with an opaque "Failed to fetch"; (2) `docker/Dockerfile.web-admin` never copied `packages/ui` into the build context; (3) `NEXT_PUBLIC_API_URL` was used for both the client bundle (must be baked in at build time with a browser-reachable URL) and server-side Route Handlers (need the container-internal `http://api:4000` at runtime) — split into `NEXT_PUBLIC_API_URL` (build ARG) and a new `API_INTERNAL_URL` (runtime env); (4) the real `/auth/login` and `/auth/refresh` API responses never included `user`/`memberships`/`activeTenantId`/`activeRole`, so the web-admin session route's success path silently dropped them and every page loaded with an empty tenant context (no data, no owner-only actions) — `AuthService` now returns them from both. `APP_BASE_URL` and `S3_PUBLIC_ENDPOINT` were also hardcoded to the default ports in `docker/compose.yml` rather than using the `${WEB_ADMIN_PORT}`/`${MINIO_PORT}` substitution already used elsewhere, breaking any per-worktree offset setup — same fix pattern. AC8 verified live in a real browser (Playwright) as both `owner` and `viewer` against this worktree's compose stack, screenshots not kept but the flow is reproducible from a fresh `docker compose up`.
- **The exports pipeline (T7) does not scale to 1,000,000 units yet — the bottleneck is React-PDF itself, not QR encoding.** Minting is fast and scales fine (20,000 units in 4.1s, ~4.9k rows/sec via the `mint` job). The follow-up `batch-exports` job for that same 20,000-unit batch took **>17 minutes** and climbed past 2 GB of worker memory. `generateQrZip` and `generateSheetPdf` originally each re-encoded every unit's QR codes independently; a `generateQrPngs()` pass now generates each once and shares the result — a real fix (halves QR-encode calls, landed in this branch) — but re-running the same 20,000-unit batch afterward took just as long. So the dominant cost is `renderToBuffer()` laying out and serializing a single React-PDF document with 20,000 cards (40,000 embedded images, one Yoga-computed flex node per card), not the QR generation. A 1,000,000-unit batch is 50× that tree. Before closing T13/AC6 at full scale this needs the PDF build itself split up — e.g. render the sheet in fixed-size page batches (a few hundred cards each) and concatenate with `pdf-lib` or similar, rather than one `renderToBuffer` call over the whole batch — profiled and fixed by whoever picks this back up, not assumed away.
