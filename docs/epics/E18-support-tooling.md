# E18 — Support Tooling

|                 |                                                                                                                                                                                                                                                                                                 |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Wave            | 3                                                                                                                                                                                                                                                                                               |
| Status          | in-progress                                                                                                                                                                                                                                                                                     |
| Owner           | @enendufrankc                                                                                                                                                                                                                                                                                   |
| GitHub Issue    | [#19](https://github.com/enendufrankc/verifynNG/issues/19)                                                                                                                                                                                                                                      |
| Depends on      | E02 (roles incl. platform `support`, sessions), E13 (`@Audited`, audit viewer), E11 (admin shell, route groups), E14 (`MailerPort`, inbound simulation), E08 (captcha port), E15 (plan/usage for tenant directory), E12 (`GET /tenants/:id/usage`), E09 (web-verify for public `/support` form) |
| Unblocks        | E17 (runbook link target for "verify API down"), E21 (support fixtures)                                                                                                                                                                                                                         |
| Readiness items | `production-readiness.md` §9 all rows (support intake, audited admin impersonation, runbooks, public docs/FAQ, self-service) · §2 audit log (consumed)                                                                                                                                          |

## Goal

The people running the platform can see every tenant, step into a tenant's console to reproduce a problem without ever doing so unaudited, answer tickets that arrive from the console, the public verify site or email, and follow written runbooks when something breaks at 2 a.m. Tenants and consumers can read plain-language docs on how codes work, how to apply labels and what printers to use. Without this the first support request is a Slack DM and the first impersonation is a shared password.

## Scope

**In:** platform-support area `app/(support)/**` with tenant directory (status, plan, usage, last activity), audited impersonation with read-only default + elevated write session with reason, banner, `impersonatedBy` tagging in every audit row, 30-minute auto-expiry; ticketing (`Ticket`, `TicketNote`, `CannedResponse`) with three intake channels (console help form, public `/support` form in web-verify with captcha, inbound email via Mailpit simulation), ticket list/detail/assign/status/notes/canned responses; runbooks under `docs/runbooks/`; public docs site `apps/docs` on port 3002; contextual help links from every admin module.

**Out:** audit log storage and viewer (E13 — E18 adds a filter for `impersonatedBy`), the `support` role definition and session mechanics (E02 — E18 builds impersonation on top of E02's session service), billing subscription list `app/(support)/subscriptions/**` (E15 owns that one route group inside E18's shell), status page and alerting (E17), email sending/receiving transport (E14 — E18 consumes `MailerPort` and E14's inbound webhook), a full helpdesk (Zendesk-class SLAs, live chat — future), tenant self-service knowledge search inside the console beyond links (future), translations of docs (future).

## Owned paths

```
apps/api/src/modules/support/**              tenant directory, impersonation, tickets, canned responses
apps/web-admin/app/(support)/**              shell for the support area (layout, nav) + tenants/, tickets/, impersonation/  — except subscriptions/ (E15)
apps/web-admin/app/(console)/help/**         in-console help form + "help for this page" component
apps/web-verify/app/support/**               public consumer support form (route group agreed with E09)
apps/docs/**                                 public docs/FAQ site
packages/db/prisma/schema.prisma             (additive block: "E18")
packages/ui/src/HelpLink.tsx                 (one component, reviewed by E11)
docs/runbooks/**
docs/support-impersonation-policy.md
```

## Interfaces

**Consumes:**

- E02: platform role `support` (a `User` with `platformRole = support` and no tenant membership), `SessionService.issue(userId, claims)` / `revoke(sessionId)` for creating impersonation sessions, `@Roles()`, `@TenantId()`; `Membership` for resolving the tenant owner as default ticket contact.
- E13: `@Audited`, `AuditContext` request-scoped provider — **change request to E13**: `AuditLog` needs `impersonatedBy String?` and `impersonationSessionId String?` columns and `AuditContext` must accept them so every row written during an impersonated request carries them; audit viewer gets an "impersonated" filter chip.
- E11: `app/(support)/**` route group registration and a separate support nav (`supportNav.config.ts` under E18's path but rendered by E11's shell), `apiClient`, `EmptyState`, `Banner` component; E11's `loginAs('support')` Playwright fixture.
- E14: `NotificationService.send('ticket.created'|'ticket.replied'|'impersonation.started', …)` (template request), `MailerPort`; E14's inbound simulation: Mailpit webhook or `POST /v1/notifications/inbound` (E14 exposes; E18 subscribes to event `mail.inbound { from, to, subject, text, messageId, inReplyTo }`).
- E08: `CaptchaPort.verify(token, ip)` for the public `/support` form.
- E15: `SubscriptionService.getForTenant`, `GET /v1/platform/subscriptions` for plan column; E12: `GET /tenants/:id/usage` for usage column.
- E03: `Tenant.status`, `TenantService.get/list`, tenant settings (`supportEmail`).
- E09: layout for `apps/web-verify/app/support/page.tsx`.
- E17: `/status` link target for the "verify API down" runbook (documented, not code).

**Exposes:**

Nest providers (module `SupportModule`):

```ts
TenantDirectoryService; // list({ q, status, planCode, cursor }) joins Tenant + Subscription + UsageSummary + last AuditLog
ImpersonationService; // start(supportUserId, tenantId, { mode:'read'|'write', reason? }) → { sessionToken, expiresAt }; end(sessionId); active(supportUserId)
ImpersonationGuard; // on every tenant route: if session.impersonation present → deny mutations unless mode='write'; extend AuditContext
TicketService; // createFromConsole, createFromPublicForm, createFromInboundMail, list, get, assign, setStatus, setPriority, addNote(internal|reply)
CannedResponseService; // CRUD, render(templateId, vars)
```

HTTP routes:

```
GET   /v1/platform/tenants                                  support   directory with filters
GET   /v1/platform/tenants/:tenantId                        support   detail card (owner, plan, usage, status, recent audit)
POST  /v1/platform/impersonation                            support   { tenantId, mode, reason? } → { token, expiresAt }   (reason required when mode=write)
DELETE /v1/platform/impersonation/:sessionId                support|impersonated
GET   /v1/platform/impersonation/active                     support
GET   /v1/platform/tickets                                  support   ?status&priority&assigneeId&tenantId&cursor
GET   /v1/platform/tickets/:id                              support
PATCH /v1/platform/tickets/:id                              support   { status?, priority?, assigneeId? }
POST  /v1/platform/tickets/:id/notes                        support   { body, kind:'internal'|'reply', cannedResponseId? }  reply → email via E14
GET/POST/PATCH/DELETE /v1/platform/canned-responses[/:id]   support
POST  /v1/tenants/:tenantId/support/tickets                 owner|operator|viewer  { subject, body, pageUrl? }
GET   /v1/tenants/:tenantId/support/tickets                 owner|operator|viewer  own tenant's tickets
POST  /v1/public/support                                    anonymous; captcha; per-IP limit  { email, subject, body, code? }
```

Domain events:

```
ticket.created           { ticketId, tenantId?, channel:'console'|'public'|'email', priority, requesterEmail }
ticket.status_changed    { ticketId, from, to, actorId }
impersonation.started    { sessionId, supportUserId, tenantId, mode, reason?, expiresAt }
impersonation.ended      { sessionId, supportUserId, tenantId, endedBy:'user'|'expiry'|'revoked', durationSeconds }
```

Prisma models: `ImpersonationSession`, `Ticket`, `TicketNote`, `CannedResponse`.

Docs site: `http://localhost:3002` with stable slugs consumed by `HelpLink` (`/docs/codes`, `/docs/labels`, `/docs/printers`, `/docs/console/<module>`, `/docs/api` → links to `http://localhost:4000/api/docs`).

## Data model

Additive block `// E18`.

```prisma
enum ImpersonationMode  { read write }
enum TicketStatus       { open pending_customer in_progress resolved closed }
enum TicketPriority     { low normal high urgent }
enum TicketChannel      { console public email }
enum TicketNoteKind     { internal reply system }

model ImpersonationSession {
  id            String            @id @default(cuid())
  supportUserId String
  tenantId      String
  mode          ImpersonationMode
  reason        String?                             // required when mode = write (validated in service)
  sessionId     String            @unique           // E02 session created for the impersonated context
  startedAt     DateTime          @default(now())
  expiresAt     DateTime                            // startedAt + 30 min, non-extendable
  endedAt       DateTime?
  endedBy       String?                             // user | expiry | revoked
  @@index([supportUserId, endedAt])
  @@index([tenantId, startedAt])
}

model Ticket {
  id              String         @id @default(cuid())
  number          Int            @unique @default(autoincrement())   // shown as #1042
  tenantId        String?                                            // null for anonymous consumer tickets
  requesterEmail  String
  requesterUserId String?
  channel         TicketChannel
  subject         String
  body            String
  status          TicketStatus   @default(open)
  priority        TicketPriority @default(normal)
  assigneeId      String?
  pageUrl         String?                                            // console page the help form was opened from
  relatedCode     String?                                            // redacted code for consumer tickets
  emailThreadId   String?                                            // Message-ID root for inbound replies
  lastActivityAt  DateTime       @default(now())
  resolvedAt      DateTime?
  createdAt       DateTime       @default(now())
  updatedAt       DateTime       @updatedAt
  notes           TicketNote[]
  @@index([status, priority, lastActivityAt])
  @@index([tenantId, createdAt])
  @@index([requesterEmail])
}

model TicketNote {
  id        String         @id @default(cuid())
  ticketId  String
  authorId  String?                                 // null for inbound email from requester
  kind      TicketNoteKind
  body      String
  createdAt DateTime       @default(now())
  ticket    Ticket @relation(fields: [ticketId], references: [id], onDelete: Cascade)
  @@index([ticketId, createdAt])
}

model CannedResponse {
  id        String   @id @default(cuid())
  slug      String   @unique
  title     String
  body      String                                  // supports {{requesterName}}, {{tenantName}}, {{ticketNumber}}
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}
```

Change request to E13 (see Interfaces): `AuditLog.impersonatedBy String?`, `AuditLog.impersonationSessionId String?`.

## Tasks

- [x] T1 `SupportModule` scaffold + schema block + migration `E18_support`; support nav + shell, access restricted to `platformRole = support` (404 for others — see Notes below on the `(support)` vs `(console)/support` naming). Live-verified: login as `support@verifyng.local` redirects straight to `/support`, directory renders. Not done: a dedicated `loginAs('support')` smoke test (the Playwright spec added under T14 does its own inline login instead).
- [x] T2 Tenant directory — live-verified against the seeded stack (IVORY GLOW row with real units-this-year/scans-30d numbers, search/filter, detail drawer). `planCode` is a stubbed `null` — E15 hasn't shipped `GET /v1/platform/subscriptions` yet.
- [x] T3 Impersonation (read) — live-verified: starting a session, the 403 on a mutation, the banner. `impersonatedBy`/`impersonationSessionId` land on `AuditLog` via `ImpersonationGuard` tagging the request (there's no separate `AuditContext` class in this codebase's actual E13 implementation — audit.interceptor.ts builds straight off `req.user`, so that's where this hooks in instead). The owner-notification email path is implemented and unit-covered via NotificationService but not confirmed in Mailpit live.
- [x] T4 Impersonation (write + UX) — live-verified: reason validation, elevate, write-mode mutation succeeding, end session. **Security gap found and fixed while verifying this**: the guard only checked GET-vs-write, not the operator ceiling, so a write-mode session could reach an owner-only route (`unit.decommission`) — see the `fix(E18)` commit and `impersonation.guard.spec.ts`. Expiry job exists (`ImpersonationProcessor`) but the 60-second `SUPPORT_IMPERSONATION_TTL_SECONDS` override scenario (AC4) wasn't run live.
- [x] T5 `docs/support-impersonation-policy.md`.
- [x] T6 Tickets core — service/models/events/`@Audited` all written and typechecked; not exercised live end-to-end (no ticket was actually created and moved through its status machine against the running stack).
- [x] T7 Intake — console — built (`/help`, `/help/tickets`, `HelpLink`) and typechecked; not exercised live (no ticket actually submitted through the form in a browser).
- [x] T8 Intake — public — built (`apps/web-verify/app/support/page.tsx`, captcha bypass input, quota); not exercised live.
- [x] T9 Intake — email — built (`InboundMailListener` on `mail.inbound`, `support:simulate-inbound` CLI sending real SMTP through Mailpit); the CLI itself is also standing in for E14's own inbound emitter, which doesn't exist yet. Not run live.
- [x] T10 Support ticket UI — built and typechecked; not exercised live.
- [x] T11 Runbooks — all written against what actually exists today (payment-failure.md and auth-lockout.md call out real gaps — no E15 billing yet, no admin MFA-reset endpoint — rather than describing tooling that doesn't exist). `restore-from-backup.md`'s drill was actually run twice against this worktree's stack; see its own "Last drill" table.
- [x] T12 `apps/docs` — live-verified (build + browser: home, index, search for "scratch", a content page). Deliberately plain markdown + `marked` rather than Fumadocs — see the `feat(E18): T12` commit for why. `/docs/api` now has a real target: added a live `SwaggerModule` at `/api/docs` (didn't exist before this epic at all).
- [ ] T13 Help links everywhere — only `console/support` and `console/help` (E18's own modules) done, as the worked example. The other nine modules listed need a one-line PR into each owning epic's path with that owner's sign-off — not done here. `pnpm docs:check-links` exists and passes for the two links that do exist.
- [ ] T14 Playwright — `tests/e2e/support-impersonation.spec.ts` covers AC2-AC4's core (directory → impersonate read → blocked mutation → elevate → write succeeds), run live (3/3 passed). Ticket lifecycle across the three channels and a docs-site smoke test are not covered.

## Acceptance criteria

Verified against this worktree's compose stack (ports offset per
`scripts/epic ports E18`, not the literal `localhost:3000/3001/4000/3002`
below — see the epic's port table in the claiming comment) except where
noted. Evidence is manual (curl/browser/Playwright output), not yet pasted
onto issue #19 — see the final PR/handoff notes for why.

- [x] AC1 Verified. Support login redirects to `/support` (this repo's
      actual route, not the epic's originally-planned bare `/tenants` — see
      Notes) and the directory lists the seeded tenants with real
      units/scans numbers. `planCode` shows `—` (E15 hasn't shipped). Not
      verified: `acme`/`nkem-naturals` specifically (this worktree's seed
      only has `ivoryglow` + two unrelated E05 test tenants) or the
      owner-redirect-away-from-`/support` half.
- [x] AC2 Verified live (browser + Playwright): new tab, read-only banner
      with countdown, `POST .../batches` → 403 `impersonation_read_only`.
      Not verified: the Mailpit owner-notification email.
- [x] AC3 Verified live (curl + browser): reason validation, write-mode
      mint succeeding. Not verified: the `batch.minted` audit row, because
      `apps/api/src/modules/batches/batches.controller.ts`'s mint route has
      no `@Audited()` decorator at all today — a pre-existing E04 gap, not
      something this epic's own tagging mechanism can demonstrate against.
      `impersonatedBy` tagging itself is verified via other audited routes'
      test coverage (`impersonation.guard.spec.ts`).
- [ ] AC4 Not run. `SUPPORT_IMPERSONATION_TTL_SECONDS` override + the
      60-second wait wasn't exercised against the live stack.
- [ ] AC5 Not run.
- [ ] AC6 Not run.
- [ ] AC7 Not run.
- [x] AC8 Verified live — see `docs/runbooks/restore-from-backup.md`'s
      "Last drill" table for the actual run (two full backup→restore→verify
      cycles, ~11-32s each, correct verdict both times).
- [x] AC9 Mostly verified live: site renders, search for "scratch" finds
      _Applying labels_, `pnpm docs:check-links` passes. Not verified:
      Lighthouse accessibility score (no Lighthouse run performed) and
      `/docs/api`'s live link target (the API image serving `/api/docs` was
      still mid-rebuild when this was last checked).

## Testing

- Unit: impersonation claims builder (never grants `owner`), reason validation, TTL math, ticket status machine (legal/illegal transitions, reopen-on-inbound), inbound-email threading (`In-Reply-To`, subject `[#N]`, neither → new ticket), canned-response variable rendering, code redaction on public tickets.
- Integration (Postgres + Redis): `ImpersonationGuard` blocks every non-GET tenant route in read mode (auto-discovered via Nest reflection, shared with E21's matrix); audit rows carry `impersonatedBy` during impersonated requests and are null otherwise; expiry job revokes the E02 session; `TenantDirectoryService` never leaks across tenants when called with a tenant JWT (must 403); public form rate limit.
- E2E (Playwright): AC2–AC7 flows using `loginAs('support')`, `loginAs('owner')`, `loginAs('operator')`; docs site smoke; visual snapshot of the impersonation banner in both modes.
- Docs: link checker for `apps/docs` and for every runbook's internal links; runbooks reviewed by running the restore drill in CI nightly (E21 schedules; E18 owns the scripts).

## Compose services added

| Service          | Image              | Host port | Notes                                              |
| ---------------- | ------------------ | --------- | -------------------------------------------------- |
| docs             | apps/docs          | 3002      | static export served by `next start`; no DB        |
| postgres-restore | postgres:16-alpine | 5433      | `profiles: [drill]` — only started by `restore.sh` |

`api` env additions: `SUPPORT_IMPERSONATION_TTL_SECONDS=1800`, `SUPPORT_INBOUND_ADDRESS=support@verifyng.local`, `SUPPORT_PUBLIC_FORM_RPH=5`, `DOCS_BASE_URL=http://localhost:3002`.

## Notes and decisions

- **Impersonation never grants `owner`.** Billing, member management and SSO config are owner-only by E02/E15/E20 and stay out of reach even in write mode; support fixes those via their own platform routes (E15 mark-paid, E02 CLI MFA reset), which are audited as support actions rather than tenant actions.
- **Tenants are told.** Read sessions notify the owner by default; the setting to silence it exists for tenants who ask, and turning it off is itself audited.
- **Tickets are deliberately simple.** No SLAs, no macros beyond canned responses, no attachments. When volume justifies a real helpdesk, `Ticket` becomes the sync target rather than being replaced.
- **`app/(support)/**`is E18's shell**; E15's`subscriptions/` route group lives inside it by agreement so the support nav has one owner.
- **Docs are public and unauthenticated.** Anything tenant-specific stays in the console; the docs site holds only what a competitor could read without harm — which is everything about how the system works, per mental-model §5 "honest limits".
- **Runbooks are tested by running them.** The restore drill is the one that must never be theoretical; it runs nightly in E21's schedule and its duration is recorded in the runbook.
- **Actual route is `apps/web-admin/app/(console)/support/**`, not `app/(support)/**`.** By the time E18 was claimed, E11/E19/E03 had already settled on one console route group with a `platform` nav section gated by `platformRole`, rather than the separate top-level `(support)` group this file originally specified — see `nav.config.ts`'s `platform.support` entry and E03's pre-existing `support/tenant-review/` page (kept as-is; added as one more tab in E18's own sub-nav). Followed the codebase's actual convention rather than this file's stale wording. Same reasoning for AC1: support lands on `/support`, not a bare `/tenants`.
- **A pre-existing, unrelated bug blocks `pnpm --filter @verifynng/web-admin build`** (and therefore a production `docker compose up` of web-admin) for every route that renders `packages/ui`'s `EmptyState` from a Server Component — "Functions cannot be passed directly to Client Components from Server Components," reproduced identically with every E18 change reverted to `origin/main`. Confirmed narrower than it first looked: pages that are themselves `'use client'` (everything E18 built) are unaffected; `/`, `/units`, and other still-placeholder or Server-Component pages are not. `/impersonate` redirects to `/batches` instead of `/` to route around it. Flagged for the orchestrator/other epics rather than fixed here — root-causing a shared-package RSC/bundling issue is out of this epic's owned paths and this session's remaining budget.
- **A real gap found while verifying T4 was fixed, not just noted**: write-mode impersonation could reach owner-only routes (RolesGuard's own `platformRole==='support'` bypass ignores `@Roles()` entirely once a session exists). `ImpersonationGuard` now also enforces the operator ceiling directly. See `impersonation.guard.spec.ts` and the `fix(E18)` commit.
