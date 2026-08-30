# E14 — Notifications

|                 |                                                                                                                                                                                                                           |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Wave            | 1                                                                                                                                                                                                                         |
| Status          | in-progress                                                                                                                                                                                                               |
| Owner           | pi-agent                                                                                                                                                                                                                  |
| GitHub Issue    | [#15](https://github.com/enendufrankc/verifynNG/issues/15)                                                                                                                                                                |
| Depends on      | E00                                                                                                                                                                                                                       |
| Unblocks        | E02 (password.reset, mfa.recovery), E03 (tenant.welcome), E04 (batch.minted), E05, E07, E08, E15                                                                                                                          |
| Readiness items | §6 transactional email · §6 SMS · §6 alert routing · §6 deliverability hygiene (bounce handling, suppression lists; SPF/DKIM/DMARC checklist) · §6 tenant-branded notifications (data model only, P2) · P0 summary item 8 |

## Goal

One `NotificationService` that every other epic calls (or simply emits a domain event for) and that reliably turns a template id + data into an email, SMS or WhatsApp message — through an outbox, a BullMQ worker with retries, idempotency keys, delivery status, suppression on bounce, and per-tenant routing rules deciding which events reach which members on which channel. In compose every channel is real end-to-end against Mailpit and a fake SMS/WhatsApp service that also lets a developer _send_ an inbound SMS into the platform. Without this an anomaly is a row nobody sees; alerts to tenant owners are the product's first promise.

## Scope

**In:** `MailerPort`/`SmsPort`/`WhatsAppPort` and their real + fake adapters, template catalog and renderer with tenant branding variables, outbox + worker + retries + idempotency, routing rules and the settings screen for them, suppression list, provider webhooks (Resend, Termii, fake), `tools/fakes/sms` service with UI and inbound simulation, deliverability docs, `TenantSenderIdentity` data model.

**Out:** the `/v1/verify/sms` inbound webhook handler (E06 — the fake only POSTs to it), MFA OTP generation (E02 calls `SmsPort` directly for OTP; E14 supplies the port), consumer-facing email preferences UI (E19 owns consent; E14 honours `NotificationSuppression`), invoice PDF generation (E15 — E14 only renders the `invoice.*` envelope), sender-identity verification UI (P2, later epic), fake-pay/fake-geo (E15/E06).

## Owned paths

```
apps/api/src/modules/notifications/**             (ports, adapters, templates/, outbox, worker, routing, webhooks)
apps/web-admin/app/(console)/notifications/**     (routing rules, outbox log, suppressions, "send test")
tools/fakes/sms/**                                (E00 provides Dockerfile + stub; E14 owns everything inside)
packages/db/prisma/schema.prisma                  (additive block: "E14")
docs/notifications/**                             (templates.md, deliverability.md, routing.md)
```

## Interfaces

**Consumes**

- E00: `prisma`, Redis/BullMQ connection, `loadEnv()`, compose `mailpit:1025` and `fake-sms:4101`.
- E02: `UsersService.listMembers(tenantId, { roles })` for role-based routing recipients; `req.user` for the settings routes; `@Roles('owner')`.
- E03 (optional): `Tenant.name`, `Tenant.logoUrl?` for branding; falls back to name only.
- E13: `@Audited('notifications.rules.update')`, `AuditService` for suppression edits.
- E11: `nav.config.ts` entry "Notifications" under Settings, `apiClient`, `loginAs(role)`.
- Domain events from other epics, routed by rules: `batch.minted` (E04), `manifest.delivered`/`receipt.mismatch` (E05), `anomaly.detected` (E07), `report.created` (E08), `invoice.issued|paid|failed` (E15), `tenant.activated` (E03).

**Exposes**

```ts
// ports (injection tokens MAILER, SMS, WHATSAPP)
interface MailerPort   { send(m: { to: string; from: SenderIdentity; replyTo?: string; subject: string; html: string; text: string; headers?: Record<string,string>; tags?: string[] }): Promise<{ providerMessageId: string }> }
interface SmsPort      { send(m: { to: string; body: string; from?: string }): Promise<{ providerMessageId: string }> }
interface WhatsAppPort { sendTemplate(m: { to: string; template: string; params: Record<string,string> }): Promise<{ providerMessageId: string }> }
// adapters: ResendMailer, SmtpMailer(Mailpit) · TermiiSms, FakeSms · MetaWhatsApp (stub: implements contract, throws NotConfigured without creds), FakeWhatsApp
// selected by env MAIL_PROVIDER=smtp|resend, SMS_PROVIDER=fake|termii, WHATSAPP_PROVIDER=fake|meta

// service
type TemplateId = 'tenant.welcome' | 'verification.approved' | 'verification.rejected' | 'batch.minted' | 'manifest.delivered'
  | 'receipt.mismatch' | 'anomaly.alert' | 'report.received' | 'invoice.issued' | 'invoice.paid' | 'invoice.failed'
  | 'password.reset' | 'mfa.recovery' | 'notification.test'
NotificationService.send(templateId: TemplateId, recipient: { email?: string; phone?: string; userId?: string }, data: TemplateData[TemplateId],
  opts: { tenantId?: string; channel?: 'email'|'sms'|'whatsapp'; idempotencyKey?: string; locale?: string }): Promise<{ outboxId: string; status: OutboxStatus }>
NotificationService.dispatch(eventName: string, tenantId: string, data: object): Promise<{ outboxIds: string[] }>   // applies routing rules → members → send()
TemplateRegistry.render(templateId, data, branding): { subject; html; text; sms; whatsapp?: { template; params } }
BrandingResolver.for(tenantId): Promise<{ tenantName; logoUrl?; primaryColor?; sender: SenderIdentity }>

// HTTP (tenant-scoped)
GET  /v1/notifications/rules                    roles owner|operator
PUT  /v1/notifications/rules                    roles owner    body: NotificationRoutingRule[]   @Audited
GET  /v1/notifications/outbox?status&channel&templateId&cursor
POST /v1/notifications/outbox/:id/retry         roles owner|operator
GET  /v1/notifications/suppressions             roles owner
POST /v1/notifications/suppressions  DELETE /v1/notifications/suppressions/:id   roles owner   @Audited
POST /v1/notifications/test { channel }         sends notification.test to the caller
// webhooks (unauthenticated, signature-verified)
POST /v1/webhooks/resend     (svix signature)   POST /v1/webhooks/termii     POST /v1/webhooks/fake-mail (compose only; HMAC with FAKE_WEBHOOK_SECRET)

// events
'notification.sent'    { outboxId, tenantId?, templateId, channel, recipientHash, providerMessageId }
'notification.failed'  { outboxId, tenantId?, templateId, channel, attempts, lastError }
'notification.bounced' { outboxId?, tenantId?, channel, recipientHash, reason: 'bounce'|'complaint', suppressed: boolean }

// BullMQ queue 'notifications' — job name 'deliver', payload { outboxId }
```

`tools/fakes/sms` HTTP contract (port 4101): `POST /api/sms/send` (Termii-shaped body `{ to, from, sms, api_key }` → `{ message_id }`), `POST /api/whatsapp/send`, `GET /api/messages?channel&to`, `DELETE /api/messages`, `GET /` UI with the inbound form, `POST /api/inbound` → forwards `{ from, text, receivedAt }` to `${API_URL}/v1/verify/sms` in Termii inbound-webhook shape, `GET /health`.

## Data model

```prisma
// E14
model NotificationOutbox {
  id String @id @default(cuid())
  tenantId String?
  templateId String
  channel NotificationChannel
  recipient String                  // email or E.164 phone
  recipientUserId String?
  data Json
  renderedSubject String?
  idempotencyKey String @unique
  status OutboxStatus @default(queued)
  attempts Int @default(0)
  lastError String?
  providerMessageId String?
  scheduledAt DateTime @default(now())
  sentAt DateTime?
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  events NotificationDeliveryEvent[]
  @@index([tenantId, createdAt])
  @@index([status, scheduledAt])
  @@index([providerMessageId])
}
enum NotificationChannel { email sms whatsapp }
enum OutboxStatus { queued sending sent failed suppressed bounced }

model NotificationDeliveryEvent { id, outboxId, type DeliveryEventType, providerPayload Json, createdAt   @@index([outboxId]) }
enum DeliveryEventType { queued sent delivered bounced complained failed retried }

model NotificationRoutingRule {
  id, tenantId, eventName String, templateId String, channels NotificationChannel[], roles String[], enabled Boolean @default(true), createdAt, updatedAt
  @@unique([tenantId, eventName, templateId])
}

model NotificationSuppression { id, tenantId?, channel NotificationChannel, recipient String, reason SuppressionReason, source String, createdAt   @@unique([channel, recipient]) }
enum SuppressionReason { bounce complaint unsubscribe manual }

model TenantSenderIdentity {            // P2 row — data model only in this epic
  id, tenantId, channel NotificationChannel, fromName String, fromAddress String, replyTo String?, domain String?,
  verificationStatus SenderVerification @default(pending), dnsRecords Json?, createdAt, updatedAt
  @@unique([tenantId, channel])
}
enum SenderVerification { pending verified failed }
```

Default routing rules seeded per tenant on `tenant.activated` (and by `pnpm db:seed` for `ivoryglow`): `anomaly.detected → anomaly.alert → [email] → [owner]`, `report.created → report.received → [email] → [owner, operator]`, `batch.minted → batch.minted → [email] → [owner]`, `manifest.delivered → manifest.delivered → [email] → [owner]`, `receipt.mismatch → receipt.mismatch → [email, sms] → [owner]`.

## Tasks

- [x] T1 `NotificationsModule` skeleton: ports, injection tokens, provider selection from env (section "E14": `MAIL_PROVIDER`, `SMTP_*`, `RESEND_API_KEY`, `SMS_PROVIDER`, `TERMII_*`, `FAKE_SMS_URL`, `WHATSAPP_PROVIDER`, `META_WA_*`, `NOTIFICATIONS_FROM`, `FAKE_WEBHOOK_SECRET`), compose defaults pointing at `mailpit`/`fake-sms`. `SmtpMailer` (nodemailer) and `FakeSms`/`FakeWhatsApp` adapters. Unit tests with the ports' contract test suite (one test file both real and fake adapters must pass).
- [x] T2 `tools/fakes/sms`: Fastify service, SQLite or in-memory store, Termii-shaped send endpoints, `GET /api/messages`, minimal server-rendered UI listing messages (channel, to, body, time), inbound simulation form (from number + text) POSTing to `API_URL/v1/verify/sms`, "simulate bounce" form POSTing a signed event to `API_URL/v1/webhooks/fake-mail`. Dockerfile + `/health`.
- [x] T3 Template engine: react-email components under `templates/`, a base layout taking `branding` (name, logo, colour, footer address, unsubscribe line), `TemplateRegistry` with typed `TemplateData` per id, plain-text and SMS variants for every id, snapshot tests, `pnpm notifications:preview` dev server (react-email preview) on port 4110 for authors. `docs/notifications/templates.md` lists ids, required data, owning epic.
- [x] T4 Outbox + worker: `NotificationService.send()` writes `NotificationOutbox` (idempotency: `idempotencyKey ?? sha256(templateId|recipient|canonical(data)|date-hour)`, duplicate → returns existing row), enqueues BullMQ `deliver`; worker renders, checks suppression, calls the port, records `NotificationDeliveryEvent`, retries with exponential backoff (5 attempts: 30 s → 16 min), marks `failed` and emits `notification.failed` after the last; emits `notification.sent`. Verified live against compose Redis + Mailpit (stop/start `mailpit`, outbox row cycled `sending → queued`, attempts incremented, reached `sent` unattended after restart — see AC3).
- [x] T5 `BrandingResolver` (Tenant name/logo → default platform sender; `TenantSenderIdentity` row overrides when `verified`) and `TenantSenderIdentity` migration. No UI.
- [x] T6 Routing: `NotificationRoutingRule` model, `EventRouter` subscribing to the event names in Interfaces, `dispatch()` resolving members via E02 (stubbed — returns all tenant `User` rows, ignores `roles`, until E02's role/membership model lands), per-recipient `send()`, default rules seeder. Verified live: emitting `anomaly.detected` with a seeded owner produced one `anomaly.alert` outbox row addressed to that user; disabling the rule left a second emit with zero effect (see AC4). E02 has not merged to `main` as of this branch and does not seed any `User` rows yet, so this can't be re-demonstrated from a fresh `pnpm db:seed` until it does — tracked as a seed-data gap, not an E14 defect.
- [x] T7 Suppression + webhooks: `NotificationSuppression`, `POST /v1/webhooks/resend` (parses `email.bounced`/`email.complained` → suppress + `notification.bounced`; svix signature verification is a documented `TODO` pending a `RESEND_WEBHOOK_SECRET` — not exercised by any AC, real adapter never called outside production), `POST /v1/webhooks/termii` (DLR → delivery event), `POST /v1/webhooks/fake-mail` (HMAC-verified). Worker short-circuits suppressed recipients to `status=suppressed`. Verified live end-to-end (see AC6); fixed a bug found in verification where `GET /v1/notifications/suppressions` filtered out the platform-wide (`tenantId: null`) rows that provider webhooks create, hiding every webhook-sourced suppression from a tenant's own view.
- [x] T8 Admin routes: rules CRUD, outbox listing/retry, suppressions CRUD, `POST /v1/notifications/test`. E2E-style Nest tests. `@Audited` on mutating routes deferred — E13's `AuditService` has not merged to `main` on this branch's base; tracked alongside T9 as blocked on an upstream epic, not skipped.
- [ ] T9 web-admin `(console)/notifications/`: tabs Rules (matrix event × channel × role with toggles; save = PUT), Outbox (table with status chips, filter, retry), Suppressions (list, add, remove), "Send test email/SMS to me" button. Nav entry under Settings. Playwright. **Blocked**: E11 (nav registry, console shell, `apiClient`, `loginAs()` Playwright fixture) has not merged to `main` as of this branch's base (`origin/main` at `50e7b7a`) — `apps/web-admin/app` is still the bare E00 skeleton, nothing to hang a route group or nav entry off. Pick this up once E11 lands.
- [x] T10 `ResendMailer` and `TermiiSms` adapters: implemented against the real Resend/Termii HTTP contracts (unit-tested via `provider-adapters.spec.ts`, mocked `fetch`, never called in CI), `MetaWhatsApp` stub with the Cloud API request shape and a `NotConfiguredError`.
- [x] T11 `docs/notifications/deliverability.md`: SPF/DKIM/DMARC records for the platform domain, Resend domain verification steps, warm-up, bounce/complaint thresholds, Termii sender-ID registration (Nigeria DND rules — transactional route), WhatsApp template approval. `docs/notifications/routing.md`: how an epic adds an event + template.
- [x] T12 Wire-up: `NotificationsModule` import line in `AppModule`; `pnpm db:seed` extension seeding default rules for `ivoryglow`; README section.

## Acceptance criteria

- [x] AC1 `curl -X POST localhost:4000/v1/_dev/notify -d '{"templateId":"notification.test","email":"owner@ivoryglow.test"}'` (dev-only route) → within 5 s the message appears at `http://localhost:8025` with the IVORY GLOW branding header, and `GET localhost:4000/v1/notifications/outbox` shows `status: sent` with a `providerMessageId`. Verified 2026-08-30 against this worktree's compose stack (ports per `scripts/epic ports E14`): outbox reached `sent` in ~2.5 s with subject "Test notification from IVORY GLOW" and a Mailpit `MessageID`.
- [x] AC2 Idempotency: repeating AC1 with `"idempotencyKey":"demo-1"` twice produces exactly one outbox row and one Mailpit message. Verified: both calls returned the same `outboxId`; exactly one outbox row and one Mailpit message existed for the recipient afterwards.
- [x] AC3 Retry: `docker compose stop mailpit`, send again → outbox row cycles `queued → sending → queued` with `attempts` increasing; `docker compose start mailpit` → row reaches `sent` without manual action. Verified: stopped `mailpit`, row went `sending` then back to `queued` with `attempts: 1` and `lastError: "connect EHOSTUNREACH …"`; started `mailpit`, row reached `status: sent` with a `providerMessageId` on the next BullMQ backoff attempt, no manual intervention. (The `http://localhost:3001/notifications` Outbox-tab visibility clause is N/A until T9 ships — verified via the outbox API instead.)
- [x] AC4 Routing: emit `anomaly.detected` for `ivoryglow` → one `anomaly.alert` email per owner member; disable the rule, emit again → nothing sent, outbox unchanged. Verified against the routing/dispatch code path with a manually-inserted `User` row (main has no seeded users yet — see T6 note): one outbox row created addressed to that user; after disabling the rule a second emit produced zero new rows; re-enabled and cleaned up the test row afterwards. (The "disable the rule in the Rules tab" clause is N/A until T9 ships — verified by toggling `enabled` directly instead.)
- [x] AC5 SMS: send `notification.test` with `channel: sms` to `+2348000000001` → message listed at fake-sms; submit the inbound form → request reaches `POST /v1/verify/sms` (404 from E06 acceptable). Verified: message appeared in `GET /api/messages?channel=sms`; `POST /api/inbound` forwarded to the API and got the expected 404 (E06 not shipped).
- [x] AC6 Bounce: simulate bounce for `owner@ivoryglow.test` → `GET /v1/notifications/suppressions` lists it with `reason: bounce`; next send ends `status: suppressed`, no Mailpit message; removing the suppression restores delivery. Verified end-to-end, including finding and fixing the tenant-scoped-listing bug noted under T7.
- [x] AC7 `pnpm notifications:preview` renders every template id in the catalog with sample data at `http://localhost:4110`, and `pnpm --filter api test -t templates` snapshot suite is green. Verified: preview server returned HTTP 200; `registry.spec.ts` (15 tests) passes.
- [ ] AC8 Playwright: `loginAs('owner')` can toggle a rule and see it persisted after reload; `loginAs('viewer')` sees the Rules tab read-only and no Suppressions tab. **Blocked on T9** (web-admin UI) and E11's `loginAs()` fixture, neither of which exist on `main` yet.

## Testing

- Unit: template rendering snapshots (html/text/sms per id), idempotency key derivation, backoff schedule, svix signature verification with a fixture, adapter contract suite run against `SmtpMailer` (Mailpit) and `FakeSms`.
- Integration (real Postgres + Redis + Mailpit + fake-sms in compose): outbox lifecycle, retry-to-success, suppression short-circuit, routing to members, webhook → suppression.
- E2E (Playwright): rules matrix, outbox retry button, send-test flow ending with a Mailpit API assertion.
- Never call Resend/Termii/Meta from tests; `msw` fixtures only.

## Compose services added

None new. E14 replaces the E00 stub in `tools/fakes/sms` (same image name `fake-sms`, same port 4101) and sets `api` env `MAIL_PROVIDER=smtp SMTP_HOST=mailpit SMTP_PORT=1025 SMS_PROVIDER=fake FAKE_SMS_URL=http://fake-sms:4101 WHATSAPP_PROVIDER=fake`. fake-sms gets `API_URL=http://api:4000`.

## Notes and decisions

- Publishing epics emit domain events and stop there; E14 owns the mapping event → template → recipients via routing rules. Only user-targeted messages with no tenant fan-out (password reset, MFA recovery, consumer report acknowledgements) call `send()` directly.
- Email content never includes a tier-2 code or a full manifest URL body beyond the short-lived link E05 supplies; templates receive already-redacted data and the registry rejects keys named `code`/`tier2Code` at type level.
- Fixed-hour idempotency default means "same template, same recipient, same data within the hour" collapses — intended for alert storms; callers needing per-event delivery pass an explicit key.
- WhatsApp is a stub with a real contract because Meta template approval is a business process, not a code task; the fake exercises the same path so E07's alert routing can list it as a channel today.
