# Auth (E02) — how it works, and how to build on it

This is the reference for `AuthModule` and `MembersModule`. Read this before adding a new
tenant-scoped route in any epic, or before wiring up a job/fake service that needs to call the API.

## Token model

- **Access token**: a JWT, `JWT_ACCESS_TTL` lifetime (default `15m`). Claims: `sub` (userId),
  `tid` (active tenantId), `role` (`owner`/`operator`/`viewer` in that tenant), `prole`
  (platform role, e.g. `support`, if any), `sid` (session id). Signed HS256 with a key from the
  `JWT_KEYS` ring (`k1:hex,k2:hex`), `kid` in the header names which key. Rotate keys by adding a
  new `kid` to `JWT_KEYS` and flipping `JWT_ACTIVE_KID` — old tokens still verify against their
  original `kid` until they expire.
- **Refresh token**: an opaque 256-bit random value, `REFRESH_TTL` lifetime (default `30d`).
  Never a JWT. Stored **hashed** (`hashForStorage`, sha256) in `Session.refreshTokenHash` — a
  database dump yields nothing usable, same principle as tier-2 codes. Every call to
  `POST /auth/refresh` rotates it: the old hash is replaced with a new one on the same `Session`
  row (same `familyId`).
- **Reuse detection**: presenting an already-rotated (superseded) refresh token revokes the
  entire session family (`Session.revokedReason = 'reuse-detected'`) and returns
  `401 { "error": "refresh_reuse_detected" }`. This is what happens if a stolen refresh token is
  replayed after the legitimate client already rotated past it.
- **Session validity**: `TenantContextGuard` checks `TokenService.isSessionRevoked(sid)` on every
  request. A missing session id (never existed, or its row was deleted) counts as revoked — an
  access token can never outlive or bypass its session.

## The 404-not-403 rule

`TenantContextGuard` sets `request.tenantId` from the JWT's `tid` claim — **never** from a
header, query string, or body. If a route has a `:tenantId` path param and it doesn't match the
caller's `tid`, the guard returns **404**, not 403. The reasoning: a 403 confirms the tenant
exists and you're just not allowed in; a 404 tells an attacker nothing. Never special-case this
for "helpfulness" — the isolation harness (below) fails loudly if a route leaks the distinction.

The only routes where the path's `:tenantId` is authoritative instead:

- Routes decorated `@PlatformRole('support')` (e.g. `/internal/api-clients`).
- **Any** route, for a caller whose JWT has `prole: 'support'` — this is what lets
  `support@verifyng.local` run `GET /tenants/<any>/members` and similar. Every such
  cross-tenant access by a support principal emits a `support.tenant.accessed` event
  (`{ supportUserId, tenantId, route, at }`) for E13/E18 to audit. `RolesGuard` mirrors this:
  a `platformRole: 'support'` principal satisfies any `@Roles(...)` check without needing a
  `Membership` row in the target tenant.

## Adding a new protected, tenant-scoped route

```ts
@Controller('tenants/:tenantId/widgets')
export class WidgetsController {
  @Get()
  @Roles('viewer') // owner ⊃ operator ⊃ viewer
  list(@TenantId() tenantId: string) {
    // tenantId is server-derived and guaranteed to match the caller's membership
    // (or be a support override) — never read tenantId from anywhere else.
  }
}
```

- `@TenantId()` throws a 500 if used on a route with no tenant context — it's a decorator bug
  to reach for, not a runtime possibility, if the route sits behind the global guards (it does,
  by default — `TenantContextGuard` and `RolesGuard` are registered as `APP_GUARD`s in
  `AppModule`).
- `@Principal()` gives you the full `UserPrincipal` (`{ userId, tenantId, role, platformRole?,
sessionId }`) when you need more than the tenant id — e.g. to record who did something.
- `@Public()` skips auth entirely (health checks, `/auth/register`, `/auth/login`, the verify
  routes in E06).
- Never accept `tenantId` as a body field, query param, or custom header. If you find yourself
  doing that, you've reintroduced the vulnerability this guard exists to close.

## Running a job or fake service as an `ApiClient`

Service-to-service callers (BullMQ workers, `fake-sms`/`fake-pay`/`fake-geo`, OEM manifest
endpoints) authenticate with a bearer key instead of a user JWT:

```
Authorization: Bearer vk_<8-char-prefix>_<64-char-secret>
```

- Keys are minted via `ApiClientService.create(name, tenantId?, scopes[])`, which returns
  `{ id, rawKey }` — the raw key is shown **once**; only its hash (`keyHash`) and an 8-char
  `keyPrefix` (for display) are persisted.
- The four platform-level keys for `worker`, `fake-sms`, `fake-pay`, and `fake-geo` are seeded
  idempotently at boot from the `WORKER_KEY` / `FAKE_SMS_KEY` / `FAKE_PAY_KEY` / `FAKE_GEO_KEY`
  env vars — deterministic dev-only values live inline in `docker/compose.yml`'s `api` service
  (never in an `.env*` file — those are never committed, see `AGENTS.md`); production values
  come from E13's secrets abstraction.
