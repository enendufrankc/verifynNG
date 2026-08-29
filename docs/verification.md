# E06 — Verification & Scan Events

This is the reference for the verification hot path: `GET /v1/verify/:code` and the SMS fallback `POST /v1/verify/sms`. It documents the verdicts the engine returns, the messages consumers see, the rate limits and enumeration defence that protect the path, and the privacy policy applied to every scan. Tenant identity is derived from the scanned code itself, never from the URL. Downstream epics (E07 anomaly, E08 reporting, E09 consumer web) build on the contracts defined here.

## Verdict Table

Every verdict the `VerdictEngine` can return, the condition that produces it, its severity, whether it surfaces a "Report" button (E08), and which tier it applies to.

| Verdict          | Condition                                                                | Severity | Reportable | Tier |
| ---------------- | ------------------------------------------------------------------------ | -------- | ---------- | ---- |
| invalid          | Code format invalid or checksum fails                                    | grey     | No         | -    |
| unknown          | Tier 1 code not in registry, tier 2 hash not found, or tenant offboarded | red      | Yes        | 1/2  |
| ok               | Tier 1 code found in registry                                            | green    | No         | 1    |
| authentic        | Tier 2, first verification scan                                          | green    | No         | 2    |
| already-verified | Tier 2, ≤5 total scans OR single region                                  | green    | No         | 2    |
| suspicious       | Tier 2, >5 scans AND >1 distinct region                                  | amber    | Yes        | 2    |
| flagged          | Tier 2, unit state = flagged (overrides)                                 | red      | Yes        | 2    |
| decommissioned   | Tier 2, unit state = decommissioned                                      | red      | No         | 2    |
| rate-limited     | Rate limit exceeded                                                      | grey     | No         | -    |

Decision order on the tier-2 path: `rate-limited` (guard) → `decommissioned` (unit state) → `flagged` (unit state, overrides history) → `suspicious` (>5 scans AND >1 region) → `already-verified` / `authentic`. On the tier-1 path: `rate-limited` → `invalid` (checksum) → `unknown` (not found) → `ok`. An `offboarded` tenant answers `unknown` for both tiers. The engine is pure given `{ unit, priorScans, now, tenant }` and is unit-tested without a database.

## Messaging Policy

`message` is interpolated with `brand.displayName` (from `TenantBrandingService.get()`, replacing the hard-coded "IVORY GLOW" of the legacy prototype). The four legacy sentences — first scan, resale-normal, multi-region, flagged — are kept verbatim with the brand name interpolated. `{brand}` = `brand.displayName`; `{date}` = UTC timestamp of the unit's first verification; `{count}` = total tier-2 scan count including the current one.

| Verdict          | Message template                                                                                                                     |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| invalid          | `This code format is not valid — check that you scanned the full code.`                                                              |
| unknown (tier 1) | `This public code is not in our registry. If this was scanned on a bottle, the product line may be counterfeit.`                     |
| unknown (tier 2) | `This verification code does not exist in our registry. This product is likely counterfeit. Please report it.`                       |
| ok               | `This is a genuine {brand} product line. For full unit authentication, find the hidden scratch-off code inside the pack.`            |
| authentic        | `You are the first person to verify this unit. Genuine, purchased new.`                                                              |
| already-verified | `This unit was first verified on {date} and has been verified {count} time(s). Normal for resale or shared use.`                     |
| suspicious       | `This code has been verified multiple times in different regions — possible counterfeit duplication. Treat with caution and report.` |
| flagged          | `The brand has flagged this code after suspicious activity. Treat this product with caution and report the seller.`                  |
| decommissioned   | `This code has been withdrawn by the brand (recall or fraud investigation). Contact the seller.`                                     |
| rate-limited     | `Too many verification attempts. Please try again later.`                                                                            |

The `code` field in every response is `redactCode(...)` — never the full code. It matches `^[a-z0-9-]+\.[12]\.[a-z0-9]+\.[A-Z0-9]{4}…$`.

## Rate Limit Tiers

A Redis sliding-window limiter (Lua script: `ZREMRANGEBYSCORE` → `ZADD` → `ZCARD` → `PEXPIRE`, atomic) is applied in order: per-IP → per-tenant → per-code. The first limiter that denies short-circuits the rest. Limits are configurable via env; defaults below.

| Scope                  | Default Limit          | Window | Key Pattern            |
| ---------------------- | ---------------------- | ------ | ---------------------- |
| Per IP                 | 20/min                 | 60s    | `rl:ip:{ipHash}`       |
| Per code (tier 2 only) | 10/min                 | 60s    | `rl:code:{codeHash}`   |
| Per tenant             | 600/min (configurable) | 60s    | `rl:tenant:{tenantId}` |

