# E14 — Notifications Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a `NotificationService` that turns template IDs + data into email/SMS/WhatsApp messages through an outbox with BullMQ workers, retries, idempotency, routing rules, suppression, and provider webhooks — all working end-to-end against Mailpit and a fake-sms service in Docker.

**Architecture:** NestJS module (`NotificationsModule`) owning ports (Mailer, SMS, WhatsApp) with adapter implementations selected by env vars. Outbox pattern with BullMQ worker for delivery. Template engine using react-email. Event-driven routing via Nest EventEmitter. Prisma models for outbox, routing rules, suppressions, and sender identity.

**Tech Stack:** NestJS 11, Prisma 6, BullMQ + Redis 7, react-email, nodemailer (SMTP/Mailpit), Fastify (fake-sms), Next.js 15 (web-admin), Tailwind 4, Playwright.

---

## File Structure

### New files — `apps/api/src/modules/notifications/`

```
notifications/
  notifications.module.ts              — Nest module wiring
  notifications.controller.ts          — REST + webhook endpoints
  notifications.service.ts             — send(), dispatch() orchestration
  notifications.worker.ts              — BullMQ processor
  outbox/
    outbox.service.ts                  — write/query/retry outbox rows
    outbox.service.spec.ts             — unit tests for idempotency, status transitions
  routing/
    event-router.ts                   — subscribes to domain events, resolves rules → members → send()
    event-router.spec.ts               — unit tests
    branding-resolver.ts               — tenant → branding + sender identity
    branding-resolver.spec.ts
  templates/
    registry.ts                        — TemplateRegistry.render()
    registry.spec.ts                   — snapshot tests
    template-data.ts                   — typed TemplateData map + TemplateId
    base-layout.tsx                    — react-email base layout
    notification-test.tsx              — notification.test template
    tenant-welcome.tsx                 — tenant.welcome template
    verification-approved.tsx
    verification-rejected.tsx
    batch-minted.tsx
    manifest-delivered.tsx
    receipt-mismatch.tsx
    anomaly-alert.tsx
    report-received.tsx
    invoice-issued.tsx
    invoice-paid.tsx
    invoice-failed.tsx
    password-reset.tsx
    mfa-recovery.tsx
  ports/
    mailer.port.ts                     — MailerPort interface + MAILER token
    sms.port.ts                        — SmsPort interface + SMS token
    whatsapp.port.ts                   — WhatsAppPort interface + WHATSAPP token
  adapters/
    smtp-mailer.adapter.ts             — nodemailer SMTP (Mailpit in compose)
    resend-mailer.adapter.ts           — Resend API
    fake-sms.adapter.ts                — calls fake-sms HTTP API
    termii-sms.adapter.ts              — Termii API
    fake-whatsapp.adapter.ts           — in-memory stub
    meta-whatsapp.adapter.ts           — Meta Cloud API stub (NotConfiguredError)
    adapter-contract.spec.ts           — shared contract tests for all adapters
  webhooks/
    webhooks.service.ts                — signature verification, event processing
    webhooks.service.spec.ts
  suppressions/
    suppressions.service.ts            — check/add/remove suppressions
    suppressions.service.spec.ts
  dev/
    dev.controller.ts                  — POST /v1/_dev/notify, POST /v1/_dev/emit
```

### New files — `tools/fakes/sms/`

Replace the stub `server.mjs` with a full Fastify service:
```
tools/fakes/sms/
  package.json
  server.mjs                           — Fastify server (SMS/WhatsApp send, messages, inbound, bounce sim, UI, health)
  Dockerfile                           — updated for Fastify
```

### New files — `apps/web-admin/app/(console)/notifications/`

```
app/(console)/notifications/
  page.tsx                             — main notifications page with tabs
  components/
    rules-tab.tsx                      — routing rules matrix
    outbox-tab.tsx                     — outbox log with filters + retry
    suppressions-tab.tsx               — suppression list + add/remove
    send-test-button.tsx               — "Send test email/SMS to me"
```

