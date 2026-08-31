# E20 — SSO & MFA Policy

|                 |                                                                                                                                                                                       |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Wave            | 3                                                                                                                                                                                     |
| Status          | in-progress                                                                                                                                                                           |
| Owner           | Frank Enendu                                                                                                                                                                          |
| GitHub Issue    | [#21](https://github.com/enendufrankc/verifynNG/issues/21)                                                                                                                            |
| Depends on      | E02 (identity: `User`, `Membership`, sessions, TOTP MFA, login hooks), E13 (`@Audited`, secrets helper), E11 (settings route group), E15 (`hasFeature('sso')`), E03 (tenant settings) |
| Unblocks        | E18 (auth-lockout runbook references break-glass)                                                                                                                                     |
| Readiness items | `production-readiness.md` §1 P1 "MFA enforcement option (per-tenant policy)" · §1 P2 "SSO (Google/Microsoft)" · §2 audit log (consumed)                                               |

## Goal

An enterprise tenant can tell its staff "sign in with your work Google/Microsoft account", have new colleagues from `@brand.com` provisioned automatically as viewers, forbid password login entirely, and require MFA for every owner — all configured by the tenant owner in the console and every change audited. The owner keeps a break-glass path (password + TOTP) so a broken IdP never locks a tenant out of its own codes. Local development uses a fake OIDC provider in compose so none of this needs a Google or Microsoft account to test. SAML is explicitly deferred.

## Scope

**In:** OIDC Authorization Code + PKCE login with Google and Microsoft Entra ID via `openid-client`, `TenantSsoConfig` with encrypted client secret, account linking by verified email to an existing `Membership`, JIT provisioning with allowed domains and default role, enforce-SSO mode with owner break-glass, per-tenant MFA policy by role enforced through E02's login hooks, `fake-oidc` compose service with seeded users, settings screens (Security → SSO, Security → MFA policy), audit of every config change, `sso.login` / `sso.config.changed` / `mfa.policy.changed` events, runbook input for E18's auth-lockout doc.

**Out:** SAML 2.0 (future — noted below), SCIM provisioning/deprovisioning (future), platform-level SSO for `support` staff (they use E02 password + TOTP), password/TOTP mechanics and session storage (E02), WebAuthn/passkeys (future, would land in E02), social login for consumers on web-verify (never — consumers are anonymous), per-user MFA enrolment UI (E02 — E20 only forces it), Okta/Auth0 as generic OIDC (technically works via the same code path if `provider = generic` is added later; not tested in this epic).

## Owned paths

```
apps/api/src/modules/sso/**
apps/web-admin/app/(console)/settings/security/**      (sub-route under E03/E11's settings group, agreed)
apps/web-admin/app/(auth)/sso/**                        SSO entry + callback pages (agreed with E02 who owns app/(auth)/**)
packages/db/prisma/schema.prisma                        (additive block: "E20")
tools/fakes/oidc/**                                     compose config + seeded users for the fake provider
docs/sso-setup-guide.md                                 tenant-facing: Google / Entra app registration steps
```

## Interfaces

**Consumes:**

- E02: `User`, `Membership(userId, tenantId, role)`, `SessionService.issue(userId, { tenantId, role, amr: string[] })`, `UserService.findByEmail/create`, `MfaService.isEnrolled(userId)` and `MfaService.challenge(...)`, and E02's login pipeline hooks — **change request to E02**: expose `LoginPolicyHook` interface (`beforePasswordLogin(ctx)`, `afterPrimaryAuth(ctx) → { requireMfa: boolean, reason? }`) registered via a `LOGIN_POLICY_HOOKS` multi-provider token so E20 can (a) block password login for enforce-SSO tenants and (b) demand MFA per policy without E02 knowing about SSO. Also `Session.amr` (authentication methods reference: `pwd`, `otp`, `oidc:google`, `oidc:microsoft`) so guards can require a fresh MFA.
- E13: `@Audited` on all config routes; `SecretsHelper.encrypt/decrypt` for `clientSecretEnc`; audit viewer shows `sso.*` and `mfa.*` actions.
- E15: `EntitlementService.hasFeature(tenantId, 'sso')` → 402 `plan_limit` when configuring SSO on a plan without it (growth/enterprise only); MFA policy is available on every plan.
- E03: `Tenant.slug` for the login URL `/sso/:tenantSlug`; tenant settings page shell.
- E11: `nav.config.ts` entry under Settings → Security (owner only), `apiClient`, form primitives; `loginAs()` fixture extended with `loginViaSso(tenantSlug, fakeUser)`.
- E14: `NotificationService.send('sso.enabled' | 'mfa.policy.enforced', owner)` (template request to E14).

**Exposes:**

Nest providers (module `SsoModule`):

```ts
SsoConfigService; // get(tenantId), upsert(tenantId, dto), disable(tenantId), testConnection(tenantId) → discovery ok / error
OidcClientFactory; // buildClient(config) → openid-client Client using discovery (Google: accounts.google.com; Entra: login.microsoftonline.com/{tenant}/v2.0; fake: FAKE_OIDC_ISSUER)
SsoLoginService; // startLogin(tenantSlug, { redirectTo }) → authUrl (state+nonce+PKCE in Redis, 10 min); handleCallback(state, code) → { session } | SsoError
AccountLinker; // resolve(tenantId, claims) → existing Membership by verified email | JIT-provisioned | rejected(domain)
MfaPolicyService; // get(tenantId), set(tenantId, { requiredRoles: Role[], gracePeriodDays }), evaluate(userId, tenantId, role) → { required, inGraceUntil? }
EnforceSsoLoginHook; // implements E02 LoginPolicyHook.beforePasswordLogin: throws `sso_required` unless break-glass (owner + valid TOTP)
MfaPolicyLoginHook; // implements afterPrimaryAuth: requireMfa when policy says so (also after OIDC login if the IdP did not assert MFA — see Notes)
```

HTTP routes:

```
GET   /v1/auth/sso/:tenantSlug/start?redirectTo=        anonymous → 302 to IdP
GET   /v1/auth/sso/callback                               anonymous → sets refresh cookie, 302 to web-admin (/sso/complete)
GET   /v1/auth/sso/:tenantSlug                             anonymous → { enabled, provider, enforceSso, buttonLabel }   (login page uses this to render the button)
GET   /v1/tenants/:tenantId/sso                            owner → config without secret (secret shown as ••••last4)
PUT   /v1/tenants/:tenantId/sso                            owner @Audited { provider, clientId, clientSecret?, issuer? (fake/generic only), allowedDomains[], jitProvisioning, jitDefaultRole, enforceSso }
POST  /v1/tenants/:tenantId/sso/test                       owner → runs discovery + client credentials sanity, returns diagnostics
DELETE /v1/tenants/:tenantId/sso                           owner @Audited (disables; clears enforceSso first)
GET   /v1/tenants/:tenantId/security/mfa-policy            owner|operator|viewer (read)
PUT   /v1/tenants/:tenantId/security/mfa-policy            owner @Audited { requiredRoles: ['owner','operator'], gracePeriodDays: 7 }
POST  /v1/auth/break-glass/:tenantSlug                     anonymous → password + TOTP in one request; only for role owner in enforce-SSO tenants; rate-limited 5/hour/IP; @Audited `auth.break_glass`
```

Domain events:

```
sso.login             { tenantId, userId, provider, membershipCreated: boolean, amr: string[], ip }
sso.login_rejected    { tenantId, provider, emailDomain, reason: 'domain_not_allowed'|'jit_disabled'|'email_unverified'|'state_mismatch' }
sso.config.changed    { tenantId, actorId, changes: string[] (field names, never values), enforceSso }
mfa.policy.changed    { tenantId, actorId, requiredRoles, gracePeriodDays }
auth.break_glass      { tenantId, userId, ip }
```

Prisma models: `TenantSsoConfig`, `TenantMfaPolicy`, `SsoIdentity`.

## Data model

Additive block `// E20`.

```prisma
enum SsoProvider { google microsoft fake }        // `fake` only honoured when NODE_ENV !== 'production'

model TenantSsoConfig {
  id              String      @id @default(cuid())
  tenantId        String      @unique
  provider        SsoProvider
  clientId        String
  clientSecretEnc String                              // E13 SecretsHelper; never returned by the API
  issuer          String?                             // required for fake; Entra: tenant-specific issuer; Google: fixed
  allowedDomains  String[]                            // lowercase, e.g. ["ivoryglow.com","tunnellight.com"]; empty = link-only, no JIT
  jitProvisioning Boolean     @default(false)
  jitDefaultRole  String      @default("viewer")      // viewer | operator (never owner)
  enforceSso      Boolean     @default(false)
  enabled         Boolean     @default(true)
  lastTestedAt    DateTime?
  lastTestResult  String?
  createdAt       DateTime    @default(now())
  updatedAt       DateTime    @updatedAt
}

model SsoIdentity {
  id          String      @id @default(cuid())
  tenantId    String
  userId      String
  provider    SsoProvider
  subject     String                                  // IdP `sub` — the stable link, not email
  email       String
  lastLoginAt DateTime?
  createdAt   DateTime    @default(now())
  @@unique([tenantId, provider, subject])
  @@index([tenantId, userId])
}

model TenantMfaPolicy {
  id              String   @id @default(cuid())
  tenantId        String   @unique
  requiredRoles   String[]                            // subset of owner|operator|viewer
  gracePeriodDays Int      @default(7)                // existing un-enrolled users get this long after the policy is set
  enforcedFrom    DateTime                            // set when policy first becomes non-empty
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
}
```

Change request to E02: `Session.amr String[]` and the `LoginPolicyHook` multi-provider token (see Interfaces). `Membership.createdVia String? ('invite'|'jit')` is helpful for E18's directory but optional.

## Tasks

- [x] T1 `SsoModule` scaffold + schema block + migration `E20_sso_mfa_policy`; env section `SSO_*` (`SSO_CALLBACK_URL=http://localhost:4000/v1/auth/sso/callback`, `FAKE_OIDC_ISSUER=http://fake-oidc:4104/default`, `FAKE_OIDC_PUBLIC_ISSUER=http://localhost:4104/default`, `SSO_STATE_TTL_SECONDS=600`); `SsoConfigService` + config routes with `hasFeature('sso')` gate, secret encryption, `@Audited`, `sso.config.changed` (field names only).
      Notes on deviations from the routes listed under "Interfaces" above, made to match the codebase's actual conventions rather than the spec prose:
  - No controller in this codebase actually mounts under a `v1/` prefix except a couple of E13 routes (`main.ts` sets no global prefix); tenant-scoped routes here are `tenants/:tenantId/sso` and (T7) `tenants/:tenantId/security/mfa-policy`, matching `MembersController`'s `tenants/:tenantId/members`. Anonymous SSO routes (T3) will be under `auth/sso/**`, matching `AuthController`'s `auth/**`.
  - `TenantContextGuard` 404s (not 403s) a route-param `:tenantId` that doesn't match the caller's own tenant (support/platform roles excepted) — existing, consistent behaviour across every other tenant-scoped controller. AC9's cross-tenant check will observe 404, not 403.
  - `hasFeature('sso')` gate is a local stub (`SSO_ENTITLEMENT_PORT`, `AllowAllSsoEntitlement`) mirroring E04's `ENTITLEMENT_POLICY` pattern — E15 hasn't shipped `EntitlementService` yet. AC9's plan-gate half is blocked on E15 binding the real policy.
  - `SecretsHelper.encrypt/decrypt` doesn't exist in E13's `SecretsModule` (only `SecretsPort.get()` and `SecretsKeyRing`) — `clientSecretEnc` uses the same local AES-256-GCM construction E02's `MfaService` already uses for `User.mfaSecret`, keyed by a new `SSO_CLIENT_SECRET_ENC_KEY`.
- [x] T2 `OidcClientFactory` with `openid-client` discovery per provider, cached per tenant with invalidation on config change; Google and Entra issuer/URL rules; `fake` provider allowed only outside production (startup assertion). `POST …/sso/test` runs discovery and reports `issuer`, `authorization_endpoint`, and whether `email_verified` is available in scopes.
      Uses `openid-client` v6's functional API (`client.discovery`/`buildAuthorizationUrl`/`authorizationCodeGrant`, not the v5 `Issuer`/`Client` classes). Cache invalidation is event-driven (`@OnEvent('sso.config.changed')`), no direct dependency from `SsoConfigService` back to `OidcClientFactory`. Verified live: `mock-oauth2-server` derives every discovery URL from the request's `Host` header rather than a fixed config value, so server-side discovery via `FAKE_OIDC_ISSUER` is self-consistent (no `skipIssuerCheck` workaround needed, unlike this file's earlier note) — the only URL needing an internal→public host rewrite is the `authorization_endpoint` handed to the browser, which is T3's job (`SsoLoginService`).
- [x] T3 Login flow: `start` (state + nonce + PKCE verifier in Redis under `sso:state:<state>`; `redirectTo` allow-listed to web-admin origin), `callback` (exchange, ID-token validation via `openid-client`, `email_verified === true` required, `hd`/`tid` cross-check with `allowedDomains` where present), `SsoLoginService` → `AccountLinker` → session issued (with `amr: ['oidc:<provider>']`); error redirects to `/sso/error?code=` with human messages. `sso.login` / `sso.login_rejected` events, both also written to the audit log (not just emitted).
      Session issuance doesn't go through an E02 `SessionService.issue()` — no such method exists; `AuthModule`'s `TokenService` (generateRefreshToken/createSession/issueAccessToken) is imported into `SsoModule` and reused, then `amr` is set directly on the `Session` row afterward since `createSession()`'s signature is E02's file and out of scope to change for this. Cookie hand-off: the API's `GET auth/sso/callback` cannot set the `vg_refresh` httpOnly cookie itself (matches this repo's actual BFF split — see `apps/web-admin/app/api/auth/session/route.ts`, which is the only place that ever sets it), so it mints a single-use, 60s-TTL Redis-backed code and redirects to `web-admin`'s `/sso/complete?code=`; a new `POST auth/sso/complete` (also `@Public()`) exchanges it for the same `{accessToken, refreshToken, user, memberships, ...}` shape `/auth/login` returns, which a `web-admin` route (T9) will wrap in the cookie exactly like password login. Verified end-to-end against the real `fake-oidc` container: link (existing operator), JIT (new viewer, `createdVia: 'jit'`), `domain_not_allowed`, and `jit_disabled` all produce the correct redirect and audit row.
- [x] T4 `AccountLinker`: (1) `SsoIdentity` by `(tenantId, provider, sub)` → existing user; (2) else `User` by email with an active `Membership` in the tenant → link, create `SsoIdentity`; (3) else if `jitProvisioning` and domain ∈ `allowedDomains` → create `User` (no password) + `Membership(role = jitDefaultRole, createdVia='jit')` + identity; (4) else reject `domain_not_allowed` / `jit_disabled`. Email changes at the IdP do not break the link (sub is the key). 6 integration tests: each branch, email-changed-at-IdP-still-links, and a user in two tenants linking independently in each.
- [x] T5 Enforce-SSO: `EnforceSsoLoginHook` (E02 hook) blocks `POST auth/login` for any `Membership` in an enforce-SSO tenant with 403 `sso_required { ssoStartUrl }`; users with memberships in several tenants are blocked only for the tenant being selected (login is tenant-scoped — this required adding tenant scoping to `AuthService.login`, since it didn't exist: see the note below). Setting `enforceSso=true` requires: SSO tested OK in the last 24h, the acting owner has logged in via SSO at least once, and every owner has TOTP enrolled (break-glass depends on it) — otherwise 409 with the unmet preconditions listed.
- [x] T6 Break-glass: `POST auth/break-glass/:tenantSlug` accepts `{ email, password, totp }`, only for `role = owner`, rate-limited 5/hour/IP (E13's `RateLimitService`, imported into `SsoModule`), issues a 1-hour session (`Session.expiresAt` set to +1h; the access token keeps its normal 15m TTL, refreshed as usual until the session's 1h mark) with `amr: ['pwd','otp','break_glass']`, `auth.break_glass` recorded to the audit log directly (not `@Audited` — see below); web-admin `/sso/break-glass` page is T9/T10. Email to owners: skipped, no `auth.break_glass_alert` template exists yet (added to the E14 cross-epic request).
- [x] T7 MFA policy: `TenantMfaPolicy`, `MfaPolicyService`, routes, `MfaPolicyLoginHook` (E02 `afterPrimaryAuth`): if the user's role in the selected tenant ∈ `requiredRoles` → `requireMfa: true`; if not enrolled and within grace → allow with `mfaGraceUntil` on the login response (console banner is T10); after grace → login returns 403 `mfa_enrolment_required`. Applies after OIDC login too unless the ID token asserts MFA (`amr` contains `mfa`/`hwk` or Entra `acr`) — implemented as a second gate inside `SsoLoginService.handleCallback`, reusing the same one-time-code hand-off as a normal SSO login but carrying `{mfaRequired, mfaToken}` instead of a session when the user is enrolled but the IdP didn't assert MFA. `mfa.policy.changed` event + audit row on every policy change; email to affected members skipped (same E14 template gap as T6).

  **Cross-cutting note on E02 changes required for T5–T7** (all in `apps/api/src/modules/auth/**`, flagged on issue #3 before landing):
  - `AuthService.login` had no tenant scoping at all — it picked `memberships[0]` (whichever the DB returned first) regardless of which tenant the caller meant. `LoginDto.tenant?: string` (a slug) and `AuthService.login(email, password, tenantSlug?, userAgent?, ip?)` now resolve a specific `Membership` when provided; omitting it keeps the exact pre-E20 behaviour (first membership), so nothing breaks for a caller that doesn't send it — this also fixes `refresh()` picking a membership inconsistent with the session's actual tenant. AC4's own curl example (`-d '{"email":"...","tenant":"ivoryglow"}'`) already assumes this field exists.
  - Added `LoginPolicyRegistry` (`apps/api/src/modules/auth/login-policy-hook.ts`) — NestJS's per-module injector can't merge providers bound to the same token across modules into an array (Angular's `multi: true` has no Nest equivalent), so this is a registration singleton in the same style as `QuotaService.registerKind()`, not a DI-resolved array as the epic's "`LOGIN_POLICY_HOOKS` multi-provider token" phrasing suggested. `SsoModule.onModuleInit()` registers `EnforceSsoLoginHook` and `MfaPolicyLoginHook` into it.
  - `TokenService.issueMfaToken`/`verifyMfaToken` carry an optional `tid` claim so tenant selection survives the two-step MFA challenge (`/auth/login` → `/auth/mfa/challenge`).
  - No `@Audited` on `POST auth/break-glass/:tenantSlug` — that decorator's interceptor logs the full request body (redacting only named keys), which would put the owner's raw password and TOTP code in the audit trail; `AuditService.record()` is called directly instead with an empty payload, matching how `SsoConfigService`/`SsoLoginService` already avoid `@Audited` for the same reason (see T1's note).
  - `mfaChallenge`'s "not enrolled" guard was left checking `user.mfaEnabled` (unchanged) rather than `user.mfaSecret` — a hook's `requireMfa` never triggers the challenge path directly (only native `mfaEnabled` does; a hook communicates a not-yet-enrolled user via `reason: 'grace' | 'enrolment_required'` instead), so the existing guard is still correct and no relaxation was needed.
  - AC7's `clock:advance` CLI (E15's `FakeClock`) doesn't exist yet — grace-expiry is tested/demonstrated by backdating `TenantMfaPolicy.enforcedFrom` directly instead.

- [x] T8 `tools/fakes/oidc`: compose service `fake-oidc` using `ghcr.io/navikt/mock-oauth2-server` on 4104 with `JSON_CONFIG` defining issuer `default`, static users `owner@ivoryglow.com`, `ops@ivoryglow.com`, `newhire@ivoryglow.com` (not yet a member), `outsider@gmail.com`, claims `email`, `email_verified`, `hd`, optional `amr:["mfa"]` for `owner@`; a login page where the tester picks a user; README with the mapping to Google/Entra claim differences.
      Also seeded `newhire2@ivoryglow.com` for AC3's JIT-off check. `SERVER_PORT=4104` set explicitly (default is 8080). No compose healthcheck — the image has no shell/wget/curl to probe with (confirmed via `docker exec`); `api` depends on `service_started` only. `FAKE_OIDC_PORT` added to `scripts/epic`'s per-worktree port offset (was missing — `FAKE_CAPTCHA_PORT` isn't in there either despite the port-registry note in CROSS-EPIC-REQUESTS.md, a pre-existing gap this doesn't fix).
      Correction after live testing: mock-oauth2-server's `tokenCallbacks`/`requestMappings` (its own `config.json` example, and what an initial version of this file used) only matches parameters sent to the **token** endpoint (`scope`, `code`, ...) — it has no visibility into the interactive login page's chosen username, so it cannot key claims off which seeded user was picked. The real, empirically-verified mechanism (decoded the actual ID tokens to confirm) is a custom `loginPagePath` HTML page whose per-user `<form>` posts `username` + a `claims` JSON string, which `LoginRequestHandler` merges into the token verbatim — see `tools/fakes/oidc/login.html` and the README's expanded explanation.
- [ ] T9 Web-admin auth pages `app/(auth)/sso/**`: tenant login page gets a **Continue with Google/Microsoft** button when `/v1/auth/sso/:slug` says enabled (password form hidden when `enforceSso`, replaced by the break-glass link); `/sso/complete` finishes the cookie hand-off; `/sso/error` explains `domain_not_allowed` etc. with the tenant's `supportEmail`.
- [ ] T10 Settings screens `app/(console)/settings/security/**` (owner only): **SSO** — provider select, client id/secret, issuer (fake/generic), allowed domains chips, JIT toggle + default role, **Test connection** with diagnostics panel, **Enforce SSO** switch with the precondition checklist and a typed-slug confirmation, disable; **MFA policy** — role checkboxes, grace period, list of members not yet enrolled with days remaining, save with confirmation of who will be affected. Nav entry `settings/security` in `nav.config.ts`.
- [ ] T11 `docs/sso-setup-guide.md`: Google Cloud OAuth client steps (consent screen, authorised redirect URI, `hd` claim), Entra app registration (single-tenant vs multi-tenant, issuer with tenant id, `email` optional claim, `xms_edov`/`email_verified` note), what to put in the console, troubleshooting table mapping our error codes to fixes; input section for E18's `auth-lockout.md` (break-glass procedure).
- [ ] T12 Playwright: full SSO flow against `fake-oidc` for link / JIT / rejected; enforce-SSO blocks password; break-glass; MFA policy grace and enforcement; `loginViaSso()` fixture contributed to E11/E21 fixtures.

## Acceptance criteria

- [ ] AC1 `docker compose up` → `http://localhost:4104/default/.well-known/openid-configuration` returns discovery; `ivoryglow` (growth plan in E21 seed) owner at `http://localhost:3001/settings/security/sso` saves provider **fake**, issuer `http://localhost:4104/default`, client `verifyng-local`/`secret`, domains `ivoryglow.com`, JIT on → **Test connection** shows green with issuer and endpoints; `http://localhost:3001/audit` shows `sso.config.changed` with `changes: ["provider","clientId","clientSecret","allowedDomains","jitProvisioning"]` and no secret value anywhere.
- [ ] AC2 Link existing: log out; on `http://localhost:3001/login/ivoryglow` click **Continue with SSO** → fake-oidc picker → choose `ops@ivoryglow.com` (seeded operator) → land in the console as operator; `SsoIdentity` row created; audit `sso.login` with `membershipCreated: false`.
- [ ] AC3 JIT: pick `newhire@ivoryglow.com` → lands as **viewer**, `Membership.createdVia = jit`, appears in Team (E02) list; pick `outsider@gmail.com` → `/sso/error?code=domain_not_allowed` with the tenant's support email; `sso.login_rejected` in audit. Turn JIT off → `newhire2@ivoryglow.com` (add via fake-oidc config) is rejected `jit_disabled`.
- [ ] AC4 Enforce SSO preconditions: toggling **Enforce SSO** before any SSO login → 409 listing "acting owner has not logged in via SSO", "owner ops2@… has no TOTP"; satisfy both (owner logs in via SSO once; enrol TOTP through E02) → toggle succeeds; `curl -X POST localhost:4000/v1/auth/login -d '{"email":"ops@ivoryglow.com","password":"…","tenant":"ivoryglow"}'` → 403 `sso_required` with `ssoStartUrl`; the login page hides the password form.
- [ ] AC5 Break-glass: `http://localhost:3001/sso/break-glass?tenant=ivoryglow` with owner email + password + current TOTP → session issued, console shows the amber "Emergency access — expires in 60:00" banner, `auth.break_glass` audit row, Mailpit has the owners' alert; 6th attempt in an hour from one IP → 429; an operator's credentials → 403.
- [ ] AC6 IdP outage: `docker compose stop fake-oidc` → SSO button click shows `/sso/error?code=idp_unreachable` within 10s (discovery timeout), break-glass still works; `docker compose start fake-oidc` → SSO works again with no restart of `api`.
- [ ] AC7 MFA policy: set `requiredRoles = ['owner','operator']`, grace 7 days → operator `ops@` (not enrolled, password login in tenant `acme` which has no SSO) logs in and sees "Enable MFA by <date>"; `docker compose exec api node cli.js clock:advance --days 8` (E15's `FakeClock`, shared) → next login returns `mfa_enrolment_required` and the console shows only the enrolment screen; after enrolling, login requires TOTP; a `viewer` is never prompted.
- [ ] AC8 IdP-asserted MFA is honoured: `owner@ivoryglow.com` (fake-oidc emits `amr:["mfa"]`) logs in via SSO under the same policy → no second TOTP prompt; `ops@` via SSO (no `amr`) → TOTP prompt (or grace banner). `Session.amr` visible in E02's sessions page.
- [ ] AC9 Isolation and plan gate: `acme` (starter plan) owner `PUT /v1/tenants/acme/sso` → 402 `plan_limit`; `ivoryglow` owner `GET /v1/tenants/acme/sso` → 403; E21's isolation matrix covers all `/v1/tenants/:tenantId/sso*` and `/security/*` routes.

## Testing

- Unit: `AccountLinker` decision table (identity match, email link, JIT allowed, domain denied, unverified email, `hd` mismatch), enforce-SSO precondition checker, MFA policy evaluator (role, grace window boundaries, IdP `amr`/`acr` mapping), `redirectTo` allow-list, state/nonce/PKCE storage and single-use.
- Integration (Postgres + Redis + `fake-oidc` container in the test compose): full callback exchange against the fake issuer, ID-token signature and nonce validation failures → rejected, secret encrypted at rest (`SELECT "clientSecretEnc"` is not the plaintext), config cache invalidation, `LoginPolicyHook` interplay with E02's real login service, break-glass rate limit, audit rows for every mutation with no secret values.
- E2E (Playwright): AC2–AC5, AC7–AC8 with `loginViaSso()`; visual snapshot of the login page in normal vs enforce-SSO mode.
- Security checks: no `client_secret` in logs (grep of `api` logs during the E2E run in CI), `state` reuse → 400, callback without cookie → 400, open-redirect attempt on `redirectTo` → 400.

## Compose services added

| Service   | Image                                    | Host port | Notes                                                                                                                                                                                                                                                                                                                                         |
| --------- | ---------------------------------------- | --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| fake-oidc | ghcr.io/navikt/mock-oauth2-server:2.1.10 | 4104      | `JSON_CONFIG_PATH=/config/config.json` from `tools/fakes/oidc/config.json`; issuer `http://localhost:4104/default`; `api` reaches it as `http://fake-oidc:4104/default` — issuer mismatch handled by `FAKE_OIDC_PUBLIC_ISSUER` (browser) vs `FAKE_OIDC_ISSUER` (server) with `openid-client` `skipIssuerCheck` **only** for `provider = fake` |

`api` env additions: `SSO_CALLBACK_URL`, `SSO_STATE_TTL_SECONDS=600`, `FAKE_OIDC_ISSUER`, `FAKE_OIDC_PUBLIC_ISSUER`, `SSO_DISCOVERY_TIMEOUT_MS=5000`.

## Notes and decisions

- **SAML is out.** Every target enterprise IdP (Google Workspace, Entra, Okta, JumpCloud) speaks OIDC; SAML doubles the attack surface (XML signature wrapping) for no customer we have. If a tenant insists, the plan is a `saml` provider behind the same `AccountLinker` using `@node-saml/node-saml` — a new epic, not a task here.
- **Subject, not email, is the link.** Email is used once to link or provision; afterwards `(provider, sub)` identifies the user so an IdP-side email rename does not create a duplicate account or let someone hijack by registering a matching email elsewhere.
- **`email_verified` is mandatory.** Google sets it; Entra requires the optional claim or the `xms_edov` fallback — the setup guide covers it; without it login is rejected `email_unverified`.
- **Enforce-SSO is guarded by preconditions**, not just a switch, because the failure mode (tenant locks itself out) is exactly what a trust product cannot afford. Break-glass is owner + password + TOTP with a short session and loud audit/email.
- **MFA policy composes with SSO** by trusting the IdP's `amr`/`acr` claim; when the IdP does not assert MFA we add TOTP ourselves rather than trusting the tenant to have configured it upstream.
- **Multi-tenant users.** A person can be a viewer at `acme` (password) and an operator at `ivoryglow` (enforce-SSO). Hooks evaluate per selected tenant; sessions are per tenant already in E02.
- **`fake` provider is compile-time fenced** by an assertion at module init when `NODE_ENV=production`, so a misconfigured env cannot expose a test IdP in prod.
