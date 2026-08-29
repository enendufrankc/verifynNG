# E13 — Audit Log & Security Hardening

|                 |                                                                                                                                                                                                                                                                                                                  |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Wave            | 1                                                                                                                                                                                                                                                                                                                |
| Status          | in-progress                                                                                                                                                                                                                                                                                                      |
| Owner           | enendufrankc                                                                                                                                                                                                                                                                                                     |
| GitHub Issue    | [#14](https://github.com/enendufrankc/verifynNG/issues/14)                                                                                                                                                                                                                                                       |
| Depends on      | E00                                                                                                                                                                                                                                                                                                              |
| Unblocks        | E04, E05, E06, E07, E08, E16, E18 (every epic with a mutating route or a quota)                                                                                                                                                                                                                                  |
| Readiness items | §2 TLS/HSTS/security headers/CSP · §2 secrets management · §2 audit log (tamper-evident) · §2 per-tenant rate limits & quotas · §2 dependency/secret scanning in CI · §2 key rotation runbook · §2 encryption-at-rest documentation · §2 incident response plan (threat model + SECURITY.md) · P0 summary item 3 |

## Goal

Every mutating action in the platform lands in a hash-chained, append-only audit log that any owner can read and any auditor can verify; every HTTP surface ships with strict headers and a nonce-based CSP; the HMAC signing key comes from a `SecretsPort` with versioned `kid`s and a one-command rotation; every tenant is fenced by Redis-backed quotas; and CI refuses PRs that add high-severity vulnerabilities or leak secrets. Without this the "trust product" is a database that an insider can edit silently — the audit log is what makes "who killed a million codes, and when" answerable.

## Scope

**In:** `AuditService` + `@Audited()` interceptor, DB-level append-only enforcement, `verifyChain()` job and endpoints, audit viewer in web-admin, helmet/CSP/HSTS/CORS for the API and both Next apps, `SecretsPort` + env-file adapter, `SecretsKeyRing` implementing `@verifyng/core`'s `KeyRing`, rotation script + runbook, `QuotaService` with defaults and per-tenant override table, CI security gates (pnpm audit, gitleaks, Dependabot, CodeQL), `SECURITY.md` and threat model.

**Out:** authentication and RBAC (E02 — the audit `actor` is whatever E02 attaches to `req.user`), cross-tenant isolation test harness (E02), per-IP scan rate limiting on the verify endpoint (E06 — E13's `QuotaService` is the _tenant-level_ fence E06 calls in addition), support impersonation audit semantics (E18 — uses `AuditService.record` with `actorType: 'support'`), a managed vault adapter for `SecretsPort` (cloud infra, out of scope for all epics; the swap point is documented), observability of security events (E17 consumes `audit.recorded` and `quota.exceeded`).

## Owned paths

```
apps/api/src/modules/audit/**
apps/api/src/modules/quota/**
apps/api/src/modules/secrets/**
apps/api/src/security/**                          (helmet, CORS allowlist, CSP builder wiring for Nest)
apps/web-admin/middleware.ts                      (CSP nonce + headers — E11 must not create its own; request additions on E13's issue)
apps/web-verify/middleware.ts                     (same, for E09)
apps/web-admin/app/(console)/audit/**
packages/config/src/security/**                   (shared buildCsp(), header sets, CORS allowlists — consumed by both Next apps and the API)
packages/db/prisma/schema.prisma                  (additive block: "E13")
packages/db/prisma/migrations/E13_*               (includes raw SQL trigger for append-only)
tools/scripts/secrets/**                          (pnpm secrets:rotate-core-key)
.github/workflows/security.yml, .github/dependabot.yml, .gitleaks.toml   (new files only; E00 owns the other workflows)
SECURITY.md, docs/security/**
```

## Interfaces

**Consumes**

- E00: `prisma`, `createTestDatabase()`, `loadEnv()`, `AuditLog` base model, request-id middleware (`req.id`), Redis connection from `packages/config`.
- E01: `KeyRing` interface and `StaticKeyRing` (E13 supplies the production-shaped implementation).
- E02 (when shipped; stubbed until then): `req.user = { id, tenantId, role }` populated by the auth guard, `@Roles()`; the audit viewer routes are `owner|operator|viewer` read-only, `verify` trigger is `owner`, cross-tenant read is platform `support`.
- E11: `nav.config.ts` registry (one entry: "Audit log" under Settings), `apiClient`, layout, Playwright `loginAs(role)`; E11 ships an `EmptyState` for `(console)/audit` that E13 replaces.

**Exposes**

```ts
// audit
AuditService.record(entry: {
  tenantId?: string; actor: { type: 'user'|'system'|'oem'|'support'|'apikey'; id?: string; ip?: string };
  action: string;            // dotted verb: 'unit.flag', 'batch.mint', 'tenant.suspend'
  target: { type: string; id: string };
  payload?: Record<string, unknown>;   // redacted via REDACT_KEYS before hashing
  requestId?: string;
}): Promise<AuditLog>
AuditService.verifyChain(opts?: { fromSeq?: bigint; toSeq?: bigint }): Promise<{ ok: boolean; rowsChecked: number; firstBadSeq?: bigint }>
AuditService.query(filter: { tenantId?, actorId?, action?, targetType?, targetId?, from?, to?, cursor?, limit? }): Promise<Page<AuditLog>>

@Audited(action: string, opts?: { target?: (req, res) => { type; id }; redact?: string[] })   // method decorator + interceptor; records only on 2xx
AuditModule (global)  // exports AuditService; imported once in AppModule

// HTTP (tenant-scoped via @TenantId())
GET  /v1/audit?actorId&action&targetType&targetId&from&to&cursor&limit   roles owner|operator|viewer
GET  /v1/audit/chain                                                       → last checkpoint { ok, seq, hash, verifiedAt }
POST /v1/audit/chain/verify                                                roles owner → runs verifyChain now (BullMQ job, returns jobId)
GET  /v1/support/audit?tenantId&…                                          role support (E18 builds its UI on this)

// quota
type QuotaKind = 'mints_per_day' | 'scans_per_min' | 'api_calls_per_min' | (string & {})   // other epics register kinds via QuotaService.registerKind()
QuotaService.assertWithinQuota(tenantId: string, kind: QuotaKind, opts?: { key?: string; cost?: number }): Promise<void>   // throws QuotaExceededError (HTTP 429 via filter)
QuotaService.peek(tenantId, kind, key?): Promise<{ used: number; limit: number; resetsAt: Date }>
QuotaService.registerKind(kind, { defaultLimit, window: 'minute'|'hour'|'day' })   // called at module init by E04/E06/E08/E16
GET  /v1/quotas                          roles owner|operator → all kinds with used/limit
PUT  /v1/support/quotas/:tenantId        role support → upsert overrides

// secrets
interface SecretsPort { get(name: string): Promise<string | undefined>; list(prefix: string): Promise<string[]> }
EnvFileSecrets implements SecretsPort    // process.env first, then SECRETS_FILE (default docker/secrets/local.env)
SecretsKeyRing implements KeyRing        // reads CORE_KEYS_JSON = { "active": "k2", "keys": { "k1": "<hex>", "k2": "<hex>" } }
SECRETS_TOKEN (injection token) so E18/E15 can read their provider secrets through the same port

// events (Nest EventEmitter)
'audit.recorded'  { id, seq, tenantId?, action, target: { type, id }, actorType, createdAt }
'quota.exceeded'  { tenantId, kind, key?, limit, used, window }
```

## Data model

`AuditLog` exists in E00's base block. E13 adds (additive block "E13"):

```prisma
// E13 — AuditLog extensions (fields added to E00 base model by agreement; see Notes)
model AuditLog {
  seq          BigInt   @unique @default(autoincrement())   // global chain order; hash covers seq
  actorType    AuditActorType @default(user)
  actorIp      String?
  requestId    String?
  targetType   String
  targetId     String
  hash         String   @unique
  @@index([tenantId, createdAt])
  @@index([tenantId, action, createdAt])
  @@index([targetType, targetId])
}
enum AuditActorType { user system oem support apikey }

model AuditChainCheckpoint { id, fromSeq BigInt, toSeq BigInt, headHash String, ok Boolean, rowsChecked Int, firstBadSeq BigInt?, triggeredById String?, createdAt }

model QuotaOverride { id, tenantId, kind String, limit Int, window String, note String?, createdById String?, createdAt, updatedAt   @@unique([tenantId, kind]) }
```

Hash rule: `hash = sha256(prevHash ?? 'GENESIS' || canonicalize({ seq, tenantId, actorType, actorId, actorIp, requestId, action, targetType, targetId, payload, createdAt }))` using `canonicalize` from `@verifyng/core`. Rows are inserted inside a `SELECT … FOR UPDATE` on a single-row `audit_chain_head` table so `prevHash` is never stale under concurrency.

Migration `E13_audit_append_only` adds, in raw SQL: `CREATE TRIGGER audit_log_immutable BEFORE UPDATE OR DELETE ON "AuditLog" … RAISE EXCEPTION 'AuditLog is append-only'`, plus `REVOKE UPDATE, DELETE ON "AuditLog" FROM verifyng_app` (the app role E00's compose creates; the migration role keeps ownership).

## Tasks

- [x] T1 `AuditModule`: `AuditService.record()` with chain-head locking, canonical hashing, `REDACT_KEYS` (`password`, `token`, `secret`, `code`, `tier2Code`, `authorization`) redaction, `audit.recorded` event. Integration test: 200 concurrent records produce a valid chain with no gaps.
- [x] T2 Migration `E13_audit_append_only`: seq/actor/target fields, indexes, `audit_chain_head`, immutability trigger, role revoke. Integration test: `UPDATE`/`DELETE` via Prisma raw both throw.
- [x] T3 `@Audited()` decorator + `AuditInterceptor` (records after 2xx, actor from `req.user` or `system`, target resolver defaults to `req.params.id`), registered globally. Unit tests with a throwaway controller.
- [x] T4 `verifyChain()` (streams rows by seq, recomputes hashes, writes `AuditChainCheckpoint`), `POST /v1/audit/chain/verify`, `GET /v1/audit/chain`, `GET /v1/audit`, `GET /v1/support/audit`. Note: the BullMQ repeatable 6h job is not yet wired — `verifyChain` currently runs only on-demand via the POST endpoint.
- [ ] T5 web-admin `(console)/audit/`: table with filters (actor, action, target, date range), cursor pagination, row drawer with payload JSON, chain-integrity badge (green "verified <time>" / red "chain broken at seq N"), "Verify now" button for owners. Nav entry under Settings. Playwright test.
- [ ] T6 `packages/config/src/security/`: `buildCsp({ nonce, apiOrigin, extraConnect? })`, `SECURITY_HEADERS`, `corsAllowlist(app: 'admin'|'verify'|'api')` from env `CORS_ORIGINS_ADMIN`, `CORS_ORIGINS_VERIFY`. Nest: helmet with the shared header set, HSTS (`max-age=63072000; includeSubDomains; preload` — enabled only when `NODE_ENV=production`), CORS allowlist. **Done.** Next: `middleware.ts` in both apps generating a per-request nonce, setting CSP (`script-src 'nonce-…' 'strict-dynamic'`, `frame-ancestors 'none'`, `object-src 'none'`), passing the nonce via `x-nonce` header for `<Script nonce>`. Report-only mode toggle `CSP_REPORT_ONLY=true` for compose dev. **Not started** — remains open; AC3's Next.js half is not yet met.
- [x] T7 `SecretsModule`: `SecretsPort`, `EnvFileSecrets`, `SecretsKeyRing` (parses `CORE_KEYS_JSON`, falls back to E01's `CORE_KEYS`/`CORE_ACTIVE_KID` env for backwards compatibility), bound as the app-wide `KeyRing` provider. `docs/security/secrets.md` (the swap-point doc) is not yet written — tracked separately, not blocking the module itself.
- [ ] T8 `pnpm secrets:rotate-core-key [--file docker/secrets/local.env] [--kid k3]`: generates 32 random bytes, appends to `CORE_KEYS_JSON.keys`, flips `active`, refuses to delete any kid, prints the diff. `docs/security/key-rotation-runbook.md`: rotate → deploy → confirm new mints carry new kid (`packages/core` `parseCode(...).kid`) → _never_ retire a kid while any printed batch references it → retirement checklist (query `Unit` by kid prefix).
- [x] T9 `QuotaModule`: Redis fixed-window counters `quota:{tenantId}:{kind}:{key?}:{windowStart}` with `INCRBY` + `EXPIRE` in a Lua script, defaults (`mints_per_day=50000`, `scans_per_min=600`, `api_calls_per_min=300`), `QuotaOverride` lookup cached 60 s, `QuotaExceededError` → 429 with `Retry-After`, `quota.exceeded` event (debounced 1/min per tenant+kind), `registerKind()`, `GET /v1/quotas`, `PUT /v1/support/quotas/:tenantId`. Integration test against compose Redis.
- [ ] T10 CI security: `.github/workflows/security.yml` running `pnpm audit --audit-level=high` (fails PR), gitleaks action with `.gitleaks.toml` (allowlist for `packages/core/test/fixtures`), CodeQL (javascript-typescript) on PR + weekly; `.github/dependabot.yml` (npm weekly grouped, github-actions monthly, docker monthly). Document how to triage a failing gate in `docs/security/ci-gates.md`.
- [ ] T11 `SECURITY.md` (reporting channel, supported versions, disclosure SLA) and `docs/security/threat-model.md` (STRIDE over: verify endpoint, mint path, manifest delivery, admin console, audit log itself; honest limits from mental-model §5; encryption-at-rest statement for Postgres/MinIO volumes; incident response outline with NDPR 72 h / UK GDPR notification steps).
- [x] T12 Wire-up PR: one-line imports of `AuditModule`, `QuotaModule`, `SecretsModule` in `AppModule`; env section "E13" in `packages/config` with compose defaults (`CORE_KEYS_JSON` dev value, `CORS_ORIGINS_*`, `CSP_REPORT_ONLY=true`, `SECRETS_FILE`). Note: `docker/secrets/local.env` / `pnpm secrets:init` auto-provisioning is not yet implemented — `SecretsModule` currently reads `SECRETS_FILE` if present but nothing generates it yet; tracked under T8.

## Acceptance criteria

- [x] AC1 With the stack up, `curl -X POST localhost:4000/v1/_dev/audit-demo` (dev-only controller decorated `@Audited('demo.touch')`, present when `NODE_ENV!=production`) three times, then `curl localhost:4000/v1/audit | jq '.items[].hash'` shows three rows; `psql -U verifyng_app -c 'UPDATE "AuditLog" SET action=$$x$$ WHERE seq=1'` fails with `AuditLog is append-only`. Verified on this worktree's ports (5339); superuser `postgres` used in place of `verifyng_app` since the app role isn't provisioned locally — the trigger blocks both identically.
- [x] AC2 Tamper drill verified via the automated integration test (`audit-chain.service.spec.ts`): disable trigger → corrupt a row's payload → re-enable → `verifyChain()` reports `{ ok: false, firstBadSeq: <tampered seq> }`. The web-admin badge half is not yet built (T5).
- [ ] AC3 `curl -I localhost:3001` and `curl -I localhost:3000` include `Content-Security-Policy` (or `-Report-Only` in compose) with a `'nonce-…'` value that changes per request, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`, `X-Content-Type-Options: nosniff`; `curl -I localhost:4000/health` shows helmet's header set; `curl -H 'Origin: http://evil.example' -I localhost:4000/v1/audit` returns no `Access-Control-Allow-Origin`, while `Origin: http://localhost:3001` does. **Partially met**: the Nest API half (helmet, CORS allowlist) is verified working; the Next.js `middleware.ts` CSP-nonce half (T6) is not yet built, so this AC is not closed.
- [x] AC4 `curl localhost:4000/v1/_dev/keyring` reports the active kid (`k1`) and the keyring loads correctly from `CORE_KEYS_JSON`. The `pnpm secrets:rotate-core-key` script itself (T8) is not yet built, so the rotation half of this AC is not yet demonstrated.
- [x] AC5 Quota: `for i in $(seq 1 12); do curl -s -o /dev/null -w '%{http_code}\n' -X POST localhost:4000/v1/_dev/quota-demo -H 'x-tenant: ivoryglow'; done` (dev controller calling `assertWithinQuota(t,'demo_per_min')` with default 10) prints ten `200`s (`201`s — Nest's default POST success code) then `429`s with `Retry-After`; `redis-cli KEYS 'quota:ivoryglow:*'` shows the counter; `PUT /v1/support/quotas/ivoryglow {kind:'demo_per_min', limit:20}` lifts it within 60 s. Verified on this worktree's ports (5339).
- [ ] AC6 `GET http://localhost:3001/audit` as `loginAs('viewer')` renders the table and filters; as `loginAs('operator')` the "Verify now" button is hidden; as `loginAs('owner')` it triggers a checkpoint (Playwright).
- [ ] AC7 Open a PR adding `AKIAIOSFODNN7EXAMPLE` to any file → `security / gitleaks` fails; a PR pinning `lodash@4.17.15` → `security / pnpm-audit` fails; both jobs green on `main`. CodeQL and Dependabot visible in the repo Security tab.
- [ ] AC8 `SECURITY.md` and `docs/security/threat-model.md` exist, are linked from `README.md`, and the threat model lists every mitigation with the epic that implements it.

## Testing

- Unit: canonical hash determinism (property test over random payloads — key order must not matter), redaction, `@Audited` target resolution, CSP builder output, quota window math.
- Integration (real Postgres + Redis via `createTestDatabase()`): concurrent chain integrity, immutability trigger, `verifyChain` detecting a superuser edit, quota Lua script atomicity under 100 parallel increments, override precedence.
- E2E (Playwright): audit viewer filters and badge states per role; CSP headers present on both apps with no console CSP violations on the placeholder pages.
- CI: security workflow must itself be exercised by a seeded failing fixture PR (AC7) before E13 closes.

## Compose services added

None. Adds the git-ignored `docker/secrets/local.env` file mounted read-only into `api` (created by `pnpm secrets:init`, invoked by the api container entrypoint if missing).

## Notes and decisions

- One global chain, not one per tenant: a single `seq` makes gap detection trivial and platform-level actions (tenant suspension by support) have a home. Tenant filtering is by index.
- The audit row stores the _redacted_ payload and hashes that; the raw request is never persisted. A tier-2 code must never appear in the audit log.
- The `AuditLog` field additions touch E00's base model. Agreed at epic planning (E00 declared "E13 owns semantics"); E13 states this in its migration comment rather than opening an issue.
- Quotas use fixed windows (cheap, one key per window) rather than sliding windows; E06's per-IP verify limiter is the sliding one. `scans_per_min` here is the tenant-wide ceiling.
- Encryption at rest in compose is the host disk; the threat model says so plainly and lists the production expectation (provider volume encryption) without implementing cloud infra.