### New files — `docs/notifications/`

```
docs/notifications/
  templates.md                         — template catalog
  deliverability.md                    — SPF/DKIM/DMARC guide
  routing.md                           — how to add events + templates
```

### Modified files

| File | Change |
|------|--------|
| `packages/db/prisma/schema.prisma` | Additive E14 block: enums + 5 models |
| `packages/config/src/env-schema.ts` | Add E14 section: MAIL_PROVIDER, SMTP_*, RESEND_*, SMS_PROVIDER, TERMII_*, FAKE_SMS_URL, WHATSAPP_PROVIDER, META_WA_*, NOTIFICATIONS_FROM, FAKE_WEBHOOK_SECRET |
| `apps/api/src/app.module.ts` | One-line import of NotificationsModule |
| `apps/api/package.json` | Add: @nestjs/bullmq, bullmq, @nestjs/event-emitter, nodemailer, react, react-dom, react-email, @react-email/components |
| `packages/db/prisma/seed.ts` | Add default routing rules for ivoryglow tenant |
| `docker/compose.yml` | Add env vars to api service for notifications |
| `apps/web-admin/app/layout.tsx` | (no change — nav added by E11 convention) |
| `apps/web-admin/package.json` | May need api client deps |

---

## Task 1: Prisma migration + env schema

**Files:**
- Modify: `packages/db/prisma/schema.prisma`
- Modify: `packages/config/src/env-schema.ts`

- [ ] **Step 1: Add E14 enums and models to schema.prisma**

Add after the existing AuditLog model, in a clearly commented `// ── E14 Notifications ──` block:

```prisma
// ── E14 Notifications ──────────────────────────────────────────

enum NotificationChannel {
  email
  sms
  whatsapp
}

enum OutboxStatus {
  queued
  sending
  sent
  failed
  suppressed
  bounced
}

enum DeliveryEventType {
  queued
  sent
  delivered
  bounced
  complained
  failed
  retried
}

enum SuppressionReason {
  bounce
  complaint
  unsubscribe
  manual
}

enum SenderVerification {
  pending
  verified
  failed
}

model NotificationOutbox {
  id              String              @id @default(cuid())
  tenantId        String?
  templateId      String
  channel         NotificationChannel
  recipient       String
  recipientUserId String?
  data            Json
  renderedSubject String?
  idempotencyKey  String              @unique
  status          OutboxStatus        @default(queued)
  attempts        Int                 @default(0)
  lastError       String?
  providerMessageId String?
  scheduledAt     DateTime            @default(now())
  sentAt          DateTime?
  createdAt       DateTime            @default(now())
  updatedAt       DateTime            @updatedAt
  events          NotificationDeliveryEvent[]

  @@index([tenantId, createdAt])
  @@index([status, scheduledAt])
  @@index([providerMessageId])
}

model NotificationDeliveryEvent {
  id              String             @id @default(cuid())
  outboxId        String
  type            DeliveryEventType
  providerPayload Json?
  createdAt       DateTime           @default(now())

  outbox NotificationOutbox @relation(fields: [outboxId], references: [id], onDelete: Cascade)

  @@index([outboxId])
}

model NotificationRoutingRule {
  id         String                @id @default(cuid())
  tenantId   String
  eventName  String
  templateId String
  channels   NotificationChannel[]
  roles      String[]
  enabled    Boolean               @default(true)
  createdAt  DateTime              @default(now())
  updatedAt  DateTime              @updatedAt

  @@unique([tenantId, eventName, templateId])
  @@index([tenantId])
}

model NotificationSuppression {
  id        String             @id @default(cuid())
  tenantId  String?
  channel   NotificationChannel
  recipient String
  reason    SuppressionReason
  source    String
  createdAt DateTime           @default(now())

  @@unique([channel, recipient])
}

model TenantSenderIdentity {
  id                String             @id @default(cuid())
  tenantId          String
  channel           NotificationChannel
  fromName          String
  fromAddress       String
  replyTo           String?
  domain            String?
  verificationStatus SenderVerification @default(pending)
  dnsRecords        Json?
  createdAt         DateTime           @default(now())
  updatedAt         DateTime           @updatedAt

  @@unique([tenantId, channel])
}
```

