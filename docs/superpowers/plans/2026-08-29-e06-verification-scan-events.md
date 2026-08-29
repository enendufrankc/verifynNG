# E06 Verification & Scan Events — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the verification hot path — consumer scans QR, gets a verdict within 150ms, every scan becomes an append-only event.

**Architecture:** NestJS modules (verify, scan-events, rate-limit, geoip, verify-sms) in the API app, backed by Postgres (ScanEvent with trigger) and Redis (sliding-window rate limits + enumeration blocks). VerdictEngine is a pure class with no I/O. fake-geo gets a deterministic lookup table. All verify routes are @Public().

**Tech Stack:** NestJS, Prisma, Redis (ioredis + Lua), PostgreSQL triggers, @nestjs/swagger, ua-parser-js, ioredis

---

## File Structure

### New files to create:
```
apps/api/src/modules/verify/verify.module.ts
apps/api/src/modules/verify/verify.controller.ts
apps/api/src/modules/verify/verify.controller.spec.ts
apps/api/src/modules/verify/verdict-engine.ts
apps/api/src/modules/verify/verdict-engine.spec.ts
apps/api/src/modules/verify/dto/verify-response.dto.ts
apps/api/src/modules/verify/dto/verify-response.examples.ts
apps/api/src/modules/scan-events/scan-events.module.ts
apps/api/src/modules/scan-events/scan-events.service.ts
apps/api/src/modules/scan-events/scan-events.service.spec.ts
apps/api/src/modules/rate-limit/rate-limit.module.ts
apps/api/src/modules/rate-limit/rate-limit.service.ts
apps/api/src/modules/rate-limit/rate-limit.service.spec.ts
apps/api/src/modules/rate-limit/enumeration-detector.ts
apps/api/src/modules/rate-limit/enumeration-detector.spec.ts
apps/api/src/modules/geoip/geoip.module.ts
apps/api/src/modules/geoip/geoip.port.ts
apps/api/src/modules/geoip/http-fake-geoip.ts
apps/api/src/modules/geoip/maxmind-geoip.ts
apps/api/src/modules/geoip/geoip.service.spec.ts
apps/api/src/modules/verify-sms/verify-sms.module.ts
apps/api/src/modules/verify-sms/verify-sms.controller.ts
apps/api/src/modules/verify-sms/sms.port.ts
apps/api/src/modules/verify-sms/http-fake-sms.ts
apps/api/src/modules/verify-sms/verify-sms.controller.spec.ts
packages/db/prisma/migrations/20260829_E06_scan_events/migration.sql
packages/db/prisma/migrations/20260829_E06_scan_event_append_only/migration.sql
packages/db/src/scan-event-extension.ts
tools/fakes/geo/server.mjs  (replace)
docs/verification.md
apps/api/src/common/ip-utils.ts
apps/api/src/common/ip-utils.spec.ts
apps/api/src/common/ua-utils.ts
apps/api/src/common/ua-utils.spec.ts
```

### Files to modify:
```
packages/db/prisma/schema.prisma          (additive E06 block)
packages/config/src/env-schema.ts         (E06 section)
packages/db/src/index.ts                  (export scan-event extension)
apps/api/src/app.module.ts                (one-line import per module)
docker/compose.yml                        (E06 env vars on api service)
apps/api/package.json                     (add dependencies)
```

---

## Task 1: Schema, Migrations, and Env Vars

**Files:**
- Modify: `packages/db/prisma/schema.prisma`
- Create: `packages/db/prisma/migrations/20260829_E06_scan_events/migration.sql`
- Create: `packages/db/prisma/migrations/20260829_E06_scan_event_append_only/migration.sql`
- Create: `packages/db/src/scan-event-extension.ts`
- Modify: `packages/db/src/index.ts`
- Modify: `packages/config/src/env-schema.ts`

### Step 1.1: Add E06 enums and ScanEvent fields to schema.prisma

