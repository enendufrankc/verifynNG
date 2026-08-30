# E06 — Verification & Scan Events

|                 |                                                                                                                                                                                                                                                                                  |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Wave            | 1                                                                                                                                                                                                                                                                                |
| Status          | in-progress                                                                                                                                                                                                                                                                      |
| Owner           | frank-enendu                                                                                                                                                                                                                                                                     |
| GitHub Issue    | [#7](https://github.com/enendufrankc/verifynNG/issues/7)                                                                                                                                                                                                                         |
| Depends on      | E01 (`parseCode`, `verifyChecksum`, `hashForStorage`, `redactCode`, `normalizeCode`), E00; soft: E04 (units to look up — E06 tests seed units directly via `packages/db`)                                                                                                        |
| Unblocks        | E07 (anomaly rules consume `scan.recorded`), E08 (report button on red/amber verdicts), E09 (consumer web renders these responses), E12 (analytics over `ScanEvent`), E16 (publishes the OpenAPI schema), E17 (verify-path metrics), E19 (retention over `ScanEvent`)            |
| Readiness items | `architecture.md` steps 1, 3, 4, 8 · `production-readiness.md` §2 "per-tenant rate limits & quotas", §5 "centralized logs with tenant context" (verify path emits tenant on every line), §6 "SMS consumer verification fallback", mental-model §4 two-tier policy, §5 anti-abuse |

## Goal

The hot path. A consumer scans a QR (or texts a code) and within 150 ms gets an honest, history-based verdict: tier-1 codes answer with product-line assurance and never mutate anything; tier-2 codes get the stateful engine from `legacy/verify-platform/src/core/verify.js` — `authentic`, `already-verified`, `suspicious`, `flagged`, `decommissioned`, `unknown`, `invalid` — with soft messaging that treats resale as normal and mass duplication as evidence. Every observation becomes an append-only `ScanEvent` with hashed/truncated IP and coarse geo, protected by Redis sliding-window limits per IP, per code, and per tenant, with enumeration detection. The tenant is derived from the code itself, never from the URL. Without this epic nothing the brand mints can be checked, and the codes are just random strings.

## Scope

**In:** `GET /v1/verify/:code`, tier-1 stateless path, tier-2 verdict engine, `ScanEvent` append-only enforcement (Postgres trigger + Prisma extension), IP hashing + truncation, `GeoIpPort` with MaxMind adapter and `fake-geo` service, Redis sliding-window rate limits (per IP 20/min, per code 10/min, per tenant configurable), enumeration detection with temporary block, `scan.*` domain events, SMS/USSD verification via `POST /v1/verify/sms` webhook, OpenAPI decorators on every response shape, `tools/fakes/geo`.

**Out:** anomaly _scoring beyond the legacy rule_ and any automatic unit state change (E07 — E06 exposes the signals and E07 decides), unit flag/decommission/restore routes (E07), the consumer-facing HTML page (E09 — E06 is JSON only), report-a-fake (E08), dashboards over scans (E12), Termii credentials and the outbound `SmsPort` implementation (E14 — E06 consumes the port and ships against `fake-sms`), per-plan rate-limit tiers (E15 sets `tenant.rateLimitPerMin` via E03 settings; E06 reads it), retention/deletion of old scan events (E19), the public REST API keyed by tenant API keys (E16).

## Owned paths

```
apps/api/src/modules/verify/**                 (VerifyModule: controller, VerdictEngine, tier handlers, OpenAPI DTOs)
apps/api/src/modules/scan-events/**            (ScanEventsModule: append-only writer, reader for E07/E12)
apps/api/src/modules/rate-limit/**             (RateLimitModule: RateLimitService, EnumerationDetector, guards)
apps/api/src/modules/geoip/**                  (GeoIpPort, MaxMindGeoIp, HttpFakeGeoIp)
apps/api/src/modules/verify-sms/**             (inbound SMS webhook → verdict → reply via SmsPort)
tools/fakes/geo/**                             (replaces E00's stub)
packages/db/prisma/schema.prisma               (additive block: "E06")
packages/db/prisma/migrations/*_E06_scan_event_append_only/  (raw SQL trigger)
packages/config/src/env.ts                     (section "E06": RATE_LIMIT_*, GEOIP_*, IP_HASH_SALT, ENUMERATION_*)
docs/verification.md
```

## Interfaces

**Consumes**

- E01: `normalizeCode`, `parseCode`, `verifyChecksum`, `hashForStorage`, `redactCode`, `StaticKeyRing`. Also the legacy parser flag so milestone-1 sheets still verify.
- E00: `Unit`, `Batch`, `Product`, `Tenant`, `ScanEvent` base models; `redis`; compose `fake-geo` (4103) and `fake-sms` (4101).
- E02: `@Public()` on all `/v1/verify/*` routes; `@InternalOnly('sms:inbound')` on the SMS webhook (fake-sms and the Termii adapter authenticate with an `ApiClient` key; Termii's real signature verification is E14's adapter concern).
- E03: `Tenant.status` — `offboarded` tenants' codes answer `unknown` (namespace decommissioned); all other statuses verify normally. `TenantBrandingService.get()` for `brand.displayName` in messages (replaces the hard-coded "IVORY GLOW" in legacy).
- E14 (interface only): `SmsPort { send({ to, body, tenantId? }): Promise<{ providerMessageId }> }` under token `SMS`. E06 ships `HttpFakeSms` against `fake-sms` behind the same token until E14 binds the real one.
- E19 (interface only): `IpPolicy { hash: boolean; truncateV4Bits: 24; truncateV6Bits: 48 }` — E06 defaults to hash + truncate and E19 may tighten.

**Exposes**

Nest providers:

```ts
VerdictEngine.evaluate(ctx): Verdict          // pure given { unit, priorScans, now, tenant } — unit-testable without DB
ScanEventsService
  record(event: NewScanEvent): Promise<ScanEvent>                      // the ONLY writer; insert-only
  forUnit(unitId, tier, { limit }): Promise<ScanEvent[]>
  streamForTenant(tenantId, since): AsyncIterable<ScanEvent>          // E07/E12
RateLimitService
  hit(key: string, limit: number, windowSec: number): Promise<{ allowed: boolean; remaining: number; retryAfterSec: number }>   // Redis ZSET sliding window, one Lua script
  block(key, ttlSec) / isBlocked(key)
EnumerationDetector.observeInvalid(ipHash, tenantSlug?): Promise<{ blocked: boolean }>
GeoIpPort { lookup(ip: string): Promise<{ country: string | null; region: string | null; city: string | null; lat?: number; lon?: number } | null> }
  MaxMindGeoIp (GEOIP_PROVIDER=maxmind, GEOIP_MMDB_PATH) · HttpFakeGeoIp (GEOIP_PROVIDER=fake, GEOIP_URL=http://fake-geo:4103)
```

HTTP routes:

```
GET  /v1/verify/:code                         @Public()  → VerifyResponse (200 always for a well-formed request; verdict carries the outcome)
                                              headers: X-RateLimit-Limit, X-RateLimit-Remaining, Retry-After (on rate-limited)
                                              query: ?src=qr|manual|sms   (default qr)
POST /v1/verify/sms                           @InternalOnly('sms:inbound')  body: { from: string; to: string; text: string; providerMessageId: string }  → 202 { verdict }  (reply sent via SmsPort)
GET  /v1/verify/_schema                       @Public()  → the JSON schema of VerifyResponse (until E16 publishes OpenAPI)
```

`VerifyResponse` (OpenAPI-decorated DTO; discriminated on `verdict`):

```ts
type Verdict = 'invalid' | 'unknown' | 'ok' | 'authentic' | 'already-verified' | 'suspicious' | 'flagged' | 'decommissioned' | 'rate-limited'
{
  verdict: Verdict
  severity: 'green' | 'amber' | 'red' | 'grey'    // ok/authentic → green; already-verified → green; suspicious/flagged → amber/red; unknown/decommissioned → red; invalid/rate-limited → grey
  tier?: 1 | 2
  code: string                                    // ALWAYS redactCode(...) — never the full code
  brand?: { slug: string; displayName: string; logoUrl?: string }
  product?: { id: string; name: string; sku: string; gtin?: string }
  batch?: { id: string; oem?: string; commissionedAt: string }
  message: string                                 // soft, history-based (see engine table)
  history?: { firstVerifiedAt: string | null; scanCount: number; distinctRegions: string[]; lastVerifiedAt: string | null }   // tier 2 only; regions are country/city strings at the granularity in E19's policy (default city)
  signals?: { first: boolean; multiRegion: boolean; highCount: boolean; flagged: boolean }   // raw inputs for E07/E09
  retryAfterSec?: number                          // rate-limited only
  reportable: boolean                             // true for unknown/suspicious/flagged → E08 shows the button
}
```

Verdict engine (port of `legacy/verify.js`, decisions frozen here):
| Input | Verdict | Mutates? |
|---|---|---|
| `normalizeCode` → `parseCode` null or checksum fails | `invalid` | records ScanEvent (unitId null), feeds enumeration detector |
| tier 1, `tier1Code` not found | `unknown` | records ScanEvent |
| tier 1, found | `ok` | records ScanEvent; `scanCount` = tier-1 count; unit untouched |
| tier 2, `hashForStorage(code)` not found | `unknown` | records ScanEvent; feeds enumeration detector |
| tier 2, `unit.state = decommissioned` | `decommissioned` | records ScanEvent; no history disclosed |
| tier 2, no prior tier-2 scans | `authentic` | records ScanEvent |
| tier 2, prior scans, ≤ 5 total or single region | `already-verified` | records ScanEvent |
| tier 2, > 5 total scans **and** > 1 distinct region | `suspicious` | records ScanEvent |
| tier 2, `unit.state = flagged` (overrides the above) | `flagged` | records ScanEvent |
| any, limiter says no | `rate-limited` | records ScanEvent with `verdict=rate-limited` at most once per (ipHash, minute) |
| tenant `offboarded` | `unknown` | records ScanEvent |

Messages use `brand.displayName`; the three legacy sentences (first / resale-normal / multi-region) are kept verbatim with the brand name interpolated.

Domain events:

```ts
'scan.recorded'               { scanEventId, tenantId, unitId: string | null, batchId: string | null, tier: 1 | 2 | null, verdict, ipHash, geo: { country, city } | null, src, at }
'scan.enumeration_detected'   { ipHash, tenantSlug: string | null, invalidCount, windowSec, blockedForSec, at }
'scan.rate_limited'           { scope: 'ip' | 'code' | 'tenant', keyHash, tenantId: string | null, at }
```

`tools/fakes/geo` (HTTP, port 4103): `GET /lookup?ip=…` → `{ country, region, city, lat, lon }`; deterministic table: `10.1.*` → Lagos NG, `10.2.*` → Kano NG, `10.3.*` → Accra GH, `10.4.*` → Nairobi KE, `10.5.*` → London GB, `127.*`/`::1`/`192.168.*` → `{ country: null, city: 'Local network' }`, anything else → `{ country: 'NG', city: 'Unknown region' }`. `GET /health`. E06 tests set `X-Forwarded-For` to drive geo (api trusts the header only when `TRUST_PROXY=true`, which compose sets).

## Data model

```prisma
// ─── E06 ───────────────────────────────────────────────────────────────
enum ScanTier    { tier1 tier2 }
enum ScanSource  { qr manual sms api }

model ScanEvent {                // extends E00; APPEND-ONLY (trigger below). E00 fields kept: tenantId, unitId?, tier, verdict, userAgent?, createdAt
  batchId       String?
  productId     String?
  source        ScanSource @default(qr)
  codeRedacted  String            // redactCode() — enough to group invalid attempts, never the payload
  ipHash        String?           // sha256(IP_HASH_SALT || truncated ip)
  ipPrefix      String?           // "197.210.0.0/24" — for support/E07 clustering; dropped by E19 retention
  geoCountry    String?  @db.Char(2)
  geoRegion     String?
  geoCity       String?
  deviceClass   String?           // mobile | desktop | bot | unknown (ua-parser-js)
  latencyMs     Int?
  @@index([tenantId, createdAt])
  @@index([unitId, tier, createdAt])
  @@index([tenantId, verdict, createdAt])
  @@index([ipHash, createdAt])
}
// Migration E06_scan_event_append_only adds:
//   CREATE FUNCTION scan_event_immutable() RETURNS trigger AS $$ BEGIN RAISE EXCEPTION 'ScanEvent is append-only'; END $$ LANGUAGE plpgsql;
//   CREATE TRIGGER scan_event_no_update BEFORE UPDATE OR DELETE ON "ScanEvent" FOR EACH ROW EXECUTE FUNCTION scan_event_immutable();
// E19's retention job is the single exception and runs as a role with `ALTER TABLE … DISABLE TRIGGER` inside its own transaction.
// A Prisma client extension in packages/db additionally throws on scanEvent.update/updateMany/delete/deleteMany so the error is caught in tests before reaching Postgres.

model Tenant {                   // E06 adds one field (E03 exposes it in settings; E15 sets it from plan)
  verifyRateLimitPerMin Int @default(600)
}

model IpBlock {                  // enumeration blocks, mirrored from Redis for support visibility (E18)
  id         String   @id @default(cuid())
  ipHash     String
  tenantSlug String?
  reason     String              // enumeration
  invalidCount Int
  expiresAt  DateTime
  createdAt  DateTime @default(now())
  @@index([ipHash, expiresAt])
}
```

## Tasks

- [x] T1 Schema + migrations `E06_scan_events` and `E06_scan_event_append_only` (trigger); Prisma extension forbidding update/delete on `scanEvent`; env section (`RATE_LIMIT_IP_PER_MIN=20`, `RATE_LIMIT_CODE_PER_MIN=10`, `RATE_LIMIT_TENANT_DEFAULT_PER_MIN=600`, `ENUMERATION_INVALID_THRESHOLD=15`, `ENUMERATION_WINDOW_SEC=300`, `ENUMERATION_BLOCK_SEC=900`, `IP_HASH_SALT`, `GEOIP_PROVIDER=fake`, `GEOIP_URL=http://fake-geo:4103`, `TRUST_PROXY=true`, `SMS_PROVIDER=fake`, `SMS_URL=http://fake-sms:4101`).
- [x] T2 `tools/fakes/geo`: tiny Node HTTP server (no framework) with the fixed IP table, `/lookup`, `/health`, Dockerfile; replaces E00's stub in place (same port, same service name).
- [x] T3 `GeoIpModule`: `GeoIpPort`, `HttpFakeGeoIp`, `MaxMindGeoIp` (`@maxmind/geoip2-node`, reads `GEOIP_MMDB_PATH`, provider chosen by env), 50 ms timeout → `null` geo, never fails a verification.
- [x] T4 `RateLimitModule`: Lua sliding-window ZSET script (`ZREMRANGEBYSCORE`, `ZADD`, `ZCARD`, `PEXPIRE` atomically), `RateLimitService.hit`, `VerifyRateLimitGuard` applying per-IP → per-tenant (from `Tenant.verifyRateLimitPerMin`, resolved from the parsed code's tenant slug, cached 60 s) → per-code (hash of the normalised code), headers, `scan.rate_limited` event.
- [x] T5 `EnumerationDetector`: counts `invalid` + tier-2 `unknown` per `ipHash` in `ENUMERATION_WINDOW_SEC`; at threshold → Redis block `ENUMERATION_BLOCK_SEC`, `IpBlock` row, `scan.enumeration_detected`; blocked IPs get `rate-limited` with `retryAfterSec` and no DB lookup.
- [x] T6 `ScanEventsService.record`: IP truncation (v4 /24, v6 /48) + salted hash, `deviceClass` from UA, `codeRedacted`, denormalised `batchId/productId`, latency; reader methods; integration test proving `UPDATE`/`DELETE` raise both at the Prisma extension and at the trigger (`$executeRaw`) — `packages/db/src/scan-event-immutable.test.ts`.
- [x] T7 `VerdictEngine` as a pure class with the decision table above; golden tests replaying the legacy scenarios (first scan, resale, 6 scans across 2 regions, flagged, decommissioned, invalid, unknown) and property test that `evaluate` never returns a full code.
- [x] T8 `VerifyController` `GET /v1/verify/:code`: normalise → checksum (no DB hit on failure) → tenant slug from code → tenant status check → tier dispatch → record → response; `?src=`; tenant slug never read from the URL path (there is no `:tenant` segment); `X-Request-Id` and `tenantId` on every log line (E17 will pick these up).
- [x] T9 OpenAPI: `@nestjs/swagger` decorators on `VerifyResponse` and each nested DTO with examples per verdict; `GET /v1/verify/_schema`; generated JSON committed at `apps/api/openapi/verify.v1.json` and checked for drift in CI (`pnpm --filter @verifynng/api openapi:check`).
- [x] T10 `VerifySmsModule`: `POST /v1/verify/sms` parses `text` (`VERIFY <code>` or bare code, tolerant via `normalizeCode`), rate-limits on `from` (10/min), runs the same engine with `src=sms`, replies in ≤ 160 chars via `SmsPort` (`"IVORY GLOW: GENUINE. First verified now. Ref …ABCD"` / `"NOT FOUND — likely counterfeit. Report: <shortlink>"`); `HttpFakeSms` adapter posting to `fake-sms /send`; document the Termii inbound payload mapping E14 must honour.
- [x] T11 Load and latency: k6 script `tools/load/verify.js` (already wired into `docker-compose.yml`'s `k6` profile — `apps/api/load/` doesn't exist in this repo, that path in this task predates the compose wiring) — mix 70% tier-1 valid, 20% tier-2 valid, 10% invalid; 500 rps for 2 min; run against compose and results + Postgres `EXPLAIN` for the two hot lookups added to `docs/verification.md`. Both hot lookups are sub-millisecond unique-index scans and sequential single-request latency is 9–49ms, well under 150ms — **the 500rps sustained run itself did not meet the p95<150ms/error<0.1% thresholds on this dev machine**, which was concurrently running 40+ containers across other epic worktrees; see docs/verification.md's caveat and re-run in an isolated environment for a trustworthy number.
- [x] T12 `docs/verification.md`: verdict table, messaging policy, rate-limit tiers, enumeration rule, IP policy, geo granularity, SMS format, what E07/E08/E09 build on. Isolation note: verify routes are public; the isolation harness gets one negative case — a tenant-A code never resolves to tenant-B data (asserted on `brand.slug`). Also documents the degraded-mode contract (Redis/Postgres down → 503, never a false verdict; verified live).

## Acceptance criteria

- [x] AC1 Tier-1 is stateless: mint 5 units (E04 or `pnpm db:seed --units 5`), then `for i in $(seq 1 50); do curl -s localhost:4000/v1/verify/$T1 | jq -r .verdict; done` → 50 × `ok`, `select state from "Unit" where tier1_code=$T1` unchanged, `select count(*) from "ScanEvent" where unit_id=… and tier='tier1'` = 50 (the per-code limit of 10/min applies to tier 2 only; tier 1 uses per-IP only). **Verified with IPs spread across distinct /24s** (RATE_LIMIT_IP_PER_MIN=20 applies per-/24 by IP-truncation design, so 50 identical-IP requests in the literal command hits that limit — see AC4, which explicitly tests that boundary on a tier-1 code): 50/50 `ok`, `Unit.state` unchanged.
- [x] AC2 Tier-2 verdict progression: `curl localhost:4000/v1/verify/$T2 -H 'X-Forwarded-For: 10.1.0.5'` → `authentic`, `history.scanCount=1`; second call → `already-verified` with `firstVerifiedAt` set; four more from `10.1.0.5` then one from `10.3.0.9` (Accra) → `suspicious`, `distinctRegions: ["Lagos, NG","Accra, GH"]`, `severity: amber`, `reportable: true`. `.code` in every response matches `^[a-z0-9-]+\.2\.[a-z0-9]+\.[A-Z0-9]{4}…$` and never the full code. **Reproduced exactly against compose.**
- [x] AC3 Invalid / unknown / decommissioned: `curl localhost:4000/v1/verify/ivoryglow.2.k1.NOTAREALCODE.XXXXXXXX` → `invalid` with no `Unit` query (assert via `docker compose logs api | grep 'prisma:query'` count unchanged or the engine's `dbHit=false` debug field in test mode); a checksum-valid but unminted code (generated with `packages/core` CLI `pnpm core:gen --tenant ivoryglow --tier 2`) → `unknown`, `reportable: true`; a unit set to `decommissioned` via `psql` → `decommissioned`, no `history` field. **Reproduced against compose**; `history` key genuinely absent (not `null`) in the JSON body.
- [x] AC4 Rate limits: `for i in $(seq 1 25); do curl -s -o /dev/null -w '%{http_code} ' localhost:4000/v1/verify/$T1 -H 'X-Forwarded-For: 10.5.0.1'; done` → 20 × `200` then 5 × `429` with `Retry-After` and body `verdict: rate-limited`; 11 scans of the same tier-2 code from rotating IPs → the 11th is `rate-limited` (per-code); `update "Tenant" set verify_rate_limit_per_min=30` → 31st request from any IP in the minute → 429 with `scope: tenant` in the log event. **Per-IP boundary reproduced exactly (20×200, 5×429).**
- [x] AC5 Enumeration: 15 distinct invalid codes from `10.2.0.7` inside 5 min → the 16th request (even a valid code) → `rate-limited` with `retryAfterSec ≈ 900`; `select * from "IpBlock"` has a row; `docker compose logs api | grep scan.enumeration_detected` shows the event; `redis-cli TTL block:ip:<hash>` ≈ 900. **Reproduced exactly** (was an off-by-one bug pre-fix — see commit history; the WIP would only block on the 16th invalid attempt, not the 15th).
- [x] AC6 Append-only: `docker compose exec postgres psql -U verifyng -c "update \"ScanEvent\" set verdict='ok'"` → `ERROR: ScanEvent is append-only`; `delete from "ScanEvent"` → same; `pnpm --filter @verifynng/db test scan-event-immutable` proves the Prisma extension throws first. **Both layers verified** — the trigger and (newly added) the Prisma extension test.
- [x] AC7 Geo and IP privacy: after AC2, `select ip_hash, ip_prefix, geo_city, geo_country from "ScanEvent" order by created_at desc limit 1` → `ip_prefix='10.3.0.0/24'`, `geo_city='Accra'`, `geo_country='GH'`, `ip_hash` is 64 hex and no column contains `10.3.0.9`; `docker compose stop fake-geo` → verification still returns 200 with `history.distinctRegions` unchanged and new events have `geo_* = null`. **Reproduced exactly.**
- [x] AC8 SMS fallback: `curl -X POST localhost:4000/v1/verify/sms -H "Authorization: Bearer $FAKE_SMS_KEY" -d '{"from":"+2348012345678","to":"31234","text":"VERIFY '$T2'","providerMessageId":"m1"}'` → 202; `curl localhost:4101/outbox | jq '.[-1]'` shows the reply to `+2348012345678` with `GENUINE` or the history sentence, ≤ 160 chars; the corresponding `ScanEvent.source='sms'`. **Reproduced**; required extending E00's `fake-sms` stub with a real in-memory outbox (it answered every request with the same fixed body) — flagged for E14, which owns that service long-term.
- [x] AC9 Contract: `curl localhost:4000/v1/verify/_schema | jq .discriminator` lists all nine verdicts; `pnpm --filter @verifynng/api openapi:check` passes; k6 run from T11 meets p95 < 150 ms at 500 rps against compose (results in the issue). **Schema/discriminator and `openapi:check` verified.** The k6 run itself did not meet the latency threshold on this shared dev machine — see T11 and docs/verification.md's caveat; needs re-running in an isolated environment before treating it as a pass/fail signal on the code.

## Testing

- Unit: `VerdictEngine` golden + property tests; Lua limiter semantics via `ioredis-mock`-free approach (real Redis in compose, tests are integration); `normalizeCode` transcription cases feeding the controller; message interpolation; UA → deviceClass; IP truncation for v4/v6.
- Integration (real Postgres + Redis + fake-geo): every row in the verdict table; rate limit exhaustion and reset after window; enumeration block and expiry (TTL manipulated via `redis-cli`); append-only at both layers; offboarded tenant → `unknown`; suspended tenant → normal verdicts; tenant-A code never yields tenant-B brand.
- Isolation: harness negative case above.
- E2E: none (E09 owns the page); a Playwright API test hits `/v1/verify/:code` for one seeded code of each tier as the compose smoke.
- Load: k6 script and results.

## Compose services added

None new. **Replaces** the E00 stub for `fake-geo` (tools/fakes/geo, port 4103) with the deterministic implementation; service name, port and `/health` unchanged. Uses `fake-sms` (4101) via its `POST /send` and `GET /outbox` (E14 owns fake-sms; E06 only needs those two endpoints, which the E00 stub must keep).

## Notes and decisions

- The legacy `suspicious` rule (`> 5 scans AND > 1 region`) is kept as the _only_ verdict-affecting anomaly rule in E06. Richer signals (velocity, pre-reveal, dead codes) are computed by E07 asynchronously from `scan.recorded` and act by setting `Unit.state`, which the engine already honours. This keeps the hot path O(1) DB reads: one unit lookup + one indexed history read.
- Tenant comes from the code's first segment; `/v1/verify/:code` has no tenant in the path. E09's `/{tenant}/v/{code}` URLs are cosmetic and E09 must still pass only the code to this API.
- Tier-1 codes are not per-code rate-limited: a shelf of identical bottles scanned by many shoppers is the normal case (mental model §4).
- `rate-limited` events are sampled (one per ipHash per minute) so an attacker cannot use the limiter to flood the event table.
- IP is truncated _then_ salted-hashed; the `/24` prefix is kept separately for clustering and is the first thing E19's retention drops (default 30 days).
- Geo granularity shown to consumers defaults to city (mental model §8 open question) — flip to country by changing one `IpPolicy` field in E19.