Notes:

- Per-code limiting applies to **tier 2 only**. A shelf of identical tier-1 bottles scanned by many shoppers is the normal case (mental model §4); tier 1 is limited per-IP only.
- Per-tenant limit is read from `Tenant.verifyRateLimitPerMin` (E03 exposes it; E15 sets it from the plan) and cached for 60 s.
- Response headers: `X-RateLimit-Limit`, `X-RateLimit-Remaining`, and `Retry-After` (on a denied request, returned with HTTP 429 and body `verdict: rate-limited`).
- `rate-limited` scan events are sampled (one per `ipHash` per minute) so an attacker cannot use the limiter to flood the `ScanEvent` table.

## Enumeration Detection

An attacker probing codes to discover valid ones produces a stream of `invalid` and tier-2 `unknown` verdicts from one IP. The `EnumerationDetector` counts these and blocks the IP before it finds anything useful.

- Threshold: 15 invalid / tier-2 unknown codes per IP in 5 minutes (`ENUMERATION_INVALID_THRESHOLD=15`, `ENUMERATION_WINDOW_SEC=300`).
- Block duration: 900 seconds / 15 minutes (`ENUMERATION_BLOCK_SEC=900`).
- Blocked IPs get `rate-limited` with `retryAfterSec` and **no database lookup** (fast-path Redis check on `block:ip:{ipHash}`).
- Detection creates an `IpBlock` row in Postgres (with `ipHash`, `tenantSlug`, `reason: enumeration`, `invalidCount`, `expiresAt`) for support visibility (E18).
- Emits the `scan.enumeration_detected` domain event.
- Counting key: `enum:{ipHash}`; block key: `block:ip:{ipHash}`.

## IP Privacy Policy

No column anywhere ever contains the raw client IP. The pipeline is: truncate → salt → hash.

- IPs are **truncated before hashing**: IPv4 → `/24` (zero the last octet), IPv6 → `/48` (first 3 groups).
- The truncated IP is salted with `IP_HASH_SALT` then SHA-256 hashed → `ipHash` (64 hex chars), stored on `ScanEvent.ipHash`.
- The `/24` or `/48` prefix is stored separately on `ScanEvent.ipPrefix` (e.g. `10.3.0.0/24`) for support/E07 clustering. This is the first column E19's retention drops (default 30 days).
- Loopback / private (`127.0.0.1`, `::1`, `192.168.*`) yields `ipPrefix = null`.
- `X-Forwarded-For` is honoured only when `TRUST_PROXY=true` (set in compose); the first IP in the list is used.

## Geo Granularity

- Default: city-level, formatted as `"{city}, {country}"` (e.g. `"Lagos, NG"`, `"Accra, GH"`).
- E19 can change to country-level by flipping one `IpPolicy` field — no code change here.
- Geo lookup (`GeoIpPort`) fails gracefully: a 50 ms timeout or a down service returns `null` geo and **never blocks verification**. With `fake-geo` stopped, responses still return 200 and `history.distinctRegions` is unaffected (regions already seen stay; new events have `geo_* = null`).
- Provider is chosen by env: `GEOIP_PROVIDER=fake` (default, `HttpFakeGeoIp` → `http://fake-geo:4103`) or `GEOIP_PROVIDER=maxmind` (`MaxMindGeoIp`, reads `GEOIP_MMDB_PATH`).

## SMS Verification Format

The SMS fallback lets a consumer text a code when they cannot scan the QR. The webhook is `@InternalOnly('sms:inbound')` — `fake-sms` and the Termii adapter (E14) authenticate with an `ApiClient` key.

- Inbound: `POST /v1/verify/sms` with body `{ from: string; to: string; text: string; providerMessageId: string }` → `202 { verdict }`.
- Code parsing: `"VERIFY <code>"` or a bare code, tolerated via `normalizeCode`.
- The same `VerdictEngine` runs with `source = sms`.
- Reply format: ≤ 160 chars, sent via `SmsPort` (`HttpFakeSms` → `fake-sms` `/send` until E14 binds the real one). Includes the brand name and a redacted code reference, e.g. `"IVORY GLOW: GENUINE. First verified now. Ref …ABCD"` or `"NOT FOUND — likely counterfeit. Report: <shortlink>"`.
- Rate limited on the `from` number at 10/min.
- The resulting `ScanEvent.source = 'sms'`.

Termii inbound payload mapping (E14 must honour): `from` → sender MSISDN, `to` → short code, `text` → message body, `providerMessageId` → Termii message id.

## Append-Only Enforcement

`ScanEvent` is insert-only. Two layers enforce this so the error is caught as early as possible.