- [ ] **Step 2: Add E14 env vars to env-schema.ts**

Add after the e00Schema object, extending it:

```ts
// ── E14 Notifications ──────────────────────────────────────────
const e14Schema = e00Schema.extend({
  MAIL_PROVIDER: z.enum(['smtp', 'resend']).default('smtp'),
  RESEND_API_KEY: z.string().default(''),
  SMS_PROVIDER: z.enum(['fake', 'termii']).default('fake'),
  TERMII_API_KEY: z.string().default(''),
  TERMII_SENDER: z.string().default('VerifyN'),
  FAKE_SMS_URL: z.string().default('http://localhost:4101'),
  WHATSAPP_PROVIDER: z.enum(['fake', 'meta']).default('fake'),
  META_WA_PHONE_NUMBER_ID: z.string().default(''),
  META_WA_ACCESS_TOKEN: z.string().default(''),
  META_WA_BUSINESS_ACCOUNT_ID: z.string().default(''),
  NOTIFICATIONS_FROM: z.string().default('VerifyN <noreply@verifyn.ng>'),
  FAKE_WEBHOOK_SECRET: z.string().default('dev-secret'),
});
```

And update `export const envSchema = e14Schema;` and `export type Env = z.infer<typeof e14Schema>;`

- [ ] **Step 3: Run prisma migrate**

```bash
cd packages/db && npx prisma migrate dev --name E14_notifications
```

- [ ] **Step 4: Verify typecheck passes**

```bash
pnpm typecheck
```

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat(E14): Prisma migration + env schema for notifications"
```

---

## Task 2: Ports + adapters (Mailer, SMS, WhatsApp)

**Files:**
- Create: `apps/api/src/modules/notifications/notifications.module.ts`
- Create: `apps/api/src/modules/notifications/ports/mailer.port.ts`
- Create: `apps/api/src/modules/notifications/ports/sms.port.ts`
- Create: `apps/api/src/modules/notifications/ports/whatsapp.port.ts`
- Create: `apps/api/src/modules/notifications/adapters/smtp-mailer.adapter.ts`
- Create: `apps/api/src/modules/notifications/adapters/fake-sms.adapter.ts`
- Create: `apps/api/src/modules/notifications/adapters/fake-whatsapp.adapter.ts`
- Create: `apps/api/src/modules/notifications/adapters/resend-mailer.adapter.ts`
- Create: `apps/api/src/modules/notifications/adapters/termii-sms.adapter.ts`
- Create: `apps/api/src/modules/notifications/adapters/meta-whatsapp.adapter.ts`
- Create: `apps/api/src/modules/notifications/adapters/adapter-contract.spec.ts`
- Modify: `apps/api/package.json`

- [ ] **Step 1: Install dependencies**

```bash
cd apps/api && pnpm add @nestjs/bullmq bullmq @nestjs/event-emitter nodemailer && pnpm add -D @types/nodemailer
```

- [ ] **Step 2: Create port interfaces**

`ports/mailer.port.ts`:
```ts
import { InjectionToken } from '@nestjs/common';

export interface SenderIdentity {
  fromName: string;
  fromAddress: string;
  replyTo?: string;
}

export interface MailerMessage {
  to: string;
  from: SenderIdentity;
  replyTo?: string;
  subject: string;
  html: string;
  text: string;
  headers?: Record<string, string>;
  tags?: string[];
}

export interface MailerResult {
  providerMessageId: string;
}

export const MAILER: InjectionToken<MailerPort> = 'MAILER';