Add after the existing ScanEvent model's closing brace, and modify the existing ScanEvent model to add E06 fields:

```prisma
// ─── E06 ───────────────────────────────────────────────────────────────
enum ScanTier    { tier1 tier2 }
enum ScanSource  { qr manual sms api }
```

Modify existing ScanEvent to add E06 fields (batchId, productId, source, codeRedacted, ipHash, ipPrefix, geoCountry with @db.Char(2), geoRegion, geoCity, deviceClass, latencyMs) and update indexes. Add `verifyRateLimitPerMin` to Tenant model. Add IpBlock model.

**Note:** The existing ScanEvent has `ip String?` — E06 replaces this with `ipHash` and `ipPrefix`. Need to handle the migration carefully: drop old `ip` column, add new columns.

### Step 1.2: Create the migration SQL files

First migration (`E06_scan_events`): ALTER ScanEvent to add new columns, drop old `ip`, add IpBlock table, add enums, add Tenant.verifyRateLimitPerMin.

Second migration (`E06_scan_event_append_only`): Create the trigger function and trigger.

### Step 1.3: Add Prisma client extension for append-only enforcement

In `packages/db/src/scan-event-extension.ts`:
```ts
import { Prisma } from '@prisma/client';

export function scanEventExtension() {
  return Prisma.defineExtension({
    name: 'scanEventAppendOnly',
    query: {
      scanEvent: {
        async update({ args, query }) {
          throw new Error('ScanEvent is append-only: update not allowed');
        },
        async updateMany({ args, query }) {
          throw new Error('ScanEvent is append-only: updateMany not allowed');
        },
        async delete({ args, query }) {
          throw new Error('ScanEvent is append-only: delete not allowed');
        },
        async deleteMany({ args, query }) {
          throw new Error('ScanEvent is append-only: deleteMany not allowed');
        },
      },
    },
  });
}
```

### Step 1.4: Wire extension into PrismaClient

Modify `packages/db/src/prisma-client.ts` to apply the extension.

### Step 1.5: Add E06 env vars to packages/config/src/env-schema.ts

Add a section comment `// ── E06 Verification & Scan Events ──` with all the env vars listed in the epic.

### Step 1.6: Export extension from packages/db/src/index.ts

### Step 1.7: Run pnpm db:migrate and verify

Run `pnpm install && pnpm --filter @verifynng/db prisma:generate` then test the migration.

- [ ] Commit: `feat(E06): T1 — schema, migrations, env vars, Prisma append-only extension`

---

## Task 2: fake-geo Deterministic Server

**Files:**
- Replace: `tools/fakes/geo/server.mjs`

### Step 2.1: Rewrite server.mjs with deterministic IP table

Implement the lookup table from the epic spec:
- `10.1.*` → Lagos NG
- `10.2.*` → Kano NG
- `10.3.*` → Accra GH
- `10.4.*` → Nairobi KE
- `10.5.*` → London GB
- `127.*`/`::1`/`192.168.*` → `{ country: null, city: 'Local network' }`
- Anything else → `{ country: 'NG', city: 'Unknown region' }`

Add `GET /lookup?ip=...` and keep `GET /health`.

### Step 2.2: Rebuild Docker image and test

Run `docker compose build fake-geo` and verify with curl.

- [ ] Commit: `feat(E06): T2 — deterministic fake-geo server`

---

## Task 3: GeoIpModule

**Files:**
- Create: `apps/api/src/modules/geoip/geoip.port.ts`
- Create: `apps/api/src/modules/geoip/http-fake-geoip.ts`
- Create: `apps/api/src/modules/geoip/maxmind-geoip.ts`
- Create: `apps/api/src/modules/geoip/geoip.module.ts`
- Create: `apps/api/src/modules/geoip/geoip.service.spec.ts`

### Step 3.1: Define GeoIpPort interface

