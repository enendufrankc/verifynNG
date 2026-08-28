# E18 — Support Tooling

| | |
|---|---|
| Wave | 3 |
| Status | todo |
| Owner | — |
| GitHub Issue | [#19](https://github.com/enendufrankc/verifynNG/issues/19) |
| Depends on | E02 (roles incl. platform `support`, sessions), E13 (`@Audited`, audit viewer), E11 (admin shell, route groups), E14 (`MailerPort`, inbound simulation), E08 (captcha port), E15 (plan/usage for tenant directory), E12 (`GET /tenants/:id/usage`), E09 (web-verify for public `/support` form) |
| Unblocks | E17 (runbook link target for "verify API down"), E21 (support fixtures) |
| Readiness items | `production-readiness.md` §9 all rows (support intake, audited admin impersonation, runbooks, public docs/FAQ, self-service) · §2 audit log (consumed) |

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
TenantDirectoryService   // list({ q, status, planCode, cursor }) joins Tenant + Subscription + UsageSummary + last AuditLog
ImpersonationService     // start(supportUserId, tenantId, { mode:'read'|'write', reason? }) → { sessionToken, expiresAt }; end(sessionId); active(supportUserId)
ImpersonationGuard       // on every tenant route: if session.impersonation present → deny mutations unless mode='write'; extend AuditContext
TicketService            // createFromConsole, createFromPublicForm, createFromInboundMail, list, get, assign, setStatus, setPriority, addNote(internal|reply)
CannedResponseService    // CRUD, render(templateId, vars)
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

- [ ] T1 `SupportModule` scaffold + schema block + migration `E18_support`; `app/(support)/layout.tsx` shell with support nav (`Tenants`, `Tickets`, `Subscriptions` (E15), `Audit` (link to E13 viewer)), access restricted to `platformRole = support` (redirect others to `/`). E11's `loginAs('support')` used in a smoke test.
- [ ] T2 Tenant directory: `TenantDirectoryService` + `GET /v1/platform/tenants[/:id]`; `app/(support)/tenants/**` table (name, slug, status badge, plan, units this year vs included, scans last 30d, last activity, owner email), search + filters, detail drawer with quick actions (**View as tenant**, **Open tickets**, link to E15 subscription, link to audit filtered by tenant).
- [ ] T3 Impersonation (read): `ImpersonationService.start(mode='read')` creates an E02 session with claims `{ sub: supportUserId, tenantId, role:'viewer', impersonation:{ sessionId, mode:'read' } }` expiring in 30 min; `ImpersonationGuard` (global, after E02's auth) rejects non-GET with 403 `impersonation_read_only`; `AuditContext` populated with `impersonatedBy` + `impersonationSessionId`; `impersonation.started` event + E14 email to the tenant owner ("Platform support viewed your account") — configurable off per tenant in E03 settings (`notifyOnImpersonation`, default on).
- [ ] T4 Impersonation (write + UX): `mode='write'` requires `reason` (≥ 20 chars), grants role `operator` (never `owner` — billing and member management stay off-limits), same 30-minute expiry; web-admin persistent top banner "Viewing <tenant> as support · read-only | WRITE MODE · expires in 12:34 · [End session]" rendered by E11's `Banner` slot; `DELETE …/impersonation/:id`; BullMQ `impersonation.expire` job revokes the E02 session at `expiresAt` and emits `impersonation.ended(endedBy='expiry')`; `app/(support)/impersonation/**` history page (who, which tenant, mode, reason, duration).
- [ ] T5 `docs/support-impersonation-policy.md`: when read vs write is allowed, reason standards, retention, what tenants see; linked from the start dialog.
- [ ] T6 Tickets core: `TicketService`, models, `GET/PATCH /v1/platform/tickets`, notes (internal vs reply), assignment, status machine (`open → in_progress → pending_customer → resolved → closed`, reopen on inbound mail), `ticket.created/status_changed` events, `@Audited` on mutations.
- [ ] T7 Intake — console: `app/(console)/help/**` "Get help" page + `HelpLink` component (`packages/ui`) that every module drops into its page header with `{ docSlug, module }`; the help form pre-fills `pageUrl` and module, `POST /v1/tenants/:id/support/tickets`, tenant users see their own tickets and replies at `/help/tickets`.
- [ ] T8 Intake — public: `apps/web-verify/app/support/page.tsx` consumer form (email, subject, message, optional scanned code which is redacted server-side with E01 `redactCode`), E08 `CaptchaPort`, per-IP limit via E13 `QuotaService` (5/hour), `POST /v1/public/support` → `Ticket(channel=public, tenantId=null)` unless the code resolves to a tenant (then `tenantId` set for routing); confirmation email to requester via E14.
- [ ] T9 Intake — email: subscribe to E14 `mail.inbound`; `support@` address creates a ticket; replies matched by `In-Reply-To` / `[#1042]` in subject append a `TicketNote(kind=reply, authorId=null)` and reopen if resolved; attachments ignored in v1 (noted). Compose demo: `pnpm --filter api cli support:simulate-inbound --from x@y.com --subject "…"` pushes through Mailpit's SMTP so the real E14 path is exercised.
- [ ] T10 Support ticket UI: `app/(support)/tickets/**` list (status/priority/assignee/tenant filters, unassigned first), detail (thread of notes + emails, requester + tenant card with **View as tenant**, status/priority/assignee controls, reply composer with canned-response picker and variable preview, internal note toggle); `canned-responses/` CRUD with the seeded set (welcome, label-application, payment-failed, code-not-found, escalation).
- [ ] T11 Runbooks `docs/runbooks/`: `README.md` (index, severity ladder, who to page), `onboarding-failure.md`, `auth-lockout.md` (MFA reset via E02 CLI, SSO break-glass via E20), `payment-failure.md` (E15 dunning, mark-paid, Paystack dashboard), `cross-tenant-alert.md` (E21 isolation failure or E13 alert → freeze, investigate, notify per E19), `restore-from-backup.md` (scripted: `docker/scripts/backup.sh` → `pg_dump` to MinIO bucket `backups/`, `restore.sh` into a fresh compose Postgres, verify a known code), `verify-api-down.md` (E17 dashboards, health, rollback, status page). Each runbook: trigger, first 5 minutes, diagnosis, remediation, verification, post-incident.
- [ ] T12 `apps/docs` (Next.js 15 + Fumadocs, MDX, port 3002): sections *How codes work* (two tiers, what consumers see, honest limits — from mental-model §4/§5), *Applying labels* (tier-1 on pack, tier-2 scratch-off/under-cap, artwork specs, sample images from IVORY GLOW), *Printer & label specs* (QR module size, quiet zone, error correction, min DPI, material recommendations, test print checklist), *Console guides* (one page per module, slugs `/docs/console/<module>` that `HelpLink` targets), *API* (`/docs/api` → Scalar link + SDK quick start), *FAQ*, *Support* (link to public form). Search (Fumadocs built-in), sitemap, Dockerfile, compose service.
- [ ] T13 Help links everywhere: add `<HelpLink docSlug="…">` to each module's page header (batches, units, scans, anomalies, reports, billing, api-keys, webhooks, team, settings) — coordinated PRs into each owning epic's path, one line each, with those owners' sign-off on their issues; CI check `pnpm docs:check-links` asserts every `docSlug` used exists in `apps/docs/content`.
- [ ] T14 Playwright: support flows (directory → impersonate read → blocked write → elevate → write → end), ticket lifecycle across all three channels, docs site smoke + link check.

## Acceptance criteria

- [ ] AC1 `docker compose up`; log in at `http://localhost:3001` as `support@verifyng.local` (E21 seed) → redirected to `/tenants`, directory lists `ivoryglow`, `acme`, `nkem-naturals` with status, plan (from E15) and units/scans (from E12). Logging in as an `ivoryglow` owner and visiting `/tenants` → redirected to the tenant console.
- [ ] AC2 Read-only impersonation: click **View as tenant** on `ivoryglow` → new tab shows the tenant console with the top banner *Viewing IVORY GLOW as support · read-only · expires in 30:00*; batches list loads; clicking **Mint batch** → toast "Read-only impersonation" and `POST /v1/tenants/ivoryglow/batches` returns 403 `impersonation_read_only`. Mailpit shows "Platform support viewed your account" to the owner.
- [ ] AC3 Elevated write: **Elevate** in the banner → reason dialog rejects 10 characters, accepts "Reproducing ticket #1042: mint fails with 500 for product X" → minting a 5-unit batch succeeds; `http://localhost:3001/audit` (E13) shows the `batch.minted` row with `impersonatedBy = support@verifyng.local` and the reason in the impersonation record at `/impersonation`.
- [ ] AC4 Expiry: with `SUPPORT_IMPERSONATION_TTL_SECONDS=60` in compose override, wait 60s → next request returns 401, banner flips to "Session expired", `impersonation.ended` with `endedBy = expiry` appears in `/impersonation`.
- [ ] AC5 Console intake: as `ivoryglow` operator on `/batches`, click the **?** help link → opens `http://localhost:3002/docs/console/batches`; click **Get help** → form pre-filled with page URL, submit → ticket `#N` visible to support at `/tickets` with channel `console`, tenant `ivoryglow`, and to the operator at `/help/tickets`.
- [ ] AC6 Public intake: at `http://localhost:3000/support` submit with code `ivoryglow.2.k1.XXXX…` and a valid fake captcha → ticket created with `channel = public`, `tenantId = ivoryglow`, `relatedCode` redacted (`ivoryglow.2.k1.XXXX…`), confirmation email in Mailpit; 6th submission from the same IP within an hour → 429.
- [ ] AC7 Email intake + reply: `pnpm --filter api cli support:simulate-inbound --from dealer@example.com --subject "Codes not scanning"` → ticket `channel = email`; support replies using canned response *label-application* → Mailpit shows the outbound email with `[#N]` in subject; simulate an inbound reply with that subject → appears as a `reply` note on the same ticket and status returns to `open`.
- [ ] AC8 Runbook restore drill: follow `docs/runbooks/restore-from-backup.md` verbatim: `docker/scripts/backup.sh` writes `backups/<ts>.dump` into MinIO (`http://localhost:9001`); `docker/scripts/restore.sh <ts>` into the `postgres-restore` throwaway container; `curl localhost:4000/v1/verify/<seeded code>` against the restored DB returns the same verdict as before. Time from start to verified restore is recorded in the runbook's last-drill table.
- [ ] AC9 Docs site: `http://localhost:3002` renders; search for "scratch" finds *Applying labels*; `/docs/api` links to `http://localhost:4000/api/docs`; `pnpm docs:check-links` passes with every `HelpLink` slug resolving; Lighthouse accessibility ≥ 95 on the home page.

## Testing

- Unit: impersonation claims builder (never grants `owner`), reason validation, TTL math, ticket status machine (legal/illegal transitions, reopen-on-inbound), inbound-email threading (`In-Reply-To`, subject `[#N]`, neither → new ticket), canned-response variable rendering, code redaction on public tickets.
- Integration (Postgres + Redis): `ImpersonationGuard` blocks every non-GET tenant route in read mode (auto-discovered via Nest reflection, shared with E21's matrix); audit rows carry `impersonatedBy` during impersonated requests and are null otherwise; expiry job revokes the E02 session; `TenantDirectoryService` never leaks across tenants when called with a tenant JWT (must 403); public form rate limit.
- E2E (Playwright): AC2–AC7 flows using `loginAs('support')`, `loginAs('owner')`, `loginAs('operator')`; docs site smoke; visual snapshot of the impersonation banner in both modes.
- Docs: link checker for `apps/docs` and for every runbook's internal links; runbooks reviewed by running the restore drill in CI nightly (E21 schedules; E18 owns the scripts).

## Compose services added

| Service | Image | Host port | Notes |
|---|---|---|---|
| docs | apps/docs | 3002 | static export served by `next start`; no DB |
| postgres-restore | postgres:16-alpine | 5433 | `profiles: [drill]` — only started by `restore.sh` |

`api` env additions: `SUPPORT_IMPERSONATION_TTL_SECONDS=1800`, `SUPPORT_INBOUND_ADDRESS=support@verifyng.local`, `SUPPORT_PUBLIC_FORM_RPH=5`, `DOCS_BASE_URL=http://localhost:3002`.

## Notes and decisions

- **Impersonation never grants `owner`.** Billing, member management and SSO config are owner-only by E02/E15/E20 and stay out of reach even in write mode; support fixes those via their own platform routes (E15 mark-paid, E02 CLI MFA reset), which are audited as support actions rather than tenant actions.
- **Tenants are told.** Read sessions notify the owner by default; the setting to silence it exists for tenants who ask, and turning it off is itself audited.
- **Tickets are deliberately simple.** No SLAs, no macros beyond canned responses, no attachments. When volume justifies a real helpdesk, `Ticket` becomes the sync target rather than being replaced.
- **`app/(support)/**` is E18's shell**; E15's `subscriptions/` route group lives inside it by agreement so the support nav has one owner.
- **Docs are public and unauthenticated.** Anything tenant-specific stays in the console; the docs site holds only what a competitor could read without harm — which is everything about how the system works, per mental-model §5 "honest limits".
- **Runbooks are tested by running them.** The restore drill is the one that must never be theoretical; it runs nightly in E21's schedule and its duration is recorded in the runbook.