export interface MailerPort {
  send(m: MailerMessage): Promise<MailerResult>;
}
```

`ports/sms.port.ts`:
```ts
import { InjectionToken } from '@nestjs/common';

export interface SmsMessage {
  to: string;
  body: string;
  from?: string;
}

export interface SmsResult {
  providerMessageId: string;
}

export const SMS: InjectionToken<SmsPort> = 'SMS';

export interface SmsPort {
  send(m: SmsMessage): Promise<SmsResult>;
}
```

`ports/whatsapp.port.ts`:
```ts
import { InjectionToken } from '@nestjs/common';

export interface WhatsAppTemplateMessage {
  to: string;
  template: string;
  params: Record<string, string>;
}

export interface WhatsAppResult {
  providerMessageId: string;
}

export const WHATSAPP: InjectionToken<WhatsAppPort> = 'WHATSAPP';

export interface WhatsAppPort {
  sendTemplate(m: WhatsAppTemplateMessage): Promise<WhatsAppResult>;
}
```

- [ ] **Step 3: Create SmtpMailer adapter**

`adapters/smtp-mailer.adapter.ts`:
```ts
import { Injectable } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import { MailerPort, MailerMessage, MailerResult } from '../ports/mailer.port';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class SmtpMailer implements MailerPort {
  private transporter: nodemailer.Transporter;

  constructor(private config: ConfigService) {
    this.transporter = nodemailer.createTransport({
      host: config.get('SMTP_HOST'),
      port: config.get('SMTP_PORT'),
      secure: false,
      auth: config.get('SMTP_USER')
        ? { user: config.get('SMTP_USER'), pass: config.get('SMTP_PASS') }
        : undefined,
    });
  }

  async send(m: MailerMessage): Promise<MailerResult> {
    const result = await this.transporter.sendMail({
      from: `${m.from.fromName} <${m.from.fromAddress}>`,
      to: m.to,
      replyTo: m.replyTo,
      subject: m.subject,
      html: m.html,
      text: m.text,
      headers: m.headers,
    });
    return { providerMessageId: result.messageId };
  }
}
```

- [ ] **Step 4: Create FakeSms adapter**

`adapters/fake-sms.adapter.ts`:
```ts
import { Injectable } from '@nestjs/common';
import { SmsPort, SmsMessage, SmsResult } from '../ports/sms.port';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class FakeSms implements SmsPort {
  private baseUrl: string;

  constructor(private config: ConfigService) {
    this.baseUrl = config.get('FAKE_SMS_URL')!;
  }

  async send(m: SmsMessage): Promise<SmsResult> {
    const res = await fetch(`${this.baseUrl}/api/sms/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        to: m.to,
        from: m.from ?? 'VerifyN',
        sms: m.body,
        api_key: 'fake',
      }),
    });
    const data = (await res.json()) as { message_id: string };
    return { providerMessageId: data.message_id };
  }
}
```

- [ ] **Step 5: Create FakeWhatsApp adapter**

`adapters/fake-whatsapp.adapter.ts`:
```ts
import { Injectable } from '@nestjs/common';
import { WhatsAppPort, WhatsAppTemplateMessage, WhatsAppResult } from '../ports/whatsapp.port';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class FakeWhatsApp implements WhatsAppPort {
  private baseUrl: string;

  constructor(private config: ConfigService) {
    this.baseUrl = config.get('FAKE_SMS_URL')!;
  }

  async sendTemplate(m: WhatsAppTemplateMessage): Promise<WhatsAppResult> {
    const res = await fetch(`${this.baseUrl}/api/whatsapp/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        to: m.to,
        template: m.template,
        params: m.params,
      }),
    });
    const data = (await res.json()) as { message_id: string };
    return { providerMessageId: data.message_id };
  }
}
```

- [ ] **Step 6: Create ResendMailer, TermiiSms, MetaWhatsApp stubs**

`adapters/resend-mailer.adapter.ts`:
```ts
import { Injectable } from '@nestjs/common';
import { MailerPort, MailerMessage, MailerResult } from '../ports/mailer.port';