```ts
export const GEO_IP_PORT = Symbol('GEO_IP_PORT');
export interface GeoIpPort {
  lookup(ip: string): Promise<{
    country: string | null;
    region: string | null;
    city: string | null;
    lat?: number;
    lon?: number;
  } | null>;
}
```

### Step 3.2: Implement HttpFakeGeoIp

HTTP call to `GEOIP_URL/lookup?ip=...` with 50ms timeout. Returns null on timeout/error.

### Step 3.3: Implement MaxMindGeoIp

Stub that reads `GEOIP_MMDB_PATH` — actual MaxMind integration is optional; for now just throw if provider is maxmind and no path is set.

### Step 3.4: Create GeoIpModule

Dynamic module that registers the correct provider based on `GEOIP_PROVIDER` env var.

### Step 3.5: Write tests for HttpFakeGeoIp

Test with mock HTTP server, verify timeout behavior, verify null on error.

- [ ] Commit: `feat(E06): T3 — GeoIpModule with fake and MaxMind providers`

---

## Task 4: RateLimitModule

**Files:**
- Create: `apps/api/src/modules/rate-limit/rate-limit.module.ts`
- Create: `apps/api/src/modules/rate-limit/rate-limit.service.ts`
- Create: `apps/api/src/modules/rate-limit/rate-limit.service.spec.ts`

### Step 4.1: Implement Redis sliding-window Lua script

Single Lua script that atomically: ZREMRANGEBYSCORE (prune expired), ZADD (add current timestamp), ZCARD (count), PEXPIRE (set expiry). Returns { allowed, remaining, retryAfterSec }.

### Step 4.2: Implement RateLimitService

```ts
@Injectable()
export class RateLimitService {
  hit(key: string, limit: number, windowSec: number): Promise<{ allowed: boolean; remaining: number; retryAfterSec: number }>;
  block(key: string, ttlSec: number): Promise<void>;
  isBlocked(key: string): Promise<boolean>;
}
```

### Step 4.3: Write integration tests

Test sliding window semantics with real Redis (in compose). Test block/isBlocked. Test that window resets after expiry.

### Step 4.4: Create RateLimitModule

- [ ] Commit: `feat(E06): T4 — RateLimitModule with Redis sliding-window`

---

## Task 5: EnumerationDetector

**Files:**
- Create: `apps/api/src/modules/rate-limit/enumeration-detector.ts`
- Create: `apps/api/src/modules/rate-limit/enumeration-detector.spec.ts`
- Modify: `apps/api/src/modules/rate-limit/rate-limit.module.ts`

### Step 5.1: Implement EnumerationDetector

Uses RateLimitService internally. Counts invalid + tier-2 unknown per ipHash in ENUMERATION_WINDOW_SEC. At threshold → Redis block + IpBlock row + event.

```ts
@Injectable()
export class EnumerationDetector {
  observeInvalid(ipHash: string, tenantSlug?: string): Promise<{ blocked: boolean }>;
}
```

### Step 5.2: Write tests

Test threshold behavior, block creation, IpBlock row creation, event emission.

- [ ] Commit: `feat(E06): T5 — EnumerationDetector`

---

## Task 6: ScanEventsService

**Files:**
- Create: `apps/api/src/common/ip-utils.ts`
- Create: `apps/api/src/common/ip-utils.spec.ts`
- Create: `apps/api/src/common/ua-utils.ts`
- Create: `apps/api/src/common/ua-utils.spec.ts`
- Create: `apps/api/src/modules/scan-events/scan-events.module.ts`
- Create: `apps/api/src/modules/scan-events/scan-events.service.ts`
- Create: `apps/api/src/modules/scan-events/scan-events.service.spec.ts`

### Step 6.1: Implement IP utils

- `truncateIpV4(ip: string): string` — mask to /24
- `truncateIpV6(ip: string): string` — mask to /48
- `hashIp(ip: string, salt: string): string` — sha256(salt + truncatedIp)
- `extractIpPrefix(ip: string): string` — "10.3.0.0/24" format