- Guard a route with `@InternalOnly()` (any valid, non-revoked key) or `@InternalOnly('scope')`
  (key must have that scope in `ApiClient.scopes`). `@InternalOnly()` routes skip
  `TenantContextGuard`/`RolesGuard` entirely — `InternalOnlyGuard` is the only check, and it
  populates `request.user` as an `ApiClientPrincipal` (`{ apiClientId, tenantId, scopes }`).
- Revoke a key with `ApiClientService.revoke(id)` (sets `revokedAt`) — revoked and unknown keys
  both return 401 from `InternalOnlyGuard`.

## The cross-tenant isolation harness

Every epic that adds a tenant-scoped route must prove tenant A can never read or write tenant
B's rows through it. The harness lives in `packages/db/src/testing/tenant-isolation.ts` and is
exported from `@verifynng/db/testing`:

```ts
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import {
  createTestDatabase,
  dropTestSchema,
  disconnectTestHelper,
} from '@verifynng/db';
import {
  assertTenantIsolation,
  type IsolationRoute,
} from '@verifynng/db/testing';
import { AppModule } from '../../src/app.module';

describe('E0X isolation', () => {
  let app;
  let prisma: PrismaClient;
  let schemaName: string;

  beforeAll(async () => {
    const testDb = await createTestDatabase(__filename);
    schemaName = testDb.schemaName;
    process.env.DATABASE_URL = testDb.databaseUrl; // must be set BEFORE compiling the module

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    prisma = app.get(PrismaClient);
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
    await dropTestSchema(schemaName, prisma);
    await disconnectTestHelper();
  });

  it('isolates tenants', async () => {
    const routes: IsolationRoute[] = [
      {
        method: 'get',
        path: (b) => `/tenants/${b.tenant.id}/widgets`,
        expectWhenCrossTenant: 404,
      },
      // ... one entry per tenant-scoped route your epic adds
    ];
    await assertTenantIsolation(app, prisma, routes);
  });
});
```

- `assertTenantIsolation` creates two fresh tenants internally (`createTwoTenants`, each with a
  real `owner`/`operator`/`viewer` — a `User`, `Membership`, `Session`, and a signed access
  token per role), then for every route calls it **as tenant A's owner against tenant B's
  resource** and asserts:
  1. The response status equals `expectWhenCrossTenant` (`404` for the default rule, `403` for
     a `@PlatformRole` route probed by a non-support caller).
  2. Not a single row scoped to tenant B changed — it snapshots row count + latest `updatedAt`
     for **every** Prisma model with a `tenantId` field (via `Prisma.dmmf`, so this stays
     correct as new models are added) before and after the call.
- It throws a descriptive `Error` on the first violation, which fails the enclosing `it()` —
  temporarily change a route to read `tenantId` from the query string and this spec must go red.
- `process.env.DATABASE_URL` **must** be set to the isolated test schema's URL before
  `Test.createTestingModule(...).compile()` runs, because `AuthModule`/`MembersModule` construct
  their own `PrismaClient` instances (not the shared `@verifynng/db` singleton), and each reads
  `DATABASE_URL` from the environment at construction time.
- Put your spec at `apps/api/test/isolation/<epic-id>.isolation.spec.ts` — E21 wires the whole
  directory into the CI `test` job.

## Argon2id parameters

`PasswordService` hashes with `ARGON2_M_COST` (default 64 MiB), `ARGON2_T_COST` (default 3),
`ARGON2_P_COST` (default 4) — tune these via env, not code, if the cost needs to change.
`needsRehash()` tells you when a stored hash was made with different parameters, so you can
opportunistically re-hash on next successful login.

## Seeded dev accounts

`pnpm db:seed` creates, all with password `Passw0rd!Passw0rd!`:

| Email                      | Role     | Tenant                         |
| -------------------------- | -------- | ------------------------------ |
| `owner@ivoryglow.local`    | owner    | ivoryglow                      |
| `operator@ivoryglow.local` | operator | ivoryglow                      |
| `viewer@ivoryglow.local`   | viewer   | ivoryglow                      |
| `support@verifyng.local`   | —        | none (platformRole: `support`) |

## Mailer

`AuthModule`/`MembersModule` bind the Nest `MAILER` token to `SmtpMailer` (nodemailer →
Mailpit on `mailpit:1025`). This is a stand-in for E14's real `Mailer` — when E14 ships, it
swaps the provider binding in a follow-up PR; nothing in `AuthModule`/`MembersModule` changes.
Tests should provide their own fake `Mailer` implementation bound to the same `MAILER` token
rather than hitting real Mailpit (it's an outbound-integration boundary, same rule as mocking
SendGrid).