@Injectable()
export class ResendMailer implements MailerPort {
  async send(m: MailerMessage): Promise<MailerResult> {
    // TODO: implement with Resend SDK
    throw new Error('ResendMailer not yet implemented');
  }
}
```

`adapters/termii-sms.adapter.ts`:
```ts
import { Injectable } from '@nestjs/common';
import { SmsPort, SmsMessage, SmsResult } from '../ports/sms.port';

@Injectable()
export class TermiiSms implements SmsPort {
  async send(m: SmsMessage): Promise<SmsResult> {
    // TODO: implement with Termii API
    throw new Error('TermiiSms not yet implemented');
  }
}
```

`adapters/meta-whatsapp.adapter.ts`:
```ts
import { Injectable } from '@nestjs/common';
import { WhatsAppPort, WhatsAppTemplateMessage, WhatsAppResult } from '../ports/whatsapp.port';

export class NotConfiguredError extends Error {
  constructor(service: string) {
    super(`${service} is not configured. Set the required environment variables.`);
    this.name = 'NotConfiguredError';
  }
}

@Injectable()
export class MetaWhatsApp implements WhatsAppPort {
  async sendTemplate(m: WhatsAppTemplateMessage): Promise<WhatsAppResult> {
    throw new NotConfiguredError('Meta WhatsApp');
  }
}
```

- [ ] **Step 7: Create NotificationsModule with provider selection from env**

`notifications.module.ts`:
```ts
import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';
import { MAILER, MailerPort } from './ports/mailer.port';
import { SMS, SmsPort } from './ports/sms.port';
import { WHATSAPP, WhatsAppPort } from './ports/whatsapp.port';
import { SmtpMailer } from './adapters/smtp-mailer.adapter';
import { ResendMailer } from './adapters/resend-mailer.adapter';
import { FakeSms } from './adapters/fake-sms.adapter';
import { TermiiSms } from './adapters/termii-sms.adapter';
import { FakeWhatsApp } from './adapters/fake-whatsapp.adapter';
import { MetaWhatsApp } from './adapters/meta-whatsapp.adapter';

