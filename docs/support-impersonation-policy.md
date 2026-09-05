# Support Impersonation Policy

Platform support can step into any tenant's console to reproduce a problem.
This document says when that's allowed, what it requires, what it never
allows, how long it lasts, what's retained, and what the tenant sees. It's
linked from the impersonation start dialog and the elevate-to-write dialog in
the console (`apps/web-admin/components/impersonation-banner.tsx`).

## Why this exists

Before this, the only way support could look at a tenant's account was a
shared password or a raw database query — unaudited, with no time limit, and
no record of who did what. Every session described here is time-boxed,
scoped, and logged; there is no other way to act on a tenant's behalf.

## Read vs. write

- **Read mode is the default and requires no reason.** Starting a session
  (`POST /v1/platform/impersonation` with `mode: "read"`) lets support view
  the tenant's console exactly as an operator would, but every non-`GET`
  request is rejected with `impersonation_read_only` — including anything a
  read-mode session's own token could otherwise reach.
- **Write mode requires a reason of at least 20 characters** describing what
  you're doing and why (e.g. "Reproducing ticket #1042: mint fails with 500
  for product X" — not "fixing bug" or "per ticket"). Write mode grants the
  `operator` role, never `owner`: billing, member management and SSO
  configuration stay out of reach even in write mode. If a fix genuinely
  requires an owner-only action, it's done through support's own platform
  routes (E15's mark-paid, E02's account tooling) so it's audited as a
  _support_ action against that tenant, not a tenant action.
- **Elevating from read to write mid-session** starts a new session (same
  HTTP endpoint, `mode: "write"` this time) rather than upgrading the
  existing one in place — the read session is superseded and ends; the write
  session gets its own reason, its own 30-minute clock, and its own row in
  the impersonation history.

## Time limit

Every session expires 30 minutes after it starts
(`SUPPORT_IMPERSONATION_TTL_SECONDS`, default `1800`) and **cannot be
extended** — there is no refresh token for an impersonation session by
design. Needing more time means starting a new session, which means a new
audit trail entry, not a silently-extended old one. A BullMQ job revokes the
underlying session at expiry independently of whether anyone is still
clicking around, so a forgotten tab doesn't stay live.

## What's logged

- Starting and ending a session emits `impersonation.started` /
  `impersonation.ended` and is stored in `ImpersonationSession` (mode,
  reason, who, which tenant, start/end time, how it ended).
- Every audited action taken during a session (see `@Audited()` handlers
  across the codebase) is tagged with `impersonatedBy` (the support user's
  email) and `impersonationSessionId` on the `AuditLog` row, so a tenant's
  own audit log at `/audit` shows exactly what support did and who did it —
  filterable by the "impersonated" chip.
- These two `AuditLog` columns are deliberately **not** part of the
  tamper-evident hash chain (see the comment in
  `apps/api/src/modules/audit/audit.service.ts`) — adding them to the hash
  input would have invalidated every row written before this feature
  existed. They're still permanently stored and queryable; they just aren't
  part of the cryptographic chain integrity check.

## What tenants see

- **They're told by default.** Starting any session (read or write) emails
  the tenant's owner: "Platform support viewed your account." A tenant can
  turn this off in their settings (`Tenant.notifyOnImpersonation`) — but
  turning it off is itself an audited action, so silence is never invisible.
- **The banner is unmissable during the session itself.** Anyone impersonating
  sees a persistent top banner naming the mode, a live countdown, an Elevate
  button (read mode) and an End session button — there's no way to
  impersonate without the person at the keyboard being constantly reminded
  they're not looking at their own account.
- **Every action is visible after the fact** in the tenant's own audit log,
  tagged as done by support, with the reason on file for anything written.

## Retention

`ImpersonationSession` rows are never deleted by this epic — they're the
record of every time support touched a tenant's account, which is exactly
the kind of thing that should outlive the session itself. If a future
retention policy (E19) needs to schedule these for anonymization or deletion,
that's a change to E19's retention schedule referencing this table, not a
silent default here.

## What this is not

- Not a way around `owner`-only actions (see "Read vs. write" above).
- Not a substitute for asking the tenant first when a lower-friction path
  exists — impersonation is for reproducing bugs and fixing things the
  tenant can't fix themselves, not a first resort.
- Not anonymous: `impersonatedBy` always resolves to a real support user's
  email, never a shared account.
