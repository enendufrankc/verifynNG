# E16 — Public API & Webhooks

| | |
|---|---|
| Wave | 3 |
| Status | in-progress |
| Owner | Frank Enendu |
| GitHub Issue | [#17](https://github.com/enendufrankc/verifynNG/issues/17) |
| Depends on | E02 (auth primitives, `ApiClient`), E04 (batches/units, `MintService`, `batch.minted`), E06 (scan events, `scan.recorded`), E07 (`anomaly.detected`, `unit.flagged`, `unit.decommissioned`), E13 (`QuotaService`, `@Audited`), E11 (admin shell), E15 (`hasFeature('publicApi')`, `maxApiKeys`) |
| Unblocks | E21 (contract tests against the OpenAPI spec), E18 (API docs link from `apps/docs`) |
| Readiness items | `production-readiness.md` §10 all rows (public API + keys, signed webhooks, versioned API + OpenAPI docs + deprecation policy) · §1 service-to-service auth · §2 per-tenant rate limits (consumed) |

## Goal

A tenant or its OEM can integrate minting, unit lifecycle and scan data into their own ERP without a human in the console: they create an API key, read the OpenAPI spec (or install the TypeScript SDK), call `/api/v1/**`, and receive signed, retried webhooks when something happens to their units. The public surface is versioned, rate-limited per key, idempotent on writes, and documented with a deprecation policy — because printed codes live for years and so will the integrations built on them. Without this, "Shopify of product authenticity" is a console, not a platform.

## Scope

**In:** `ApiKey` model + hashing + scopes + one-time display, `ApiKeyGuard`, public API module at `/api/v1/**` (batches, units, scans, reports — read/write per scopes), rate limiting per key via E13 `QuotaService` with plan limits from E15, `Idempotency-Key` for POSTs, cursor pagination, error envelope, OpenAPI 3.1 generation + `/api/docs` (Scalar) + `/api/openapi.json`, `packages/sdk` (openapi-typescript + thin fetch client), deprecation policy + `Sunset`/`Deprecation` headers, `WebhookEndpoint`/`WebhookDelivery`, HMAC-SHA256 signing with timestamp, BullMQ delivery with exponential backoff to 24h, dead-letter + manual redeliver, event catalogue, test-send, consumer verification docs with sample code, `tools/fakes/webhook-sink`, admin screens for keys and webhooks + delivery log.

**Out:** the consumer verify endpoint `GET /v1/verify/:code` and its anonymous rate limits (E06 — stays on the internal router, never behind an API key), the minting logic itself (E04 — E16 calls `MintService`), anomaly rules (E07), quota algorithm (E13 — E16 supplies key + limit, E13 counts), SDKs in other languages (future; the OpenAPI spec is the contract), OAuth2 client-credentials for third parties (future — `ApiKey` is sufficient for tenant-owned integrations), API keys for the OEM portal (E05 uses `ApiClient` from E02).

## Owned paths

```
apps/api/src/modules/public-api/**          controllers under /api/v1, guards, interceptors, OpenAPI setup
apps/api/src/modules/api-keys/**
apps/api/src/modules/webhooks/**
apps/web-admin/app/(console)/api-keys/**
apps/web-admin/app/(console)/webhooks/**
packages/sdk/**
packages/db/prisma/schema.prisma            (additive block: "E16")
tools/fakes/webhook-sink/**
docs/public-api-deprecation-policy.md
docs/webhooks-consumer-guide.md
```

## Interfaces

**Consumes:**
- E02: `Membership`/roles for the admin routes (`@Roles('owner')` to create/revoke keys and endpoints; `viewer` can list), `TenantId()` for console routes, password/JWT untouched — API-key auth is a separate guard.
- E04: `MintService.mint(tenantId, { productId, oemId?, count })`, `BatchService.get/list`, `UnitService.get/list/flag/decommission/restore`, events `batch.minted`.
- E05: events `batch.printed`, `batch.shipped`.
- E06: `ScanEventService.list(tenantId, filters, cursor)`, events `scan.recorded` (filtered to suspicious verdicts → `scan.suspicious`), `scan.enumeration_detected` (not exposed externally).
- E07: events `anomaly.detected`, `unit.flagged`, `unit.decommissioned`.
- E08: `ReportService.list/get`, event `report.created`.
- E13: `QuotaService.assertWithinQuota(key: string, limit: { perMinute }, cost = 1)`; `@Audited` on key/endpoint mutations; secrets helper for encrypting `WebhookEndpoint.secret`.
- E15: `EntitlementService.hasFeature(tenantId, 'publicApi' | 'webhooks')`, `limitsFor(tenantId).apiRateLimitPerMin`, `.maxApiKeys`.
- E11: `nav.config.ts` entries `api-keys`, `webhooks` (under a "Developers" group), `apiClient`, `EmptyState`.

**Exposes:**

Nest providers:
```ts
ApiKeyService        // create(tenantId, {name, scopes, expiresAt?}) → { key: 'vk_live_…' (once), record }, verify(rawKey) → { tenantId, scopes, keyId } | null, revoke(id), touchLastUsed(id)
ApiKeyGuard          // reads Authorization: Bearer vk_…; sets request.apiKey + request.tenantId; 401/403 envelope
ScopesGuard + @Scopes('read:batches', …)
IdempotencyInterceptor   // POST + Idempotency-Key → Redis (24h) replay of status+body; 409 on in-flight/mismatched body
RateLimitInterceptor     // QuotaService per key; X-RateLimit-Limit/Remaining/Reset + Retry-After
ApiErrorFilter           // envelope below
CursorPaginator          // encode/decode opaque cursors { createdAt, id }
WebhookEndpointService   // create/update/rotateSecret/disable/testSend
WebhookDispatcher        // subscribes to domain events, fans out WebhookDelivery rows and BullMQ jobs
WebhookDeliveryProcessor // BullMQ worker: sign, POST, record, backoff, dead-letter
WebhookSigner            // sign(secret, timestamp, body) → 'v1=<hex>'; verify(…) with 5-minute window
```

Public HTTP routes (all `/api/v1`, all require `Authorization: Bearer vk_…`, JSON only):
```
GET    /api/v1/batches                       read:batches   ?cursor&limit&productId&status
POST   /api/v1/batches                       write:batches  Idempotency-Key required  { productId, oemId?, count }  → 202 { batch, exportUrl }
GET    /api/v1/batches/:id                   read:batches
GET    /api/v1/batches/:id/units             read:units     ?cursor&limit&state
GET    /api/v1/units/:id                     read:units     (tier-2 never returned; tier1Code and redacted hash only)
POST   /api/v1/units/:id/flag                write:units    { reason }
POST   /api/v1/units/:id/decommission        write:units    { reason }
POST   /api/v1/units/:id/restore             write:units
GET    /api/v1/scans                         read:scans     ?cursor&limit&batchId&unitId&verdict&from&to
GET    /api/v1/reports                       read:reports   ?cursor&limit&status
GET    /api/v1/reports/:id                   read:reports
GET    /api/v1/webhook-endpoints             (any scope)    list own endpoints
POST   /api/v1/webhook-endpoints             write:batches  { url, events[] } → secret shown once
DELETE /api/v1/webhook-endpoints/:id
GET    /api/v1/me                            (any scope)    { tenantId, keyPrefix, scopes, rateLimit }
GET    /api/docs                             public         Scalar UI
GET    /api/openapi.json                     public         generated spec
```

Internal (console, JWT) routes:
```
GET/POST        /v1/tenants/:tenantId/api-keys              owner (viewer: GET)
DELETE          /v1/tenants/:tenantId/api-keys/:id          owner   (revoke)
GET/POST/PATCH  /v1/tenants/:tenantId/webhook-endpoints[/:id]   owner (viewer: GET)
POST            /v1/tenants/:tenantId/webhook-endpoints/:id/test          owner  sends `ping`
POST            /v1/tenants/:tenantId/webhook-endpoints/:id/rotate-secret owner
GET             /v1/tenants/:tenantId/webhook-deliveries     ?endpointId&status&cursor
POST            /v1/tenants/:tenantId/webhook-deliveries/:id/redeliver    owner
```

Error envelope (every non-2xx on `/api/v1`):
```json
{ "error": { "type": "not_found|validation|unauthorized|forbidden|rate_limited|conflict|idempotency_mismatch|plan_limit|internal",
             "message": "…", "requestId": "…", "docs": "https://…/api/docs#errors", "details": [{ "field": "count", "issue": "must be ≤ 100000" }] } }
```

Webhook wire format:
```
POST <endpoint.url>
Content-Type: application/json
X-VerifyNG-Event: unit.flagged
X-VerifyNG-Delivery: <deliveryId>
X-VerifyNG-Timestamp: 1724800000
X-VerifyNG-Signature: v1=<hex HMAC-SHA256(secret, `${timestamp}.${rawBody}`)>
{ "id": "<deliveryId>", "type": "unit.flagged", "createdAt": "…", "tenantId": "…", "apiVersion": "2026-09-01", "data": { … } }
```

Event catalogue (external names → source event): `scan.suspicious` ← E06 `scan.recorded` where verdict ∈ {suspicious, flagged, unknown-tier2}; `unit.flagged`, `unit.decommissioned`, `anomaly.detected` ← E07; `batch.minted` ← E04; `batch.printed`, `batch.shipped` ← E05; `report.created` ← E08; `ping` ← test-send. Payload schemas are part of the OpenAPI spec under `components.schemas.WebhookEvent*`.

Domain events emitted (Nest `EventEmitter`):
```
apikey.created            { tenantId, apiKeyId, prefix, scopes, createdBy }
apikey.revoked            { tenantId, apiKeyId, prefix, revokedBy }
webhook.delivery.failed   { tenantId, endpointId, deliveryId, event, attempts, lastStatus, deadLettered: boolean }
```

Prisma models: `ApiKey`, `IdempotencyRecord` (Redis-backed by default; table only for audit of replayed responses — optional), `WebhookEndpoint`, `WebhookDelivery`.

## Data model

Additive block `// E16`.

```prisma
enum WebhookEndpointStatus { active disabled }
enum WebhookDeliveryStatus { pending delivering succeeded failed dead }

model ApiKey {
  id          String    @id @default(cuid())
  tenantId    String
  name        String
  prefix      String    @unique             // "vk_live_3f9a" — first 12 chars, safe to display
  hash        String    @unique             // SHA-256 of full key; raw key never stored
  mode        String                        // live | test — test keys hit the same API but writes are tagged Batch.isTest = true (E04 field request)
  scopes      String[]
  createdById String
  lastUsedAt  DateTime?
  expiresAt   DateTime?
  revokedAt   DateTime?
  createdAt   DateTime  @default(now())
  @@index([tenantId, revokedAt])
}

model WebhookEndpoint {
  id            String                @id @default(cuid())
  tenantId      String
  url           String                                 // https required outside compose; http allowed when WEBHOOKS_ALLOW_HTTP=true
  secretEnc     String                                 // encrypted via E13 secrets helper; decrypted only inside WebhookSigner
  events        String[]                               // subset of catalogue, or ["*"]
  status        WebhookEndpointStatus @default(active)
  description   String?
  failureStreak Int                   @default(0)      // auto-disable at 50 consecutive dead deliveries
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
  deliveries    WebhookDelivery[]
  @@index([tenantId, status])
}

model WebhookDelivery {
  id             String                @id @default(cuid())
  tenantId       String
  endpointId     String
  event          String
  payload        Json
  attempts       Int                   @default(0)
  status         WebhookDeliveryStatus @default(pending)
  nextAttemptAt  DateTime?
  lastStatusCode Int?
  lastResponse   String?                                // first 2 KB of body
  lastError      String?
  deliveredAt    DateTime?
  createdAt      DateTime @default(now())
  endpoint       WebhookEndpoint @relation(fields: [endpointId], references: [id], onDelete: Cascade)
  @@index([tenantId, endpointId, createdAt])
  @@index([status, nextAttemptAt])
}
```

Change request to E04: add `Batch.isTest Boolean @default(false)` so `vk_test_` keys can mint without touching billing meters (E12 skips `isTest` batches) — filed on E04's issue; until then `vk_test_` keys are read-only.

## Tasks

- [ ] T1 `ApiKeysModule`: schema block + migration `E16_api_keys_webhooks`, `ApiKeyService` (key = `vk_{live|test}_` + 32 base62 chars, SHA-256 hash, prefix), console routes, `apikey.created/revoked` events, `@Audited`. Enforce E15 `maxApiKeys` and `hasFeature('publicApi')` (402 `plan_limit` otherwise).
- [ ] T2 `PublicApiModule` router: Nest `RouterModule` mounting at `/api/v1`, `ApiKeyGuard`, `ScopesGuard`, `ApiErrorFilter` with envelope, `X-Request-Id` echo, `ApiVersion` header (`2026-09-01`) on every response, `GET /api/v1/me`.
- [ ] T3 Rate limiting + idempotency: `RateLimitInterceptor` calling E13 `QuotaService` with `apikey:<id>` and E15 `apiRateLimitPerMin` (fallback env `PUBLIC_API_DEFAULT_RPM=120`), standard headers + 429 envelope; `IdempotencyInterceptor` storing `{ bodyHash, status, response }` in Redis for 24h keyed `idem:<tenantId>:<key>`; missing header on POST → 400 `validation`.
- [ ] T4 Read endpoints: batches, batch units, unit, scans, reports — thin controllers over E04/E06/E08 services; `CursorPaginator` (opaque base64url of `createdAt|id`, `limit` 1–200 default 50, response `{ data, nextCursor }`); tier-2 data never serialised (DTO whitelist tests).
- [ ] T5 Write endpoints: `POST /batches` → `MintService` (202 + `Location`), `POST /units/:id/{flag,decommission,restore}` → E04 `UnitService`; all `@Audited` with `actorType: 'api_key'`, `actorId: apiKey.id`.
- [ ] T6 OpenAPI 3.1: `@nestjs/swagger` decorators on every public DTO/route, `DocumentBuilder` with servers, security scheme `bearerAuth (vk_…)`, tags, examples, webhook payload schemas under `components`; `GET /api/openapi.json`; Scalar UI at `/api/docs` (`@scalar/nestjs-api-reference`); spec committed as `packages/sdk/openapi.json` and CI fails if the generated spec differs from the committed one (`pnpm api:openapi:check`).
- [ ] T7 `packages/sdk`: `openapi-typescript` → `types.gen.ts`; hand-written `createClient({ apiKey, baseUrl })` over `openapi-fetch` with auto `Idempotency-Key` (uuid) on POST, cursor iterator helper `client.batches.listAll()`, `verifyWebhookSignature(secret, headers, rawBody)` helper; README with quick start; published in-repo as `@verifyng/sdk` (workspace), tsup build, tests against the compose API.
- [ ] T8 Deprecation policy: `docs/public-api-deprecation-policy.md` (date-based `ApiVersion`, 12-month support after `Deprecation: true` + `Sunset: <http-date>` + `Link: rel="deprecation"` headers, changelog location, what counts as breaking); `DeprecationInterceptor` reading a static `deprecations.ts` map so a route can be marked without code changes elsewhere.
- [ ] T9 `WebhooksModule` core: `WebhookEndpointService` (URL validation, SSRF guard: block private ranges unless `WEBHOOKS_ALLOW_PRIVATE=true` in compose, secret generation `whsec_` + 32 bytes, encrypt at rest), `WebhookSigner`, console routes, `hasFeature('webhooks')`.
- [ ] T10 `WebhookDispatcher` + `WebhookDeliveryProcessor`: subscribe to catalogue source events, map to external payloads, create `WebhookDelivery` per matching endpoint, enqueue BullMQ `webhooks.deliver` with `jobId = deliveryId`; worker POSTs with 10s timeout, 2xx = succeeded, else backoff `min(24h, 30s × 2^attempt)` with jitter, max 10 attempts (~24h), then `dead` + `webhook.delivery.failed` + E14 notification `webhook.dead_lettered` to owner (template request to E14); `failureStreak` auto-disable at 50; redeliver route resets and re-enqueues.
- [ ] T11 `tools/fakes/webhook-sink` (Node + Hono, port 4105): `POST /hook/:name` records delivery (headers, body, verifies signature when `SINK_SECRET_<NAME>` env is set, shows ✓/✗), `GET /` HTML list newest-first with auto-refresh, `GET /api/deliveries?name=` JSON for tests, `POST /api/behaviour/:name { status: 500 | 'timeout' | 200 }` to force failures, `DELETE /api/deliveries`, `/health`.
- [ ] T12 web-admin `app/(console)/api-keys/**`: list (prefix, name, scopes, last used, expiry, status), create dialog with scope checkboxes and mode toggle, one-time key reveal with copy + "I have stored it" confirmation, revoke with confirm; `app/(console)/webhooks/**`: endpoints list, create/edit (URL, events multiselect, description), secret reveal once + rotate, **Send test** button showing the live result, delivery log with status filter, expandable attempt details (status code, response, error), **Redeliver** button; nav group "Developers" in `nav.config.ts`; in-page link to `/api/docs`.
- [ ] T13 `docs/webhooks-consumer-guide.md`: signature verification sample code in Node, Python and PHP (Nigerian ERP vendors), timestamp window, idempotency on `X-VerifyNG-Delivery`, retry expectations, IP allow-list note, event catalogue table with sample payloads generated from the spec.
- [ ] T14 Playwright E2E for both admin screens; SDK smoke test in CI against compose (`pnpm --filter @verifyng/sdk test:compose`).

## Acceptance criteria

- [ ] AC1 As `ivoryglow` owner at `http://localhost:3001/api-keys` create key *ERP* with scopes `read:batches write:batches read:units` → the full key is shown exactly once; reloading the page shows only `vk_live_…` prefix. `curl localhost:4000/api/v1/me -H "Authorization: Bearer $KEY"` → `{ tenantId:"…", scopes:[…], rateLimit:{ perMinute:120 } }`.
- [ ] AC2 `curl -X POST localhost:4000/api/v1/batches -H "Authorization: Bearer $KEY" -H "Idempotency-Key: demo-1" -d '{"productId":"…","count":100}'` → 202 with batch id; same command again → identical 202 body, and `SELECT count(*) FROM "Batch"` unchanged; same key with `count: 200` → 409 `idempotency_mismatch`; without the header → 400.
- [ ] AC3 Scopes + isolation: a key with only `read:batches` gets 403 `forbidden` on `POST /api/v1/units/:id/flag`; a key of tenant `acme` (E21 seed) calling `GET /api/v1/batches/<ivoryglow batch id>` → 404 (never 403 — no existence leak); E21's isolation matrix passes for every `/api/v1` route.
- [ ] AC4 Rate limit: `hey -n 200 -c 20 -H "Authorization: Bearer $KEY" http://localhost:4000/api/v1/batches` → some 429 responses with `Retry-After` and `X-RateLimit-Remaining: 0`; the count of 2xx in the first minute ≤ the plan's `apiRateLimitPerMin`.
- [ ] AC5 Docs + SDK: `http://localhost:4000/api/docs` renders Scalar with every `/api/v1` route and the webhook schemas; `curl localhost:4000/api/openapi.json | npx @redocly/cli lint -` passes; `pnpm api:openapi:check` is green; in `packages/sdk/examples/list-batches.ts`, `createClient({ apiKey, baseUrl:'http://localhost:4000' }).batches.list()` returns typed data (`tsc` green).
- [ ] AC6 Webhooks happy path: create endpoint `http://webhook-sink:4105/hook/erp` subscribed to `unit.flagged`; flag a unit in the console → within 5s `http://localhost:4105` shows the delivery with ✓ signature (sink has the secret), `X-VerifyNG-Event: unit.flagged`; the delivery log at `http://localhost:3001/webhooks/<id>/deliveries` shows `succeeded`, 1 attempt, 200.
- [ ] AC7 Retries + dead-letter: `curl -X POST localhost:4105/api/behaviour/erp -d '{"status":500}'`, flag another unit → delivery shows `failed` with growing `nextAttemptAt`; with `WEBHOOKS_BACKOFF_BASE_MS=100` in compose the 10th attempt lands within a minute → status `dead`, `webhook.delivery.failed` in audit, owner email in Mailpit; set behaviour back to 200, click **Redeliver** → `succeeded`.
- [ ] AC8 Signature: **Send test** posts a `ping`; the sink's verifier accepts it; replaying the same request via `curl` to the sink with a timestamp older than 5 minutes is marked ✗ (stale) — matching the sample code in `docs/webhooks-consumer-guide.md`.
- [ ] AC9 Deprecation headers: mark `GET /api/v1/me` deprecated in `deprecations.ts` on a throwaway branch → response carries `Deprecation: true`, `Sunset: <date>`, `Link: <…deprecation-policy>; rel="deprecation"`; spec shows `deprecated: true`.

## Testing

- Unit: key generation/hashing/prefix, `ScopesGuard` matrix, cursor encode/decode round-trip + tamper, error filter mapping for every Nest exception type, `WebhookSigner` (valid, tampered body, tampered timestamp, stale, future-skewed), backoff schedule table, SSRF URL validator.
- Integration (Postgres + Redis): idempotency replay/mismatch/in-flight, rate-limit headers via real `QuotaService`, dispatcher fan-out creates one delivery per subscribed endpoint only, processor state transitions with a local HTTP stub returning 200/500/timeout, auto-disable at streak 50, redeliver, tenant isolation on every public route (feeds E21's matrix).
- Contract: generated spec vs committed spec diff; Dredd or Schemathesis run from E21 against compose using the committed spec (E16 keeps the spec accurate; E21 owns the runner).
- E2E (Playwright): key lifecycle screen, webhook create → test-send → log → redeliver; SDK compose smoke.

## Compose services added

| Service | Image | Host port | Notes |
|---|---|---|---|
| webhook-sink | tools/fakes/webhook-sink | 4105 | `SINK_SECRET_ERP` set by the E2E fixture via `POST /api/secrets/:name` (dev only) |

`api` env additions: `PUBLIC_API_DEFAULT_RPM=120`, `WEBHOOKS_ALLOW_HTTP=true`, `WEBHOOKS_ALLOW_PRIVATE=true`, `WEBHOOKS_BACKOFF_BASE_MS=30000` (E2E override 100), `WEBHOOKS_MAX_ATTEMPTS=10`.

## Notes and decisions

- **Two routers, one app.** `/v1/**` is the internal console/consumer API (JWT or anonymous); `/api/v1/**` is the public key-authenticated API. They share services, never controllers, so consumer verify can never be gated by a key and the public surface can evolve on its own deprecation clock.
- **Keys are bearer secrets**, hashed with SHA-256 (high entropy, no need for bcrypt), looked up by `prefix` then constant-time compared on hash. `lastUsedAt` is updated at most once a minute per key to avoid write amplification.
- **Test mode.** `vk_test_` keys exist so integrators can wire an ERP without minting billable units; depends on E04 adding `Batch.isTest`. Until then test keys are read-only and the docs say so.
- **Date-based API version** (`2026-09-01`) rather than `/api/v2` paths: breaking changes ship as a new date, old dates keep working for 12 months, `Sunset` announces the end. Path stays `/api/v1` as the router namespace.
- **Webhook payloads carry ids and minimal data**, never tier-2 codes; consumers fetch details via the API. Signature covers `timestamp.body` so replay outside the 5-minute window fails even with a valid HMAC.
- **SSRF.** Endpoint URLs resolve and are rejected for loopback/RFC1918/link-local unless `WEBHOOKS_ALLOW_PRIVATE=true` (compose only). Redirects are not followed.
- **OpenAPI is the contract.** The committed `packages/sdk/openapi.json` is what E21 tests against and what the SDK is generated from; drift fails CI.
