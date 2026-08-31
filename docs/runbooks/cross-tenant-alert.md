# Runbook: Cross-Tenant Isolation Alert

**SEV1.** A cross-tenant data leak is the single worst failure this platform
can have — it means one tenant saw another tenant's units, scans, reports or
audit rows. Treat any credible signal as real until disproven.

## 1. Trigger & Detection

- An `apps/api/test/isolation/E*.isolation.spec.ts` test fails on `main`
  (E21's isolation matrix — see `docs/epics/E21-quality-engineering.md`).
  These tests assert that a tenant JWT can never read another tenant's rows;
  a failure here is a genuine regression, not flakiness, until proven
  otherwise.
- E13's audit log shows a `TenantDirectoryService`/support-scoped query
  returning rows for a tenant the caller shouldn't see (support routes are
  the one legitimate cross-tenant read path — see
  `docs/support-impersonation-policy.md` — so the alarm is a _tenant_ JWT
  reaching another tenant's data, not a `platformRole=support` one).
- A tenant reports seeing another tenant's name, units, or codes in their own
  console.

## 2. First 5 minutes

1. **Freeze, don't guess.** If the report is credible (a tenant shows you a
   screenshot with another tenant's data), suspend the affected tenant(s)
   immediately via `POST /support/tenants/:tenantId/suspend` (E03) so the
   leak can't continue while you investigate — writes are blocked, verify
   stays open (matches E03's suspended-tenant guard semantics).
2. Pull the request in question from logs (`docker compose logs api` — every
   request logs `tenantId`, `requestId`, `path`) and identify exactly which
   route returned the wrong tenant's data.
3. Check whether the isolation test suite (`apps/api/test/isolation/**`)
   already covers that route; if it does and is green locally against the
   same code, the bug may be data-shape-specific (a missing `where: {
tenantId }` clause that only manifests for certain records) — write a
   regression test with the exact data shape before touching anything else.
4. Open an `Incident` (E19, `POST /v1/incidents`, severity `critical`) so
   there's a durable record independent of this runbook.

## 3. Diagnosis

- Grep the suspect module for Prisma queries missing a `tenantId` filter —
  this is the overwhelmingly common cause (a `findMany`/`findFirst` that
  forgot to scope by tenant, or a route that trusts a client-supplied
  `tenantId` instead of the JWT's).
- Check whether the route is `@PlatformRole('support')` or otherwise
  deliberately cross-tenant (E18's own `/v1/platform/**` routes are — that's
  by design, not a leak) before treating an cross-tenant read as a bug.

## 4. Remediation

1. Fix the missing tenant-scoping (small, surgical diff — see
   `~/.claude/rules/coding-standards.md`'s "make surgical changes").
2. Add the exact failing case to `apps/api/test/isolation/**` so it can never
   regress silently again.
3. Once the fix is verified (isolation suite green, manual repro no longer
   reproduces), reactivate any tenant suspended in step 2.1 via
   `POST /support/tenants/:tenantId/reactivate`.
4. Notify affected tenants per `docs/breach-notification-runbook` policy
   (E19) if any real cross-tenant read of another tenant's data actually
   occurred (not just a near-miss caught by a test).

## 5. Verification

- `pnpm --filter @verifynng/api test -- isolation` green.
- Manual repro of the original report no longer reproduces.
- `Incident` from step 2.4 updated with resolution and closed.

## Post-incident review template

- **Incident Title:**
- **Tenants affected (and what they could see):**
- **Root cause (missing tenantId filter, trusted client input, ...):**
- **Fix (link the PR):**
- **New isolation test added:**
- **Tenant notification sent (yes/no, and why):**
