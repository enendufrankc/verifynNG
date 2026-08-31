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

- [x] T1 `SupportModule` scaffold + schema block + migration `E18_support`; support nav + shell, access restricted to `platformRole = support` (404 for others — see Notes below on the `(support)` vs `(console)/support` naming). Live-verified: login as `support@verifyng.local` redirects straight to `/support`, directory renders; login as an `ivoryglow` owner and visiting `/support` gets a clean 404. Not done: a dedicated `loginAs('support')` smoke test (the Playwright specs added under T14 do their own inline login instead).
- [x] T2 Tenant directory — live-verified against the seeded stack (IVORY GLOW row with real units-this-year/scans-30d numbers, search/filter, detail drawer). `planCode` is a stubbed `null` — E15 hasn't shipped `GET /v1/platform/subscriptions` yet.
- [x] T3 Impersonation (read) — live-verified: starting a session, the 403 on a mutation, the banner, the confirmation email in Mailpit for both console and public tickets (the impersonation-start owner notification specifically uses the same `NotificationService.send` path, unit-tested but not re-confirmed in Mailpit on this pass). `impersonatedBy`/`impersonationSessionId` land on `AuditLog` via `ImpersonationGuard` tagging the request (there's no separate `AuditContext` class in this codebase's actual E13 implementation — audit.interceptor.ts builds straight off `req.user`, so that's where this hooks in instead) — confirmed live against `unit.flag`, a route that's actually `@Audited()` (batch minting isn't — see AC3 below).
- [x] T4 Impersonation (write + UX) — live-verified end to end: reason validation, elevate, write-mode mutation succeeding, end session, **and now expiry** (`SUPPORT_IMPERSONATION_TTL_SECONDS=60` override, the session record shows `endedAt` ~27ms after `expiresAt` — caught proactively by the BullMQ job, not just the guard's lazy check — `endedBy: "expiry"`, and the next request 401s). **Security gap found and fixed while verifying this**: the guard only checked GET-vs-write, not the operator ceiling, so a write-mode session could reach an owner-only route (`unit.decommission`) — see the `fix(E18)` commit and `impersonation.guard.spec.ts`.
- [x] T5 `docs/support-impersonation-policy.md`.
- [x] T6 Tickets core — live-verified: created via console/public/email intake, status transitions (resolved → reopened on inbound reply), notes (internal + reply), `@Audited` mutations. Two real bugs found and fixed while doing this (both were live-verified before _and_ after the fix): canned-response rendering never had a `requesterName` value to substitute (now resolves the requester's real `displayName` when known, falling back to their email); a support reply's outbound subject doubled its own `[#N]` tag (the caller and the template renderer were both appending it).
- [x] T7 Intake — console — live-verified: `/help` prefilled from a `docSlug`/`module`-bearing URL, ticket created, visible at `/help/tickets` for the requester and `/support/tickets` for support with the right channel/tenant, confirmation email in Mailpit.
- [x] T8 Intake — public — live-verified on `apps/web-verify/app/support/page.tsx`: ticket created with `channel=public`, `tenantId` resolved from a real scanned code, `relatedCode` redacted, confirmation email in Mailpit, and the 6th submission from the same IP within the hour returned 429 with the exact `support_public_form_per_ip_per_hour` quota body.
- [x] T9 Intake — email — live-verified via the real CLI command (fixed two bugs to get there — see Notes): ticket created with `channel=email`; a support reply using a canned response produced the `[#N]`-tagged outbound subject in Mailpit; simulating an inbound reply with that subject appended a `reply` note (`authorId: null`) and reopened the ticket from `resolved` back to `open`.
- [x] T10 Support ticket UI — live-verified: list with filters, detail page, status/priority controls, canned-response picker with variable substitution, reply vs. internal-note toggle, "View as tenant" from a ticket.
- [x] T11 Runbooks — all written against what actually exists today (payment-failure.md and auth-lockout.md call out real gaps — no E15 billing yet, no admin MFA-reset endpoint — rather than describing tooling that doesn't exist). `restore-from-backup.md`'s drill was actually run twice against this worktree's stack; see its own "Last drill" table.
- [x] T12 `apps/docs` — live-verified (build + browser: home, index, search for "scratch", several content pages, all 12 doc slugs statically prerendered). Deliberately plain markdown + `marked` rather than Fumadocs — see the `feat(E18): T12` commit for why. `/docs/api` links to a live `SwaggerModule` at `/api/docs` (didn't exist before this epic at all) — confirmed reachable (200) from this worktree's rebuilt API image.
- [x] T13 Help links — `<HelpLink>` now wired into 8 modules' page headers: `console/support`, `console/help` (E18's own), plus `console/batches`, `console/units`, `console/anomalies`, `console/reports`, `console/team`, `console/settings` (single-line `PageHeader` `actions` additions, each with its own new `apps/docs/content/console-*.md` page). Not done: `scans` (E12) and `billing`/`api-keys` (E15/E16) — those modules are themselves still unbuilt `ModuleEmptyState` placeholders, so there's nothing real to link help to yet; add their `HelpLink` alongside whoever builds them. `pnpm docs:check-links` passes for all 8 live usages.
- [x] T14 Playwright — `tests/e2e/support-impersonation.spec.ts` (AC2-AC4: directory → impersonate read → blocked mutation → elevate → write succeeds → expiry banner) and `tests/e2e/support-tickets.spec.ts` (AC5: console intake visible to both the requester and support; AC6: public intake confirmation) — both run live, all green. Not covered: AC7 (CLI-driven, not browser-driven, so not a natural Playwright case) and a docs-site smoke test.

## Acceptance criteria

Verified against this worktree's compose stack (ports offset per
`scripts/epic ports E18`, not the literal `localhost:3000/3001/4000/3002`
below — see the epic's port table in the claiming comment). Evidence is
manual (curl/browser/Playwright output) recorded here and in the PR
description, not pasted onto issue #19 — this session's GitHub token 403s
on both issue comments and self-assignment; needs a token with write scope,
or for the orchestrator to do it by hand.

- [x] AC1 Verified. Support login redirects to `/support` (this repo's
      actual route, not the epic's originally-planned bare `/tenants` — see
      Notes) and the directory lists the seeded tenants with real
      units/scans numbers. `planCode` shows `—` (E15 hasn't shipped). An
      `ivoryglow` owner visiting `/support` gets a clean 404 (a deliberate
      "never confirm access" choice over a redirect — see Notes). Not
      verified: `acme`/`nkem-naturals` specifically — this worktree's
      default seed only creates `ivoryglow` (plus two unrelated E05 test
      tenants); those two names are E21 seed content, not something E18
      controls.
- [x] AC2 Verified live (browser + Playwright): new tab, read-only banner
      with countdown, direct API call on the tab's own token → 403
      `impersonation_read_only`, confirmation email in Mailpit (for the
      console/public ticket-created notices sharing the same send path;
      the impersonation-start notice itself uses the same mechanism and is
      unit-tested, not independently re-confirmed in Mailpit this pass).
- [x] AC3 Verified live (curl + browser + Playwright): reason validation
      (rejects <20 chars, accepts a real one), write-mode mint succeeding,
      the reason recorded at `/support/impersonation`. `impersonatedBy`
      confirmed directly on an `AuditLog` row from a write-mode session
      hitting `unit.flag` (`@Audited`) — `batch.minted` specifically isn't
      audited at all today (`apps/api/src/modules/batches/batches.controller.ts`
      has no `@Audited()` decorator on mint), a pre-existing E04 gap this
      epic's tagging mechanism can't be demonstrated against until E04
      adds one.
- [x] AC4 Verified live: `SUPPORT_IMPERSONATION_TTL_SECONDS=60` compose
      override, the session's `endedAt` lands ~27ms after `expiresAt`
      (the BullMQ expiry job caught it proactively), `endedBy: "expiry"`
      at `/support/impersonation`, and the next request on that token
      returns 401.
- [x] AC5 Verified live (curl + Playwright): console help form pre-filled
      with `pageUrl`, ticket created and visible to both the requester
      (`/help/tickets`) and support (`/support/tickets`, correct
      channel/tenant), confirmation email in Mailpit.
- [x] AC6 Verified live (Playwright + curl): public form with a real
      scanned code → ticket with `channel=public`, `tenantId` resolved,
      `relatedCode` redacted, confirmation email in Mailpit; the 6th
      submission from the same IP within the hour returned 429.
- [x] AC7 Verified live via the real CLI: email → ticket
      (`channel=email`); a canned-response reply produced a correctly
      `[#N]`-tagged outbound subject in Mailpit; an inbound reply matching
      that subject appended a `reply` note and reopened the ticket. Two
      real bugs found and fixed to get a clean run — see T6/T9 above.
- [x] AC8 Verified live — see `docs/runbooks/restore-from-backup.md`'s
      "Last drill" table for the actual run (two full backup→restore→verify
      cycles, ~11-32s each, correct verdict both times).
- [x] AC9 Verified live: site renders, search for "scratch" finds
      _Applying labels_, `/docs/api` reaches a live `/api/docs` (200) on
      the rebuilt API image, `pnpm docs:check-links` passes for all 8 live
      `HelpLink` usages. Not verified: a Lighthouse accessibility run
      (no Lighthouse CLI invocation performed this session).

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

`api` env additions (now actually wired into `docker/compose.yml`'s `api` service, not just the zod schema's defaults — `SUPPORT_IMPERSONATION_TTL_SECONDS` is overridable per the compose-override pattern used for AC4's drill): `SUPPORT_IMPERSONATION_TTL_SECONDS=1800`, `SUPPORT_INBOUND_ADDRESS=support@verifyng.local`, `SUPPORT_PUBLIC_FORM_RPH=5`, `DOCS_BASE_URL`/`NEXT_PUBLIC_DOCS_URL=http://localhost:3002`.

## Notes and decisions

- **Impersonation never grants `owner`.** Billing, member management and SSO config are owner-only by E02/E15/E20 and stay out of reach even in write mode; support fixes those via their own platform routes (E15 mark-paid, E02 CLI MFA reset), which are audited as support actions rather than tenant actions.
- **Tenants are told.** Read sessions notify the owner by default; the setting to silence it exists for tenants who ask, and turning it off is itself audited.
- **Tickets are deliberately simple.** No SLAs, no macros beyond canned responses, no attachments. When volume justifies a real helpdesk, `Ticket` becomes the sync target rather than being replaced.
- **`app/(support)/**`is E18's shell**; E15's`subscriptions/` route group lives inside it by agreement so the support nav has one owner.
- **Docs are public and unauthenticated.** Anything tenant-specific stays in the console; the docs site holds only what a competitor could read without harm — which is everything about how the system works, per mental-model §5 "honest limits".
- **Runbooks are tested by running them.** The restore drill is the one that must never be theoretical; it runs nightly in E21's schedule and its duration is recorded in the runbook.
- **Actual route is `apps/web-admin/app/(console)/support/**`, not `app/(support)/**`.** By the time E18 was claimed, E11/E19/E03 had already settled on one console route group with a `platform` nav section gated by `platformRole`, rather than the separate top-level `(support)` group this file originally specified — see `nav.config.ts`'s `platform.support` entry and E03's pre-existing `support/tenant-review/` page (kept as-is; added as one more tab in E18's own sub-nav). Followed the codebase's actual convention rather than this file's stale wording. Same reasoning for AC1: support lands on `/support`, not a bare `/tenants`.
- **Correction to an earlier note in this file (now fixed, not just flagged):** `pnpm --filter @verifynng/web-admin build` briefly failed on every Server Component route rendering `packages/ui`'s `EmptyState` ("Functions cannot be passed directly to Client Components from Server Components"). This file previously called it "a pre-existing, unrelated bug" reproduced against `origin/main` — that revert test was flawed, since it only reverted two web-admin source files and reused this session's already-built (already-broken) `packages/ui/dist`, so it never actually tested a clean `origin/main`. The real cause: `packages/ui/src/HelpLink.tsx` (added by this epic) lived directly under `src/`, outside the `src/components/**` glob that `tsup.config.ts`'s per-component entries rely on to isolate each `'use client'` file into its own output chunk (see that file's own long comment on why). Reachable only from `src/index.ts`, HelpLink's code got inlined into `dist/index.js` itself, and the existing `preserve-use-client` esbuild plugin — correctly, per its own logic — tagged that whole shared entry chunk `'use client'`, dragging every other export (`EmptyState`, `PageHeader`, ...) into client-only territory with it. Fixed by moving `HelpLink.tsx` to `src/components/HelpLink.tsx` so it gets its own entry/chunk like every other component; `pnpm --filter @verifynng/web-admin build` now statically generates all 46 routes including `/` and `/units`. `/impersonate` still redirects to `/batches` rather than `/` — not a workaround, just a more useful landing page than an unbuilt dashboard placeholder.
- **A real gap found while verifying T4 was fixed, not just noted**: write-mode impersonation could reach owner-only routes (RolesGuard's own `platformRole==='support'` bypass ignores `@Roles()` entirely once a session exists). `ImpersonationGuard` now also enforces the operator ceiling directly. See `impersonation.guard.spec.ts` and the `fix(E18)` commit.
- **Two more bugs found (and fixed) only by actually sending a reply and reading the resulting email, not by reading the code**: a canned-response reply rendered `{{requesterName}}` literally (never had a value to substitute) — fixed by resolving the requester's real `User.displayName` when the ticket has one, falling back to their email; and a support reply's outbound subject showed `[#N] [#N]` — the ticket-note handler and the template renderer were each independently appending the `[#N]` tag. Neither would have been caught by typecheck/lint/unit tests; both only showed up in Mailpit.
- **The CLI (`support:simulate-inbound`) originally bootstrapped the full `AppModule` in-process** to emit `mail.inbound` — broke immediately on first real run with `ERR_PACKAGE_PATH_NOT_EXPORTED` from `@react-pdf/hyphenate` (a transitive dependency of a completely unrelated module) under `tsx`'s strict ESM resolution. Fixed by having the CLI send the real SMTP message to Mailpit as before, then `POST` the same payload to a new dev-only endpoint (`v1/_dev/support/simulate-inbound`, same `NODE_ENV!=='production'` gating as the codebase's other `_dev` controllers) on the already-running API — the CLI no longer needs the full app graph at all. Also: the CLI never sourced `.env` itself (`@verifynng/config`'s `loadEnv()` only reads `process.env`, it doesn't load dotenv), so `SMTP_PORT` silently fell back to the schema default instead of this worktree's actual offset port — fixed by adding the same `dotenv.config()` calls every other script in this repo that touches `loadEnv()` already has.
- **A real bug found while chasing a flaky T14 Playwright run, not by reading the code**: `/help`'s Send button was only gated on `mutation.isPending`. On a hard navigation straight to `/help` (exactly what `HelpLink`'s plain `<a href>` does — it can't be a `next/link` since it also has to work from a page the user is about to leave), the in-memory auth store resets and `AuthBootstrap` repopulates it asynchronously; a fast click landing before that resolves posted `POST /v1/tenants/null/support/tickets` and 401'd. Fixed by also gating Send on `hasBootstrapped && activeTenantId`.
- **A second, unrelated bug surfaced once the first one was fixed**: with Send correctly gated, the test still failed intermittently — sometimes the click landed, sometimes the whole form silently lost its typed Subject/Body with no request ever firing. Root cause is in `apps/web-admin/app/(console)/legal/policy-reaccept-guard.tsx` (E19-owned, not touched here): it renders `<>{children}</>` (a bare Fragment) until its own async re-check resolves, then switches non-owner roles to `<div>{banner}{children}</div>` — a different element type at the same tree position, which forces React to unmount and remount everything below it, including `/help`'s local `subject`/`body` state, right as that check settles (which happens slightly _after_ `AuthBootstrap`, off the same auth state). This isn't E18-owned and wasn't touched; `support-tickets.spec.ts` instead waits for the guard's banner text to be visible before filling the form, so the fill happens after the remount rather than racing it. Confirmed stable across 8 consecutive runs after the fix (was failing ~2/3 of the time before it, non-deterministically, purely from click-vs-remount timing). Worth flagging to whoever owns E19: any other console page holding local, unsaved state (a draft, a dialog's open state) for an `operator`/`viewer` under a tenant with a pending policy re-acceptance will silently lose that state the same way, on every fresh page load.