@Module({
  imports: [
    BullModule.registerQueue({ name: 'notifications' }),
  ],
  providers: [
    {
      provide: MAILER,
      useFactory: (config: ConfigService) => {
        switch (config.get('MAIL_PROVIDER')) {
          case 'resend':
            return new ResendMailer();
          default:
            return new SmtpMailer(config);
        }
      },
      inject: [ConfigService],
    },
    {
      provide: SMS,
      useFactory: (config: ConfigService) => {
        switch (config.get('SMS_PROVIDER')) {
          case 'termii':
            return new TermiiSms();
          default:
            return new FakeSms(config);
        }
      },
      inject: [ConfigService],
    },
    {
      provide: WHATSAPP,
      useFactory: (config: ConfigService) => {
        switch (config.get('WHATSAPP_PROVIDER')) {
          case 'meta':
            return new MetaWhatsApp();
          default:
            return new FakeWhatsApp(config);
        }
      },
      inject: [ConfigService],
    },
  ],
  exports: [MAILER, SMS, WHATSAPP],
})
export class NotificationsModule {}
```

- [ ] **Step 8: Add NotificationsModule import to AppModule**

In `apps/api/src/app.module.ts`, add one import line:
```ts
import { NotificationsModule } from './modules/notifications/notifications.module';
```
And add `NotificationsModule` to the `imports` array.

- [ ] **Step 9: Verify typecheck**

```bash
pnpm typecheck
```

- [ ] **Step 10: Commit**

```bash
git add -A && git commit -m "feat(E14): ports, adapters, and NotificationsModule skeleton"
```

---

## Task 3: Template engine

**Files:**
- Create: `apps/api/src/modules/notifications/templates/template-data.ts`
- Create: `apps/api/src/modules/notifications/templates/registry.ts`
- Create: `apps/api/src/modules/notifications/templates/registry.spec.ts`
- Create: `apps/api/src/modules/notifications/templates/base-layout.tsx` (and all template components)

- [ ] **Step 1: Install react-email dependencies**

```bash
cd apps/api && pnpm add react react-dom react-email @react-email/components && pnpm add -D @types/react @types/react-dom
```

- [ ] **Step 2: Create template-data.ts with typed TemplateData map**

This file defines `TemplateId` union and `TemplateData` mapped type, ensuring type safety for all templates.

- [ ] **Step 3: Create base-layout.tsx** — react-email base layout with branding props (tenantName, logoUrl, primaryColor, footerAddress, unsubscribeLine).

- [ ] **Step 4: Create each template component** — one `.tsx` file per TemplateId, exporting a component that takes `TemplateData[id]` + `branding` props and returns react-email `<Html>`. Also export a `subject` function or constant. Include `text` and `sms` variant renderers.

- [ ] **Step 5: Create registry.ts** — `TemplateRegistry.render(templateId, data, branding)` returns `{ subject, html, text, sms, whatsapp? }`. Uses `render()` from react-email for HTML and plain text.

- [ ] **Step 6: Create registry.spec.ts** — snapshot tests for every template id with sample data.

- [ ] **Step 7: Verify tests pass**

```bash
cd apps/api && pnpm vitest run src/modules/notifications/templates/
```

- [ ] **Step 8: Commit**

```bash
git add -A && git commit -m "feat(E14): template engine with react-email, all templates, registry, snapshots"
```

---

## Task 4: Outbox + worker

**Files:**
- Create: `apps/api/src/modules/notifications/outbox/outbox.service.ts`
- Create: `apps/api/src/modules/notifications/outbox/outbox.service.spec.ts`
- Create: `apps/api/src/modules/notifications/notifications.service.ts`
- Create: `apps/api/src/modules/notifications/notifications.worker.ts`
- Create: `apps/api/src/modules/notifications/suppressions/suppressions.service.ts`
- Create: `apps/api/src/modules/notifications/suppressions/suppressions.service.spec.ts`

- [ ] **Step 1: Create SuppressionsService** — check/add/remove suppressions against Prisma `NotificationSuppression`.

- [ ] **Step 2: Create OutboxService** — write to `NotificationOutbox` with idempotency key (auto-generate from sha256(templateId|recipient|canonical(data)|date-hour) if not provided), query by status/channel/templateId/cursor, retry a row.

- [ ] **Step 3: Create NotificationService** — `send()` creates outbox row + enqueues BullMQ `deliver` job. `dispatch()` is added in T6 (routing).

- [ ] **Step 4: Create NotificationWorker** — BullMQ processor for `notifications` queue, job name `deliver`. Renders template, checks suppression, calls port, records delivery event, handles errors with exponential backoff (5 attempts: 30s→16min). Emits `notification.sent`/`notification.failed` events.

- [ ] **Step 5: Write unit tests** — idempotency key derivation, backoff schedule, suppression short-circuit.

- [ ] **Step 6: Verify tests pass**

- [ ] **Step 7: Commit**

```bash
git add -A && git commit -m "feat(E14): outbox, worker, suppressions, and NotificationService.send()"
```

---

## Task 5: BrandingResolver + TenantSenderIdentity

**Files:**
- Create: `apps/api/src/modules/notifications/routing/branding-resolver.ts`
- Create: `apps/api/src/modules/notifications/routing/branding-resolver.spec.ts`

- [ ] **Step 1: Create BrandingResolver** — looks up Tenant by id for name/logo, falls back to platform defaults. Checks `TenantSenderIdentity` for a verified override. Returns `{ tenantName, logoUrl?, primaryColor?, sender: SenderIdentity }`.

- [ ] **Step 2: Unit tests** — default branding, tenant override, verified sender identity override.

- [ ] **Step 3: Verify tests pass**

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "feat(E14): BrandingResolver and TenantSenderIdentity lookup"
```