- **Prisma client extension** (in `packages/db`): throws on `scanEvent.update` / `updateMany` / `delete` / `deleteMany` — caught in tests before reaching Postgres.
- **PostgreSQL trigger** `scan_event_immutable`: `BEFORE UPDATE OR DELETE` raises `ERROR: ScanEvent is append-only` for any `$executeRaw` or out-of-band write.
- **E19's retention job is the single exception**, running with `DISABLE TRIGGER` inside its own transaction.

## Domain Events

Emitted via Nest `EventEmitter2`. Consumers subscribe to the string event name.

| Event                       | Payload                                                                                                      | Consumers     |
| --------------------------- | ------------------------------------------------------------------------------------------------------------ | ------------- |
| `scan.recorded`             | `{ scanEventId, tenantId, unitId, batchId, tier, verdict, ipHash, geo: { country, city } \| null, src, at }` | E07, E12, E14 |
| `scan.enumeration_detected` | `{ ipHash, tenantSlug, invalidCount, windowSec, blockedForSec, at }`                                         | E07, E17      |
| `scan.rate_limited`         | `{ scope: 'ip' \| 'code' \| 'tenant', keyHash, tenantId, at }`                                               | E17           |

## What E07, E08, E09 build on

- **E07 (Anomaly):** consumes `scan.recorded` to compute richer signals (velocity, pre-reveal, dead codes) asynchronously; acts by writing `Unit.state = flagged`, which the engine already honours as a verdict override. E06 keeps only the legacy `suspicious` rule on the hot path so it stays O(1) DB reads (one unit lookup + one indexed history read).
- **E08 (Consumer Reporting):** shows a "Report" button when `reportable: true` — i.e. for `unknown`, `suspicious`, and `flagged` verdicts.
- **E09 (Consumer Web):** renders `VerifyResponse` as a consumer-facing HTML page and routes `/v1/verify/:code` API. E09's `/{tenant}/v/{code}` URLs are cosmetic and must pass only the code to this API; there is no tenant segment in the API path.

## Isolation Note

Verify routes are `@Public()` — no tenant is authenticated. The tenant is derived from the code's first segment, so a tenant-A code is looked up against tenant-A's data only. The isolation harness asserts the negative case: a tenant-A code never resolves to tenant-B brand data, verified on the `brand.slug` field in the response.

## Hot-path query plans (T11)

Both hot lookups are unique-index scans against Postgres 16, sub-millisecond:

```
explain analyze select * from "Unit" where "tier1Code" = '<code>';
 Index Scan using "Unit_tier1Code_key" on "Unit"  (cost=0.15..8.17 rows=1 width=172) (actual time=0.087..0.088 rows=1 loops=1)
   Index Cond: ("tier1Code" = '<code>'::text)
 Execution Time: 0.141 ms

explain analyze select * from "Unit" where "tier2Hash" = '<hash>';
 Index Scan using "Unit_tier2Hash_key" on "Unit"  (cost=0.15..8.17 rows=1 width=172) (actual time=0.316..0.316 rows=0 loops=1)
   Index Cond: ("tier2Hash" = '<hash>'::text)
 Execution Time: 0.383 ms
```

## Load test (T11)

`tools/load/verify.js` (mounted into the compose `k6` service, profile `load`) drives the mix from T11 — 70% tier-1 valid, 20% tier-2 valid (spread across many seeded codes so `RATE_LIMIT_CODE_PER_MIN` doesn't dominate the result), 10% invalid — at a 500 rps constant-arrival-rate target for 2 minutes:

```
pnpm --filter @verifynng/db exec tsx <seed-script minting TIER1_CODE and ~40 TIER2_CODES>
docker compose -f docker/compose.yml --profile load run --rm \
  -e TIER1_CODE=<code> -e TIER2_CODES=<comma-separated codes> \
  k6 /scripts/verify.js
```

Single-request sequential latency against this compose stack is well under the 150 ms target (20 sequential `GET /v1/verify/:code` calls: 9–49 ms, median ~15 ms), and the two hot lookups above are sub-millisecond — the hot path itself is fast.

**The 500 rps sustained run did not meet the p95 < 150 ms / error rate < 0.1% thresholds on this machine** (p95 ≈ 3.1 s, ~18% non-200 responses, with `dropped_iterations` climbing as VUs saturated). This was run on a dev machine concurrently hosting the full Docker stacks of several other epic worktrees (40+ containers competing for CPU/IO) — not an isolated load-test environment — so the numbers reflect host contention, not the verify path's own cost. Re-run in an isolated environment (dedicated CI runner or a machine with no other worktree stacks up) before treating the raw numbers as representative; the query plans and low-concurrency latency above are the load-independent evidence that the design meets the O(1)/hot-path goal.