### Step 6.2: Implement UA utils

- `classifyUa(ua: string | undefined): 'mobile' | 'desktop' | 'bot' | 'unknown'`

### Step 6.3: Implement ScanEventsService.record

The ONLY writer. Handles IP truncation + hashing, deviceClass, codeRedacted, denormalized batchId/productId, latency.

### Step 6.4: Implement reader methods

- `forUnit(unitId, tier, { limit }): Promise<ScanEvent[]>`
- `streamForTenant(tenantId, since): AsyncIterable<ScanEvent>`

### Step 6.5: Write tests

Integration test against real Postgres proving:
- record creates a ScanEvent with correct fields
- UPDATE/DELETE raise at Prisma extension level
- `$executeRaw` UPDATE/DELETE raise at trigger level

- [ ] Commit: `feat(E06): T6 — ScanEventsService with IP hashing and append-only enforcement`

---

## Task 7: VerdictEngine

**Files:**
- Create: `apps/api/src/modules/verify/verdict-engine.ts`
- Create: `apps/api/src/modules/verify/verdict-engine.spec.ts`

### Step 7.1: Implement VerdictEngine as a pure class

Decision table from the epic, ported from legacy/verify.js. Pure function `evaluate(ctx)`:
- ctx: { unit, priorScans, now, tenant, brandDisplayName }
- returns: Verdict object with verdict, severity, tier, message, history, signals, reportable

### Step 7.2: Write golden tests

Replay every row in the decision table: invalid, tier-1 not found, tier-1 found, tier-2 not found, decommissioned, first scan authentic, already-verified, suspicious (>5 + multi-region), flagged, rate-limited, offboarded tenant.

### Step 7.3: Write property test

`evaluate` never returns a full code (the `code` field always matches the redacted pattern).

### Step 7.4: Write message interpolation tests

Verify the three legacy sentences with brand name interpolated.

- [ ] Commit: `feat(E06): T7 — VerdictEngine with golden and property tests`

---

## Task 8: VerifyController

**Files:**
- Create: `apps/api/src/modules/verify/verify.module.ts`
- Create: `apps/api/src/modules/verify/verify.controller.ts`
- Create: `apps/api/src/modules/verify/verify.controller.spec.ts`
- Modify: `apps/api/src/app.module.ts`

### Step 8.1: Create VerifyModule

Imports: ScanEventsModule, RateLimitModule, GeoIpModule, ConfigModule. Provides: VerdictEngine, VerifyController.

### Step 8.2: Implement VerifyController

`GET /v1/verify/:code`:
1. normalise code
2. parse + checksum (no DB hit on failure → invalid)
3. tenant slug from code → tenant status check
4. rate limit checks (per-IP, per-tenant, per-code for tier 2)
5. tier dispatch (tier-1: lookup by tier1Code; tier-2: lookup by hashForStorage)
6. VerdictEngine.evaluate
7. ScanEventsService.record
8. Emit `scan.recorded` event
9. Return VerifyResponse

`?src=` query parameter (qr|manual|sms, default qr).

All routes marked `@Public()` — stub the decorator until E02 ships.

### Step 8.3: Wire VerifyModule into AppModule

One-line import.

### Step 8.4: Write controller integration tests

Test the full flow: valid tier-1, valid tier-2, invalid, unknown, rate-limited.

### Step 8.5: Add E06 env vars to docker/compose.yml api service

- [ ] Commit: `feat(E06): T8 — VerifyController with full verification flow`

---

## Task 9: OpenAPI

**Files:**
- Create: `apps/api/src/modules/verify/dto/verify-response.dto.ts`
- Create: `apps/api/src/modules/verify/dto/verify-response.examples.ts`
- Modify: `apps/api/src/modules/verify/verify.controller.ts`
- Add script to `apps/api/package.json`

### Step 9.1: Add @nestjs/swagger dependency