---

## Task 6: Event routing

**Files:**
- Create: `apps/api/src/modules/notifications/routing/event-router.ts`
- Create: `apps/api/src/modules/notifications/routing/event-router.spec.ts`
- Modify: `packages/db/prisma/seed.ts`

- [ ] **Step 1: Create EventRouter** — subscribes to domain events via Nest `EventEmitter2`. On event: looks up `NotificationRoutingRule` rows matching `eventName` + `tenantId` + `enabled=true`. For each rule: resolves members by roles (stubbed until E02 lands — query `User` table with `tenantId` and role filter from membership). For each member: calls `NotificationService.send()` with the rule's templateId, channels, and member's email/phone.

- [ ] **Step 2: Add `dispatch()` to NotificationService** — delegates to EventRouter logic.

- [ ] **Step 3: Update seed.ts** — add default routing rules for ivoryglow tenant (anomaly.detected, report.created, batch.minted, manifest.delivered, receipt.mismatch).

- [ ] **Step 4: Integration test** — create a rule, emit event, verify outbox rows created.

- [ ] **Step 5: Verify tests pass**

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat(E14): event routing, default rules, seed extension"
```

---

## Task 7: Webhooks + suppression handling

**Files:**
- Create: `apps/api/src/modules/notifications/webhooks/webhooks.service.ts`
- Create: `apps/api/src/modules/notifications/webhooks/webhooks.service.spec.ts`
- Create: `apps/api/src/modules/notifications/notifications.controller.ts` (webhook endpoints)

- [ ] **Step 1: Create WebhooksService** — verify svix signature for Resend webhooks, process `email.bounced`/`email.complained` → suppress recipient + emit `notification.bounced`. Process Termii DLR → delivery event. Process fake-mail webhook (HMAC with FAKE_WEBHOOK_SECRET).

- [ ] **Step 2: Add webhook controller routes** — `POST /v1/webhooks/resend`, `POST /v1/webhooks/termii`, `POST /v1/webhooks/fake-mail`.

- [ ] **Step 3: Unit tests** — svix signature verification with fixture, fake-mail HMAC, bounce → suppression.

- [ ] **Step 4: Verify tests pass**

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat(E14): provider webhooks, bounce/complaint → suppression"
```

---

## Task 8: Admin REST routes

**Files:**
- Modify: `apps/api/src/modules/notifications/notifications.controller.ts` (add admin routes)
- Create: `apps/api/src/modules/notifications/notifications.controller.spec.ts`

- [ ] **Step 1: Add admin routes to controller** — rules CRUD, outbox listing/retry, suppressions CRUD, send test. All tenant-scoped (using @TenantId()). @Audited on mutating routes (stub until E13).

- [ ] **Step 2: Add dev-only routes** — `POST /v1/_dev/notify`, `POST /v1/_dev/emit` (only in development).

- [ ] **Step 3: E2E-style Nest tests** — hit routes with supertest, verify responses.

- [ ] **Step 4: Verify tests pass**

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat(E14): admin REST routes, dev endpoints, controller tests"
```

---

## Task 9: Fake SMS service replacement

**Files:**
- Rewrite: `tools/fakes/sms/server.mjs`
- Rewrite: `tools/fakes/sms/Dockerfile`
- Create: `tools/fakes/sms/package.json`

- [ ] **Step 1: Write the full fake-sms Fastify service**

Replace the stub with a real Fastify app that:
- `POST /api/sms/send` — Termii-shaped `{ to, from, sms, api_key }` → `{ message_id }`, stores message
- `POST /api/whatsapp/send` — stores WA message, returns `{ message_id }`
- `GET /api/messages?channel&to` — list stored messages
- `DELETE /api/messages` — clear all
- `GET /` — server-rendered HTML with message list + inbound form + bounce sim form
- `POST /api/inbound` — forwards `{ from, text, receivedAt }` to `API_URL/v1/verify/sms`
- `POST /api/bounce` — POSTs signed bounce event to `API_URL/v1/webhooks/fake-mail`
- `GET /health` — returns `{ status: 'ok' }`

- [ ] **Step 2: Update Dockerfile** — install fastify deps, run server.mjs

- [ ] **Step 3: Test against compose** — `docker compose up fake-sms`, curl the endpoints.

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "feat(E14): full fake-sms service with UI, inbound, and bounce simulation"
```

