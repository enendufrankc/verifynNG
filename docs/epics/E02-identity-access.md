# E02 — Identity & Access

|                 |                                                                                                                                                                                                                                 |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Wave            | 1                                                                                                                                                                                                                               |
| Status          | review                                                                                                                                                                                                                          |
| Owner           | enendufrankc                                                                                                                                                                                                                    |
| GitHub Issue    | [#3](https://github.com/enendufrankc/verifynNG/issues/3)                                                                                                                                                                        |
| Depends on      | E01 (token hashing helpers), E00                                                                                                                                                                                                |
| Unblocks        | E03, E11, E13, E16, E18, E19, E20 — and every tenant-scoped route in every epic                                                                                                                                                 |
| Readiness items | `production-readiness.md` §1 all P0/P1 rows (tenant-aware authN, real IdP, RBAC, password reset + session revocation, service-to-service auth, MFA option) · §2 "cross-tenant isolation tests in CI" · `architecture.md` step 7 |

## Goal

The console stops being a shared password. When this epic is done a person registers with email + password, optionally turns on TOTP MFA, belongs to one or more tenants with a role (`owner` / `operator` / `viewer`), and every request the API serves has a **server-derived** tenant context that no client can spoof. Refresh tokens rotate and can be revoked per device; passwords reset via email; jobs and fake services authenticate with internal credentials; and a reusable isolation harness proves — for every epic, in CI — that tenant A can never read or write tenant B's rows. Without this the platform is a demo with `password: admin`, which is exactly what the legacy `server.js` is.

## Scope

**In:** registration, login, argon2id password hashing, JWT access (15 min) + opaque refresh tokens (30 d, rotated on every use, family-revoked on reuse), TOTP MFA with recovery codes, RBAC per tenant, platform-level `support` role, password reset via email, session/device list + revoke, `@TenantId()` decorator backed by `TenantContextGuard`, `@Roles()` guard, `@Public()` escape hatch, service-to-service auth (`ApiClient` keys for jobs/fakes/OEM endpoints), the cross-tenant isolation test harness in `packages/db`, member management routes, domain events.

**Out:** tenant creation/verification/status (E03 — but E02 creates the `Membership` row when E03 calls `MembershipService.addOwner`), the login/MFA/reset _screens_ (E11 — E02 ships the routes and a Postman/HTTP-file collection only), SSO and per-tenant MFA-enforcement policy (E20), email templates and the real `Mailer` (E14 — E02 uses a minimal SMTP adapter against Mailpit behind E14's port), audit logging of auth events (E13 subscribes to E02 events), support impersonation (E18 — E02 only defines the `support` platform role and `@PlatformRole('support')` guard), public tenant API keys with scopes (E16 — builds on `ApiClient`).

## Owned paths

```
apps/api/src/modules/auth/**                (AuthModule: controllers, services, guards, decorators, strategies)
apps/api/src/modules/members/**             (MembersModule: /tenants/:tenantId/members/*)
apps/api/src/common/tenant/**               (TenantContextGuard, @TenantId(), @Roles(), @Public(), @PlatformRole(), @InternalOnly() — replaces E00's placeholder decorator)
packages/db/prisma/schema.prisma            (additive block: "E02")
packages/db/src/testing/tenant-isolation.ts (createTwoTenants(), assertTenantIsolation())
packages/config/src/env.ts                  (section "E02": JWT_*, ARGON2_*, MFA_*, INTERNAL_API_KEYS, SMTP_* until E14)
docs/auth.md
apps/api/http/auth.http                     (REST Client / httpyac request collection used in acceptance criteria)
```

## Interfaces

**Consumes**

- E00: `prisma`, `createTestDatabase()`, `loadEnv()`, `AppModule` (one import line each for `AuthModule`, `MembersModule`), base `User` and `Tenant` models.
- E01: `hashForStorage()` (refresh-token and API-key hashing — tokens are stored hashed, never raw), `StaticKeyRing` pattern for JWT signing key rotation (`JWT_KEYS="k1:hex,k2:hex"`, `JWT_ACTIVE_KID`).
- E14 (interface only): `Mailer` port — `interface Mailer { send(msg: { to: string; template: 'password-reset' | 'mfa-enabled' | 'new-device-login'; vars: Record<string, string> }): Promise<void> }`. E02 provides `SmtpMailer` (nodemailer → Mailpit on `mailpit:1025`) under the same Nest token `MAILER` until E14 ships its implementation and replaces the provider in `AppModule`.

**Exposes**

Nest providers (exported from `AuthModule`):

```ts
TenantContextGuard          // global APP_GUARD: resolves principal + tenant, 401/403/404 semantics below
RolesGuard                  // global APP_GUARD: enforces @Roles()
@TenantId()                 // param decorator → string; throws 500 if used on a route without tenant context (never silently undefined)
@Principal()                // param decorator → { userId, email, tenantId, role, platformRole?, sessionId } | { apiClientId, tenantId?, scopes }
@Roles('owner' | 'operator' | 'viewer', ...)   // route/class decorator; owner ⊃ operator ⊃ viewer
@Public()                   // skips auth entirely (E06 verify routes, health)
@PlatformRole('support')    // requires User.platformRole; tenant context comes from route param, not membership (E18)
@InternalOnly(scope?)       // requires ApiClient bearer key with optional scope (jobs, fakes, E05 OEM endpoints)
TokenService                // issueAccessToken(), issueRefreshToken(), rotateRefresh(), revokeSession(), revokeAllForUser(), verifyAccess()
PasswordService             // hash(), verify(), needsRehash() — argon2id, m=64MiB, t=3, p=4
MfaService                  // generateSecret(), buildOtpauthUri(), verifyTotp(), generateRecoveryCodes(), consumeRecoveryCode()
MembershipService           // addOwner(userId, tenantId) [E03 calls at tenant creation], setRole(), remove(), listForUser(), listForTenant()
ApiClientService            // create(name, tenantId?, scopes[]) → { id, rawKey } once; verify(rawKey); revoke(id)
```

Tenant resolution contract (the rule every epic inherits):

1. Access JWT claims: `sub` (userId), `tid` (active tenantId), `role`, `prole` (platform role), `sid` (sessionId), `kid` header.
2. `tid` is set server-side at login (single membership → that tenant; multiple → the last-used, switchable via `POST /auth/switch-tenant`), **after** the membership row is confirmed to exist.
3. `TenantContextGuard` sets `req.tenantId = claims.tid`. If the route has a `:tenantId` param and it differs from `claims.tid`, respond **404** (not 403 — never confirm another tenant exists). `@PlatformRole('support')` routes are the only exception: there `:tenantId` is authoritative and the access is emitted as `support.tenant.accessed` for E13/E18.
4. Anything reading `tenantId` from a body, query string, or header is a bug; the isolation harness catches it.

HTTP routes (all JSON, all under `apps/api`):

```
POST   /auth/register                     { email, password, displayName }            → 201 { user }            (creates User only; E03 creates the tenant)
POST   /auth/login                        { email, password }                         → 200 { accessToken, refreshToken, expiresIn } | 200 { mfaRequired: true, mfaToken }
POST   /auth/mfa/challenge                { mfaToken, code | recoveryCode }           → 200 { accessToken, refreshToken }
POST   /auth/refresh                      { refreshToken }                            → 200 { accessToken, refreshToken }   (rotates; reuse of an old token revokes the whole session family → 401)
POST   /auth/logout                       { refreshToken? }                           → 204                       (revokes current session)
POST   /auth/switch-tenant                { tenantId }                                → 200 { accessToken, refreshToken }   (404 if no membership)
GET    /auth/me                                                                       → { user, memberships[], activeTenantId, mfaEnabled }
POST   /auth/mfa/setup                                                                → { secret, otpauthUri, qrDataUrl }
POST   /auth/mfa/enable                   { code }                                    → { recoveryCodes[10] }     (shown once)
POST   /auth/mfa/disable                  { password, code }                          → 204
POST   /auth/mfa/recovery-codes/rotate    { code }                                    → { recoveryCodes[10] }
GET    /auth/sessions                                                                 → [{ id, userAgent, ipPrefix, createdAt, lastSeenAt, current }]
DELETE /auth/sessions/:sessionId                                                      → 204
DELETE /auth/sessions                                                                 → 204                       (all except current)
POST   /auth/password/forgot              { email }                                   → 202 always (no user enumeration)
POST   /auth/password/reset               { token, newPassword }                      → 204 (revokes all sessions)
POST   /auth/password/change              { currentPassword, newPassword }            → 204 (revokes other sessions)

GET    /tenants/:tenantId/members                                                     @Roles('viewer')
POST   /tenants/:tenantId/members/invite  { email, role }                             @Roles('owner')  → creates User (if new) + Membership + sends set-password mail
PATCH  /tenants/:tenantId/members/:userId { role }                                    @Roles('owner')  (cannot demote the last owner → 409)
DELETE /tenants/:tenantId/members/:userId                                             @Roles('owner')  (cannot remove the last owner → 409)

POST   /internal/api-clients              { name, tenantId?, scopes[] }               @PlatformRole('support') → { id, rawKey }
DELETE /internal/api-clients/:id                                                      @PlatformRole('support')
```

Domain events (Nest `EventEmitter2`, names are stable):

```ts
'user.registered'       { userId, email, at }
'user.login'            { userId, tenantId | null, sessionId, ipHash, userAgent, mfaUsed: boolean, at }
'user.login.failed'     { emailHash, ipHash, reason: 'password' | 'mfa' | 'locked', at }
'user.mfa.enabled'      { userId, at }
'user.mfa.disabled'     { userId, at }
'user.password.reset'   { userId, at }
'session.revoked'       { userId, sessionId, by: 'user' | 'system' | 'reuse-detected', at }
'member.invited'        { tenantId, userId, role, invitedBy, at }
'member.role.changed'   { tenantId, userId, from, to, changedBy, at }
'member.removed'        { tenantId, userId, removedBy, at }
'support.tenant.accessed' { supportUserId, tenantId, route, at }
```

Test harness (`packages/db/src/testing/tenant-isolation.ts`):

```ts
createTwoTenants(prisma): Promise<{ a: TenantFixture; b: TenantFixture }>
// TenantFixture = { tenant, owner: { user, accessToken }, operator: {...}, viewer: {...} }
assertTenantIsolation(app: INestApplication, routes: IsolationRoute[]): Promise<void>
// IsolationRoute = { method, path: (ctx: TenantFixture) => string, body?, expectWhenCrossTenant: 404 | 403 }
// For each route: call as tenant A's owner against tenant B's resources → must get the expected status and must not
// change any row in tenant B (row-count + updatedAt snapshot before/after). Every epic adds its routes to
// apps/api/test/isolation/<epic>.isolation.spec.ts; E21 wires the directory into the CI `test` job.
```

## Data model

```prisma
// ─── E02 ───────────────────────────────────────────────────────────────
enum TenantRole   { owner operator viewer }
enum PlatformRole { support }

model User {                       // extends E00 model — fields added:
  passwordHash     String?          // argon2id PHC string; null for invited-not-yet-set
  mfaEnabled       Boolean  @default(false)
  mfaSecret        String?          // base32, AES-GCM encrypted with MFA_ENC_KEY
  recoveryCodes    String[]         // argon2 hashes of unused codes
  platformRole     PlatformRole?
  lastLoginAt      DateTime?
  failedLoginCount Int      @default(0)
  lockedUntil      DateTime?
  memberships      Membership[]
  sessions         Session[]
}
// E00's User.tenantId? is deprecated by E02 in favour of Membership; E02's migration backfills a Membership(owner)
// for any existing User.tenantId and leaves the column nullable for E03 to drop.

model Membership {
  id        String     @id @default(cuid())
  userId    String
  tenantId  String
  role      TenantRole
  createdAt DateTime   @default(now())
  updatedAt DateTime   @updatedAt
  user      User       @relation(fields: [userId], references: [id], onDelete: Cascade)
  tenant    Tenant     @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  @@unique([userId, tenantId])
  @@index([tenantId, role])
}

model Session {                    // one row per device login; refresh tokens belong to a session
  id               String    @id @default(cuid())
  userId           String
  tenantId         String?          // active tenant at issue time
  refreshTokenHash String    @unique  // hashForStorage(rawToken); rotated on every /auth/refresh
  familyId         String           // stable across rotations; reuse of a superseded hash revokes the family
  userAgent        String?
  ipPrefix         String?          // /24 or /48 truncated per E19
  createdAt        DateTime  @default(now())
  lastSeenAt       DateTime  @default(now())
  expiresAt        DateTime
  revokedAt        DateTime?
  revokedReason    String?
  @@index([userId, revokedAt])
  @@index([familyId])
}

model PasswordResetToken {
  id        String    @id @default(cuid())
  userId    String
  tokenHash String    @unique
  expiresAt DateTime                     // 30 min
  usedAt    DateTime?
  createdAt DateTime  @default(now())
  @@index([userId])
}

model ApiClient {                  // service-to-service + OEM/fake credentials; E16 adds scopes vocabulary on top
  id         String    @id @default(cuid())
  tenantId   String?                     // null = platform-level (jobs, fakes)
  name       String
  keyHash    String    @unique          // hashForStorage(rawKey); rawKey shown once
  keyPrefix  String                      // first 8 chars for display
  scopes     String[]
  createdAt  DateTime  @default(now())
  lastUsedAt DateTime?
  revokedAt  DateTime?
  @@index([tenantId])
}
```

## Tasks

- [x] T1 Schema + migration `E02_identity`: models above, backfill Membership from `User.tenantId`; env section (`JWT_KEYS`, `JWT_ACTIVE_KID`, `JWT_ACCESS_TTL=15m`, `REFRESH_TTL=30d`, `MFA_ENC_KEY`, `WORKER_KEY`/`FAKE_SMS_KEY`/`FAKE_PAY_KEY`/`FAKE_GEO_KEY` in place of a combined `INTERNAL_API_KEYS` string — see Notes, `SMTP_HOST=mailpit`, `SMTP_PORT=1025`, `APP_BASE_URL=http://localhost:3001`) with compose defaults.
- [x] T2 `PasswordService` (argon2id, `needsRehash` on parameter change) + `POST /auth/register` + `user.registered` event; `@MinLength(12)` enforced in DTO (satisfies the length branch of the length≥12-or-score≥3 rule; no zxcvbn dependency added).
- [x] T3 `TokenService`: JWT access with `kid` header from `JWT_KEYS` ring, opaque 256-bit refresh tokens stored hashed in `Session`, rotation with family-reuse detection, `POST /auth/login`, `/auth/refresh`, `/auth/logout`, brute-force lockout (10 failures → 15 min), `user.login` / `user.login.failed` / `session.revoked` events.
- [x] T4 `TenantContextGuard` + `RolesGuard` as global `APP_GUARD`s; `@TenantId()`, `@Principal()`, `@Roles()`, `@Public()`; remove E00's placeholder decorator; `GET /auth/me`; `POST /auth/switch-tenant`; 404-not-403 rule for mismatched `:tenantId`.
- [x] T5 `MembersModule`: list/invite/change-role/remove with last-owner protection; `MembershipService.addOwner()` for E03; invite flow issues a `PasswordResetToken` and sends `set-password` mail; `member.*` events.
- [x] T6 `MfaService` with `otplib`: setup/enable/disable/recovery-code rotate, `mfaToken` short-lived (5 min) intermediate JWT for the challenge step, secret encrypted at rest, recovery codes hashed; `user.mfa.enabled/disabled` events.
- [x] T7 Password reset/change: `SmtpMailer` behind `MAILER` token (nodemailer → Mailpit), `/auth/password/forgot|reset|change`, constant-time 202 on forgot, all sessions revoked on reset.
- [x] T8 Sessions API: list with `current` flag, revoke one / all-others; `lastSeenAt` touched at most once per minute on refresh.
- [x] T9 `ApiClientService` + `@InternalOnly(scope)`: bearer `vk_<prefix>_<secret>` keys, hashed at rest, `WORKER_KEY`/`FAKE_SMS_KEY`/`FAKE_PAY_KEY`/`FAKE_GEO_KEY` env seed platform clients for `worker`/`fake-sms`/`fake-pay`/`fake-geo` at boot (idempotent); `/internal/api-clients` routes for `support`.
- [x] T10 `@PlatformRole('support')` guard: route param `:tenantId` authoritative, emits `support.tenant.accessed`. Extended beyond the original write-up: a `platformRole=support` principal gets the same `:tenantId`-authoritative + audit-event treatment on **any** route (not just `@PlatformRole`-decorated ones), and `RolesGuard` lets `support` satisfy any `@Roles(...)` check — otherwise AC9's `GET /tenants/<any>/members` (a plain `@Roles('viewer')` route) would 404 for support the same as for anyone else. `pnpm db:seed` gains `support@verifyng.local` with `platformRole=support`.
- [x] T11 Isolation harness in `packages/db/src/testing/tenant-isolation.ts` + `apps/api/test/isolation/E02.isolation.spec.ts` covering members routes; document usage in `docs/auth.md` so wave-1 epics adopt it in the same wave.
- [x] T12 `apps/api/http/auth.http` request collection + `docs/auth.md` (token lifetimes, rotation, 404 rule, how to add a protected route, how to run a job with an `ApiClient`); seed adds `owner@ivoryglow.local` / `operator@…` / `viewer@…` (password `Passw0rd!Passw0rd!`) as members of `ivoryglow`.

## Acceptance criteria

- [x] AC1 Register → login → protected call: `curl -X POST localhost:4000/auth/register -d '{"email":"a@x.io","password":"Passw0rd!Passw0rd!","displayName":"A"}'` → 201; `curl -X POST localhost:4000/auth/login …` → `accessToken`; `curl -H "Authorization: Bearer $AT" localhost:4000/auth/me` → the user with `memberships: []`. Decoded JWT (`jq -R 'split(".")|.[1]|@base64d'`) shows `exp - iat == 900`.
- [x] AC2 Refresh rotation and reuse detection: call `/auth/refresh` with `$RT` → new pair; call it again with the **old** `$RT` → 401 `{"error":"refresh_reuse_detected"}`; `GET /auth/sessions` with the new access token → 401 (family revoked); `docker compose exec postgres psql -U verifyng -c "select revoked_reason from \"Session\""` shows `reuse-detected`.
- [x] AC3 MFA: `POST /auth/mfa/setup` → `otpauthUri`; generate a code with `npx otplib-cli totp <secret>` (or `oathtool --totp -b`); `POST /auth/mfa/enable` → 10 recovery codes; `POST /auth/login` now returns `mfaRequired: true`; `POST /auth/mfa/challenge` with a TOTP → tokens; challenge with a recovery code → tokens, and that code fails a second time.
- [x] AC4 Password reset: `POST /auth/password/forgot {"email":"owner@ivoryglow.local"}` → 202; open `http://localhost:8025`, the mail's link contains a token; `POST /auth/password/reset` → 204; old access token's session is gone (`/auth/me` → 401); forgot for `nobody@x.io` also returns 202 with no mail.
- [x] AC5 Tenant context is server-derived: as `owner@ivoryglow.local`, `GET /tenants/<ivoryglow-id>/members` → 200 list; `GET /tenants/<other-tenant-id>/members` → 404; `GET /tenants/<ivoryglow-id>/members -H 'X-Tenant-Id: <other>'` → still ivoryglow's data (header ignored). As `viewer@ivoryglow.local`, `POST …/members/invite` → 403.
- [x] AC6 RBAC edge: demoting or removing the only owner → 409 `{"error":"last_owner"}`; inviting `new@x.io` as `operator` sends a set-password mail visible in Mailpit and creates a `Membership` row.
- [x] AC7 Service auth: `curl -H "Authorization: Bearer $(grep WORKER_KEY docker/compose.yml | awk '{print $2}')" localhost:4000/internal/whoami` → `{ "apiClientId": …, "scopes": [...] }`; a made-up key → 401; a revoked key → 401. (Deviation from the original write-up: AGENTS.md forbids committing any `.env*` file, "key material" included, even obviously-fake dev values — so the deterministic dev keys live inline in `docker/compose.yml`'s `api` service, not a separate `docker/.env.compose`.)
- [x] AC8 Isolation harness: `pnpm --filter @verifyng/api test test/isolation` runs `createTwoTenants()` and asserts every E02 route cross-tenant → 404/403 with zero row changes; the spec fails (proving it works) when a route is temporarily changed to read `tenantId` from the query string.
- [x] AC9 `support@verifyng.local` can `GET /tenants/<any>/members` → 200 and an event `support.tenant.accessed` is logged (visible in api logs at `docker compose logs api | grep support.tenant.accessed`); `owner@ivoryglow.local` calling `/internal/api-clients` → 403.

## Testing

- Unit: `PasswordService` (hash/verify/needsRehash), `TokenService` (issue/verify/rotate, `kid` rotation: token signed with `k1` verifies after `k2` becomes active), `MfaService` (TOTP window ±1 step, recovery-code single use), guard decision tables (`@Roles` hierarchy, `@Public`, `@PlatformRole`, 404-vs-403).
- Integration (real Postgres via `createTestDatabase()`): full register→login→refresh→reuse→revoked flow; invite→set-password; last-owner protection; lockout after 10 failures with `lockedUntil`; Mailpit receives exactly one mail per forgot for a known user (assert via Mailpit API `GET http://mailpit:8025/api/v1/messages`).
- Isolation: `test/isolation/E02.isolation.spec.ts` via the harness.
- E2E: none in this epic (screens are E11's; E11's Playwright `loginAs(role)` fixture exercises these routes).

## Compose services added

None. Uses `mailpit` (SMTP 1025, UI 8025) from E00. Adds deterministic dev-only `JWT_KEYS`, `MFA_ENC_KEY`, `WORKER_KEY`, `FAKE_SMS_KEY`, `FAKE_PAY_KEY`, `FAKE_GEO_KEY` inline in `docker/compose.yml`'s `api` service (not a separate `.env.compose` file — AGENTS.md's "never commit `.env*`, key material" guardrail applies even to obviously-fake dev-only values) so fakes can authenticate to the API without setup; production values come from E13's secrets abstraction.

## Notes and decisions

- Own auth rather than Firebase Auth (readiness §1 suggested it): the stack decision in `README.md` is self-hosted Nest + Postgres, and every dependency must run in compose. Firebase Auth cannot.
- Refresh tokens are opaque (not JWTs) and stored hashed with E01's `hashForStorage` so a DB dump yields nothing usable — same principle as tier-2 codes.
- Tenant mismatch returns 404, not 403, so an attacker cannot use the console API to confirm tenant IDs. Support-role routes are the documented exception.
- `Membership` replaces `User.tenantId`; a user may belong to several tenants (agencies managing several brands were an explicit ask in the mental model's "Shopify of authenticity" framing).
- The `Mailer` port is E14's; E02 ships the smallest possible SMTP implementation so wave 1 is not blocked. When E14 lands, E14 swaps the provider binding — E02 code does not change.
- Support-role bypass of the 404 rule (and of `@Roles(...)` checks) is decided at the `platformRole` claim, not per-route: any authenticated principal with `platformRole=support` gets `:tenantId` treated as authoritative on _any_ route, not only ones explicitly decorated `@PlatformRole('support')`. The original write-up scoped this to `@PlatformRole` routes only, which is right for genuinely support-only endpoints (`/internal/api-clients`) but can't satisfy AC9, which demonstrates support access against `MembersController`'s ordinary `@Roles('viewer')` route. `@PlatformRole('support')` still exists and still means "only support may call this at all" for the dedicated internal endpoints.
- `HealthController`'s `GET /health` is marked `@Public()`. It wasn't before this epic — E02's global `TenantContextGuard`/`RolesGuard` make every unmarked route require auth by default, which silently broke `docker/compose.yml`'s own healthcheck (and therefore every dependent service) until this one-line fix.
- `INTERNAL_API_KEYS` (single `"name:key,name:key"` string) was replaced with four separate env vars (`WORKER_KEY`, `FAKE_SMS_KEY`, `FAKE_PAY_KEY`, `FAKE_GEO_KEY`). Reasons: (1) AGENTS.md forbids committing any `.env*` file including key material, so the originally-specified `docker/.env.compose` file can't exist — the values have to live inline in `docker/compose.yml`, and four named vars read far better there than one long delimited string; (2) it matches AC7's exact demonstration shape (grep one named key out of a committed file). The original WIP's seeded dev keys (`keysms1234`, etc.) also didn't have the `vk_` prefix `InternalOnlyGuard` requires, so they were never actually reachable — fixed as part of this change.
- `TokenService.rotateRefreshToken`: reuse detection is done by retiring the presented session row (`revokedReason: 'rotated'`) and inserting a new row in the same `familyId`, rather than overwriting the hash in place. A hash that resolves to an already-`'rotated'` row is unambiguously a replay of a superseded token, which is what makes the family-wide revocation in AC2 correct — comparing timestamps on a single mutated row (an earlier draft of this) can't distinguish "stale" from "replayed" reliably.
- `TokenService.isSessionRevoked` treats a `sid` that doesn't resolve to any `Session` row as revoked (not as "not revoked"). A token can never outlive its session row this way, including one that was hard-deleted rather than soft-revoked.