### Step 9.2: Create VerifyResponse DTO with OpenAPI decorators

Discriminated on `verdict`. Examples per verdict. Nested DTOs for brand, product, batch, history, signals.

### Step 9.3: Add `GET /v1/verify/_schema` endpoint

### Step 9.4: Add `openapi:check` and `openapi:generate` scripts

### Step 9.5: Commit generated JSON at `apps/api/openapi/verify.v1.json`

- [ ] Commit: `feat(E06): T9 — OpenAPI decorators and schema endpoint`

---

## Task 10: VerifySmsModule

**Files:**
- Create: `apps/api/src/modules/verify-sms/verify-sms.module.ts`
- Create: `apps/api/src/modules/verify-sms/verify-sms.controller.ts`
- Create: `apps/api/src/modules/verify-sms/sms.port.ts`
- Create: `apps/api/src/modules/verify-sms/http-fake-sms.ts`
- Create: `apps/api/src/modules/verify-sms/verify-sms.controller.spec.ts`
- Modify: `apps/api/src/app.module.ts`

### Step 10.1: Define SmsPort interface

```ts
export const SMS_PORT = Symbol('SMS_PORT');
export interface SmsPort {
  send(params: { to: string; body: string; tenantId?: string }): Promise<{ providerMessageId: string }>;
}
```

### Step 10.2: Implement HttpFakeSms

POST to `SMS_URL/send` with { to, body }.

### Step 10.3: Implement VerifySmsController

`POST /v1/verify/sms`:
- Parse text (VERIFY <code> or bare code)
- Rate limit on `from` (10/min)
- Run verification with src=sms
- Reply via SmsPort in ≤160 chars

### Step 10.4: Wire VerifySmsModule into AppModule

### Step 10.5: Write tests

- [ ] Commit: `feat(E06): T10 — SMS verification webhook`

---

## Task 11: Load Testing

**Files:**
- Create: `apps/api/load/verify.k6.js`
- Modify: `docs/verification.md`

### Step 11.1: Write k6 script

70% tier-1 valid, 20% tier-2 valid, 10% invalid; 500 rps for 2 min; thresholds p95 < 150ms, error rate < 0.1%.

### Step 11.2: Run against compose and capture results

### Step 11.3: Add Postgres EXPLAIN for hot lookups

- [ ] Commit: `feat(E06): T11 — k6 load test script`

---

## Task 12: Documentation

**Files:**
- Create: `docs/verification.md`

### Step 12.1: Write verification.md

Verdict table, messaging policy, rate-limit tiers, enumeration rule, IP policy, geo granularity, SMS format, what E07/E08/E09 build on. Isolation note.

- [ ] Commit: `feat(E06): T12 — verification documentation`

---

## Self-Review

### Spec coverage:
- T1 covers schema/migrations/env ✅
- T2 covers fake-geo ✅
- T3 covers GeoIpModule ✅
- T4 covers RateLimitModule ✅
- T5 covers EnumerationDetector ✅
- T6 covers ScanEventsService ✅
- T7 covers VerdictEngine ✅
- T8 covers VerifyController ✅
- T9 covers OpenAPI ✅
- T10 covers SMS ✅
- T11 covers load ✅
- T12 covers docs ✅
- AC1-AC9 all have corresponding tasks ✅

### Cross-epic requests to E06:
- Include scanEventId in verify response → T8 ✅
- Add batchId/productId to scan.recorded → T6/T8 ✅
- Accept forwarded IP/UA → T8 ✅
- Honour x-synthetic-probe → defer to E17 ✅
- Expose ScanEventRepository.forUnit/byIpHash → T6 ✅
- Document degraded behaviour → T12 ✅

### Type consistency:
- GeoIpPort.lookup return type consistent across T3 and T8 ✅
- Verdict type string literal union consistent across T7, T8, T9 ✅
- RateLimitService.hit signature consistent across T4, T5 ✅
- SmsPort.send signature consistent across T10 ✅