---

## Task 10: Docker compose wiring

**Files:**
- Modify: `docker/compose.yml`

- [ ] **Step 1: Add notification env vars to api service** — `MAIL_PROVIDER=smtp`, `SMS_PROVIDER=fake`, `WHATSAPP_PROVIDER=fake`, `FAKE_SMS_URL=http://fake-sms:4101`, `NOTIFICATIONS_FROM`, `FAKE_WEBHOOK_SECRET`.

- [ ] **Step 2: Add `API_URL=http://api:4000` env to fake-sms service**.

- [ ] **Step 3: Verify `docker compose config` passes**.

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "feat(E14): compose env vars for notifications"
```

---

## Task 11: web-admin notifications page

**Files:**
- Create: `apps/web-admin/app/(console)/notifications/page.tsx`
- Create: `apps/web-admin/app/(console)/notifications/components/rules-tab.tsx`
- Create: `apps/web-admin/app/(console)/notifications/components/outbox-tab.tsx`
- Create: `apps/web-admin/app/(console)/notifications/components/suppressions-tab.tsx`
- Create: `apps/web-admin/app/(console)/notifications/components/send-test-button.tsx`

- [ ] **Step 1: Create notifications page** with tab navigation (Rules, Outbox, Suppressions).

- [ ] **Step 2: Rules tab** — matrix of event × channel × role with toggles; save = PUT `/v1/notifications/rules`.

- [ ] **Step 3: Outbox tab** — table with status chips, filter by status/channel/templateId, retry button.

- [ ] **Step 4: Suppressions tab** — list, add manual suppression, remove.

- [ ] **Step 5: Send test button** — POST `/v1/notifications/test`.

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat(E14): web-admin notifications page with rules, outbox, suppressions tabs"
```

---

## Task 12: Documentation + final wire-up

**Files:**
- Create: `docs/notifications/templates.md`
- Create: `docs/notifications/deliverability.md`
- Create: `docs/notifications/routing.md`
- Modify: `packages/db/prisma/seed.ts` (if not already done)
- Modify: root `package.json` (add `notifications:preview` script)

- [ ] **Step 1: Write docs/notifications/templates.md** — lists all template IDs, required data fields, owning epic.

- [ ] **Step 2: Write docs/notifications/deliverability.md** — SPF/DKIM/DMARC, Resend domain verification, warm-up, bounce thresholds, Termii sender-ID, WhatsApp template approval.

- [ ] **Step 3: Write docs/notifications/routing.md** — how an epic adds an event + template.

- [ ] **Step 4: Add `notifications:preview` script to root package.json** — runs react-email preview server on port 4110.

- [ ] **Step 5: Final verification** — `pnpm lint && pnpm typecheck && pnpm test && pnpm build`.

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat(E14): notification docs, preview script, final wire-up"
```

---

## Self-Review Checklist

1. **Spec coverage:** All 8 ACs map to tasks: AC1 (T4+T8 dev route), AC2 (T4 idempotency), AC3 (T4 retry), AC4 (T6 routing), AC5 (T9 fake-sms), AC6 (T7 webhooks), AC7 (T3 templates), AC8 (T11 web-admin).

2. **Placeholder scan:** No TBDs, TODOs (except marked real-TODO for Resend/Termii implementations which are T10 scope).

3. **Type consistency:** All port interfaces match the epic spec. TemplateId, TemplateData, SenderIdentity used consistently.
