# E15 — Billing & Entitlements

|                 |                                                                                                                                                                                                                             |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Wave            | 3                                                                                                                                                                                                                           |
| Status          | in-progress                                                                                                                                                                                                                 |
| Owner           | Frank Enendu (@enendufrankc)                                                                                                                                                                                                |
| GitHub Issue    | [#16](https://github.com/enendufrankc/verifynNG/issues/16)                                                                                                                                                                  |
| Depends on      | E12 (usage meters), E03 (tenant status), E14 (mailer + templates), E04 (`EntitlementPolicy` interface), E11 (admin shell), E13 (`@Audited`)                                                                                 |
| Unblocks        | E18 (plan/usage in tenant directory), E21 (invoice fixtures)                                                                                                                                                                |
| Readiness items | `production-readiness.md` §7 all rows (pricing model, payment gateway, plans/trials/upgrades, metering separated from pricing, invoicing/dunning, entitlement enforcement) · §8 suspension/reactivation ("restricted mode") |

## Goal

A tenant can pick a plan, be metered, be invoiced monthly in NGN or GBP from E12's raw usage, pay through Paystack (or the compose fake), and be gently locked out of minting — never out of consumer verification — when they stop paying. Plan limits are enforced at mint time through E04's `EntitlementPolicy`, so "500 free codes" is a real cap rather than a marketing line. Pricing lives in this epic only: E12 records what happened, E15 decides what it costs. Without this the platform has no revenue, no trial gate, and no answer to "what happens when a tenant's card fails".

## Scope

**In:** `Plan` catalogue + seed, `Subscription` lifecycle state machine, `EntitlementPolicy` implementation (units/year cap, feature flags), monthly invoice generation from `UsageSummary`, `Invoice`/`InvoiceLine`/`Payment` models, `PaymentGatewayPort` + Paystack adapter + fake adapter, `tools/fakes/pay` real behaviour (hosted checkout, webhooks), dunning schedule and reminder emails via E14, restricted mode round-trip with E03, plan change with proration, owner-only billing pages in web-admin, platform-support subscription list, invoice PDF.

**Out:** recording usage (E12 owns `UsageEvent`/`UsageSummary`), tenant suspension for non-billing reasons and the `suspended` guard itself (E03), email delivery mechanics (E14), rate limiting / per-request quotas (E13 `QuotaService` — E15 supplies plan numbers to it via `Plan.features`, E13 enforces), tax/VAT computation beyond a flat configurable rate per currency (future), Flutterwave/Stripe adapters (future — port is designed for them), coupons/discount codes (future), multi-seat pricing (roles are unlimited on every plan).

## Owned paths

```
apps/api/src/modules/billing/**
apps/web-admin/app/(console)/billing/**
apps/web-admin/app/(support)/subscriptions/**       (agreed with E18: E18 owns app/(support)/** shell; this one route group is E15's)
packages/db/prisma/schema.prisma                     (additive block: "E15")
packages/db/prisma/seed/plans.ts
tools/fakes/pay/**                                   (E00 stub replaced with real fake gateway)
docs/billing-pricing-and-proration.md
```

## Interfaces

**Consumes:**

- E12: `UsageSummary` (per tenant, per period: `unitsMinted`, `scansRecorded`, `apiCalls`), `GET /tenants/:id/usage`, event `usage.summarised` (end-of-period rollup). E15 reads meters, never writes them.
- E03: `Tenant.status`, `TenantService.setRestricted(tenantId, reason)` / `clearRestricted(tenantId)` — **change request to E03**: E03's guard must treat a new `Tenant.status = restricted` (or an equivalent `restrictedReason` field) the same as `suspended` for write paths but keep `/v1/verify/**` open. E15 drives this state; E03 owns the enum and guard.
- E04: `EntitlementPolicy` interface (`assertCanMint(tenantId, count)`, `hasFeature(tenantId, feature)`); E15 provides `PlanEntitlementPolicy` and E04 binds it via the `ENTITLEMENT_POLICY` token, replacing the allow-all default. Event `batch.minted` (to refresh the cached units-this-year counter).
- E14: `NotificationService.send(templateId, to, vars)` with templates `invoice.issued`, `invoice.due`, `invoice.failed`, `invoice.paid`, `subscription.restricted`, `subscription.reactivated`, `trial.ending` — **change request to E14**: add these template ids (E14 spec lists `invoice.*`; the `subscription.*`/`trial.*` ones are new).
- E13: `@Audited` on every mutation (plan change, payment method change, manual invoice mark-paid); `QuotaService` reads `PlanEntitlementPolicy.limitsFor(tenantId)` for per-tenant API rate limits.
- E02: `@Roles('owner')` on all tenant billing routes; `@Roles('support')` on platform routes; `ApiClient` for the fake gateway's webhook caller (not needed — webhooks are signature-authenticated, not JWT).
- E11: `nav.config.ts` entry `billing` (owner-only visibility), `apiClient`, `EmptyState` for the billing route group.

**Exposes:**

Nest providers (module `BillingModule`):

```ts
PlanService; // list(), getByCode(code), seed()
SubscriptionService; // getForTenant(id), startTrial(id), changePlan(id, planCode, {effective:'now'|'period_end'}), cancel(id), transition(id, status)
EntitlementService; // implements EntitlementPolicy: assertCanMint, hasFeature, limitsFor(tenantId): PlanLimits
InvoiceService; // generateForPeriod(tenantId, period), issue(invoiceId), markPaid(invoiceId, paymentId), renderPdf(invoiceId): Buffer
PaymentService; // initialise(invoiceId) → { checkoutUrl }, verify(reference), handleWebhookEvent({type, reference, data}), chargeAuthorisation(invoiceId) — see T8 notes for why this differs from the (rawBody, signature) sketched below
DunningService; // BullMQ processor: schedule retries (T+1, T+3, T+7 days), send reminders, restrict on exhaustion, reactivate on payment
PaymentGatewayPort; // interface — see below
(PaystackGateway, FakePayGateway); // adapters; chosen by env PAYMENT_GATEWAY=paystack|fake
```

```ts
interface PaymentGatewayPort {
  initialiseTransaction(i: {
    reference: string;
    amountMinor: number;
    currency: 'NGN' | 'GBP';
    email: string;
    callbackUrl: string;
    metadata: Record<string, string>;
  }): Promise<{ checkoutUrl: string; providerRef: string }>;
  verifyTransaction(reference: string): Promise<{
    status: 'success' | 'failed' | 'pending';
    amountMinor: number;
    currency: string;
    authorizationCode?: string;
    cardLast4?: string;
    cardBrand?: string;
  }>;
  chargeAuthorisation(i: {
    authorizationCode: string;
    email: string;
    amountMinor: number;
    currency: 'NGN' | 'GBP';
    reference: string;
  }): Promise<{
    status: 'success' | 'failed';
    providerRef: string;
    failureReason?: string;
  }>;
  verifyWebhookSignature(rawBody: Buffer, signatureHeader: string): boolean; // Paystack: HMAC-SHA512 of body with secret key, header x-paystack-signature
  parseWebhook(rawBody: Buffer): {
    type:
      | 'charge.success'
      | 'charge.failed'
      | 'invoice.payment_failed'
      | string;
    reference: string;
    data: unknown;
  };
}
```

HTTP routes (internal, JWT):

```
GET    /v1/billing/plans                                  public list of plans (any authenticated user)
GET    /v1/tenants/:tenantId/billing/subscription          owner
POST   /v1/tenants/:tenantId/billing/subscription/change   owner  { planCode, effective }
POST   /v1/tenants/:tenantId/billing/subscription/cancel   owner
GET    /v1/tenants/:tenantId/billing/invoices              owner  cursor-paginated
GET    /v1/tenants/:tenantId/billing/invoices/:id          owner
GET    /v1/tenants/:tenantId/billing/invoices/:id/pdf      owner  application/pdf
POST   /v1/tenants/:tenantId/billing/invoices/:id/pay      owner  → { checkoutUrl }
GET    /v1/tenants/:tenantId/billing/payment-methods       owner
DELETE /v1/tenants/:tenantId/billing/payment-methods/:id   owner
GET    /v1/tenants/:tenantId/billing/usage-vs-plan         owner  { period, unitsMinted, includedUnits, scans, includedScans, projectedOverageMinor }
POST   /v1/billing/webhooks/paystack                        no auth; raw body; signature verified; idempotent on provider event id
GET    /v1/platform/subscriptions                           support  filters status, plan, currency
POST   /v1/platform/subscriptions/:id/mark-paid             support  manual settlement (bank transfer) — @Audited with reason
```

Domain events (Nest `EventEmitter`):

```
subscription.changed     { tenantId, subscriptionId, fromPlanCode, toPlanCode, fromStatus, toStatus, effectiveAt }
invoice.issued           { tenantId, invoiceId, number, currency, totalMinor, dueAt }
payment.succeeded        { tenantId, invoiceId, paymentId, amountMinor, currency, provider }
payment.failed           { tenantId, invoiceId, paymentId, attempt, reason, nextRetryAt? }
subscription.restricted  { tenantId, subscriptionId, reason: 'dunning_exhausted'|'trial_expired'|'cancelled', at }
subscription.reactivated { tenantId, subscriptionId, at }
```

Prisma models: `Plan`, `Subscription`, `Invoice`, `InvoiceLine`, `Payment`, `PaymentMethod`, `GatewayWebhookEvent`.

## Data model

Additive block `// E15` in `schema.prisma`. All money is an `Int` in minor units (kobo / pence); currency is an enum. No floats anywhere.

```prisma
enum Currency           { NGN GBP }
enum SubscriptionStatus { trialing active past_due restricted cancelled }
enum InvoiceStatus      { draft issued paid void uncollectible }
enum PaymentStatus      { pending succeeded failed }
enum PaymentProvider    { paystack fake manual }

model Plan {
  id                    String   @id @default(cuid())
  code                  String   @unique          // free-trial | starter | growth | enterprise
  name                  String
  monthlyPriceNgnMinor  Int                        // kobo; enterprise = 0 with features.customPricing = true
  monthlyPriceGbpMinor  Int                        // pence
  includedUnitsPerYear  Int                        // free-trial = 500 total (not per year: features.trialTotalCap = true)
  includedScansPerMonth Int
  overageUnitPriceNgnMinor Int
  overageUnitPriceGbpMinor Int
  overageScanPriceNgnMinor Int
  overageScanPriceGbpMinor Int
  features              Json                       // { publicApi, webhooks, sso, customPages, maxApiKeys, apiRateLimitPerMin, trialTotalCap?, customPricing? }
  sortOrder             Int
  active                Boolean  @default(true)
  createdAt             DateTime @default(now())
  updatedAt             DateTime @updatedAt
  subscriptions         Subscription[]
}

model Subscription {
  id                 String             @id @default(cuid())
  tenantId           String             @unique   // one live subscription per tenant; history lives in AuditLog + subscription.changed events
  planId             String
  status             SubscriptionStatus
  currency           Currency                     // fixed at creation from Tenant.country (GB → GBP, else NGN)
  currentPeriodStart DateTime
  currentPeriodEnd   DateTime
  trialEndsAt        DateTime?
  pendingPlanId      String?                      // downgrade scheduled for period end
  restrictedAt       DateTime?
  cancelledAt        DateTime?
  createdAt          DateTime @default(now())
  updatedAt          DateTime @updatedAt
  plan               Plan     @relation(fields: [planId], references: [id])
  @@index([status, currentPeriodEnd])
}

model Invoice {
  id           String        @id @default(cuid())
  tenantId     String
  number       String        @unique               // INV-<YYYYMM>-<tenantSlug>-<seq>
  status       InvoiceStatus
  currency     Currency
  periodStart  DateTime
  periodEnd    DateTime
  subtotalMinor Int
  taxMinor     Int                                  // flat BILLING_TAX_RATE_BPS per currency; 0 by default
  totalMinor   Int
  issuedAt     DateTime?
  dueAt        DateTime?                            // issuedAt + 7 days
  paidAt       DateTime?
  attemptCount Int           @default(0)
  nextRetryAt  DateTime?
  usageSnapshot Json                                // the E12 UsageSummary used, frozen
  lines        InvoiceLine[]
  payments     Payment[]
  createdAt    DateTime @default(now())
  @@index([tenantId, periodStart])
  @@index([status, nextRetryAt])
}

model InvoiceLine {
  id           String  @id @default(cuid())
  invoiceId    String
  tenantId     String
  kind         String                               // plan_fee | unit_overage | scan_overage | proration_credit | proration_charge | adjustment
  description  String
  quantity     Int
  unitPriceMinor Int
  amountMinor  Int
  invoice      Invoice @relation(fields: [invoiceId], references: [id], onDelete: Cascade)
  @@index([tenantId, invoiceId])
}

model Payment {
  id               String          @id @default(cuid())
  tenantId         String
  invoiceId        String
  provider         PaymentProvider
  reference        String          @unique          // our reference sent to the gateway
  providerRef      String?
  status           PaymentStatus
  amountMinor      Int
  currency         Currency
  failureReason    String?
  paymentMethodId  String?
  rawResponse      Json?
  createdAt        DateTime @default(now())
  updatedAt        DateTime @updatedAt
  invoice          Invoice @relation(fields: [invoiceId], references: [id])
  @@index([tenantId, createdAt])
}

model PaymentMethod {
  id                String   @id @default(cuid())
  tenantId          String
  provider          PaymentProvider
  authorizationCode String                             // Paystack reusable authorization; encrypted at rest via E13 secrets helper
  cardBrand         String?
  cardLast4         String?
  expMonth          Int?
  expYear           Int?
  isDefault         Boolean  @default(false)
  createdAt         DateTime @default(now())
  revokedAt         DateTime?
  @@index([tenantId, isDefault])
}

model GatewayWebhookEvent {
  id          String   @id                          // provider event id (Paystack `data.id` + type) — idempotency key
  provider    PaymentProvider
  type        String
  reference   String?
  receivedAt  DateTime @default(now())
  processedAt DateTime?
  rawBody     Json
}
```

Plan seed (`packages/db/prisma/seed/plans.ts`, run by `pnpm db:seed`):

| code       | NGN/month  | GBP/month  | included units | included scans/month | notes                                                               |
| ---------- | ---------- | ---------- | -------------- | -------------------- | ------------------------------------------------------------------- |
| free-trial | 0          | 0          | 500 total      | 5,000                | 30-day trial; `trialTotalCap`; no public API                        |
| starter    | ₦45,000    | £25        | 10,000/yr      | 50,000               | overage ₦8 / 0.4p per unit, ₦0.5 / 0.03p per scan                   |
| growth     | ₦180,000   | £100       | 100,000/yr     | 500,000              | public API, webhooks, custom pages                                  |
| enterprise | 0 (custom) | 0 (custom) | unlimited      | unlimited            | SSO, `customPricing`; invoices created by support with manual lines |

Amounts are placeholders agreed with product; changing them is a seed edit + `SEED_VERSION` bump, not a code change.

## Tasks

- [x] T1 Module scaffold + schema: `BillingModule`, Prisma block above, migration `E15_billing`, plan seed, `PlanService`, `GET /v1/billing/plans`. Env section `BILLING_*` in `packages/config` (`PAYMENT_GATEWAY=fake`, `PAYSTACK_SECRET_KEY`, `PAYSTACK_PUBLIC_KEY`, `FAKE_PAY_URL=http://fake-pay:4102`, `BILLING_TAX_RATE_BPS_NGN=0`, `BILLING_TAX_RATE_BPS_GBP=0`).
- [x] T2 `SubscriptionService` state machine: `trialing → active | restricted(trial_expired)`, `active → past_due → active | restricted`, `* → cancelled`. Listens to E03's `tenant.verified` (the real event E03 fires on activation — see Notes; the doc's original `tenant.activated` name doesn't exist) to `startTrial()`; currency from `Tenant.country`. Nightly BullMQ cron `billing.period-roll` advances periods and expires trials. `BillingModule`/`BillingQueueProcessor` are wired into `apps/api/src/worker.module.ts` (T8) so compose's dedicated `api-worker` container actually consumes the `billing` queue — verified live (`node dist/worker.js`, the real compiled entrypoint, starts cleanly and processes a real webhook job). Unit/integration tests for every transition; illegal transitions throw `IllegalSubscriptionTransition`.
- [x] T3 `EntitlementService implements EntitlementPolicy`: real interface is `canMint(ctx): Promise<EntitlementCheck>` (apps/api/src/modules/batches/entitlement.policy.ts), not the doc's original `assertCanMint`/throwing sketch — E04 already computes `existingUnitsThisYear` synchronously per mint call (`Unit` count), so no separate Redis counter is needed. Checks it against `includedUnitsPerYear` when `features.trialTotalCap` or `features.hardCap` is set (paid plans default: overage allowed, no cap); `hasFeature` reads `Plan.features`; `limitsFor()` returns `apiRateLimitPerMin`, `maxApiKeys` for E13/E16. Registered against E04's `ENTITLEMENT_POLICY` token in `BatchesModule` (E04 file, pre-agreed in CROSS-EPIC-REQUESTS.md). `EntitlementCheck` extended (additive) with `code`/`limit`/`used` so `MintService`'s existing 402 carries them — see AC2.
- [x] T4 `InvoiceService.generateForPeriod`: pulls E12 `UsageSummary` (real read path: `UsageReadService.summary`, only `finalisedAt`-set rows), prices `plan_fee` + `unit_overage` (max(0, minted − included·periodFraction)) + `scan_overage`, freezes `usageSnapshot`, assigns `number`, `issue()` sets `dueAt = +7d`, emits `invoice.issued`. Sending the `invoice.issued` mail is deferred to land with T5 (it needs the PDF attachment T5 builds; wiring a plain-text send now that T5 immediately supersedes isn't worth it — see PR notes). Cron `billing.invoice-run` folded into `billing.period-roll`: bills the period that's ending, best-effort per tenant, before rolling the subscription forward. `pnpm --filter api cli billing:run-invoices --tenant <slug> --period <YYYY-MM>` added (own minimal `BillingCliModule`, mirrors `jobs:run`'s rationale — pulling in `TenantsModule` breaks under tsx, a pre-existing decorator-metadata gap, so the CLI provides `InvoiceService`+`UsageReadService` directly rather than importing `BillingModule`). Integration tests with seeded `UsageSummary` assert exact line amounts (AC4's numbers) plus periodFraction edge cases.
- [x] T5 Invoice PDF: `renderPdf()` with `@react-pdf/renderer` (already a repo dependency; used instead of the doc's original `pdfkit` guess) — tenant legal name (Tenant has no `address` field anywhere, so that part of the doc's sketch is dropped), lines, totals, currency formatting for NGN/GBP, payment instructions. Route `…/invoices/:id/pdf` (not the dot-suffix `:id.pdf` this doc originally sketched — verified live that NestJS's route matching, unlike plain Express, resolves a `.pdf`-suffixed request to the plain `:id` route instead of a more specific `:id.pdf` one, regardless of declaration order; `:id/pdf` sidesteps the ambiguity entirely). Bundled `apps/api/assets/fonts/NotoSans-Regular.ttf` (Google Fonts, OFL) — the PDF standard-14 Helvetica font has no glyph for `₦` (U+20A6), so AC4's `₦66,000.00` rendered as a broken-character box until this was registered; bundled locally rather than fetched, so PDF rendering stays fully offline in `docker compose up`. Golden-file test (`pdf-parse` extracts the rendered text and asserts every line/total amount, incl. `₦66,000.00`).
- [x] T6 `PaymentGatewayPort` + `PaystackGateway`: initialise (`/transaction/initialize`), verify (`/transaction/verify/:ref`), charge authorisation (`/transaction/charge_authorization`), HMAC-SHA512 webhook signature check, `parseWebhook`. Test fixtures via `msw`/`msw/node` (already a repo dependency and this codebase's established pattern for mocking `fetch` — see `turnstile-captcha.provider.spec.ts` — used instead of the doc's original `nock` guess); no live calls in CI. `POST /v1/billing/webhooks/paystack` uses `req.rawBody` (`main.ts` now boots with `rawBody: true` — every other webhook handler in this codebase re-`JSON.stringify`s the _parsed_ body for signature checks, which isn't guaranteed to byte-match what a real provider signed; not safe to copy here), rejects bad/missing signatures with 401, dedupes via `GatewayWebhookEvent.id` (`<data.id>-<event type>`, `-` not `:` — BullMQ rejects a colon-containing custom jobId unless it splits into exactly 3 parts, and this id doubles as the job id), acks 200 and enqueues a `billing` queue job (`BillingQueueProcessor`, dispatches by job name — one BullMQ Worker per queue, so `period-roll` and `process-webhook` share a consumer rather than each registering their own). `process-webhook`'s handler calls T8's `PaymentService.handleWebhookEvent` for the actual `Payment`/`Invoice` side effects, then marks the event processed.
- [x] T7 `tools/fakes/pay` real behaviour (replaces E00 stub; Node + Fastify, port 4102 — matches `tools/fakes/sms`'s established convention, not the doc's original Hono guess): `POST /transaction/initialize` → `{ authorization_url: <FAKE_PAY_PUBLIC_URL>/checkout/:ref }` (new env `FAKE_PAY_PUBLIC_URL`, host-port-aware for per-worktree offsetting — the browser needs the mapped host port, not the container-internal 4102 the api service uses); `GET /checkout/:ref` hosted page with **Pay** and **Fail** buttons and a card-last4 input; clicking fires a Paystack-shaped `charge.success`/`charge.failed` webhook to `FAKE_PAY_WEBHOOK_URL` signed with `FAKE_PAY_SECRET`; `GET /transaction/verify/:ref`; `POST /transaction/charge_authorization` succeeds unless authorization code ends in `-FAIL` (no webhook fired for this one — it's Paystack's synchronous recurring-charge endpoint, T8's `PaymentService` reacts to the direct response); `GET /admin` lists all transactions; `GET /health`. One `PaystackGateway` class (T6), pointed at `FAKE_PAY_URL`/`FAKE_PAY_SECRET` instead of the real Paystack base URL/key — no separate `FakePayGateway` class, per the doc's own "one adapter, two base URLs". Contract tests (`tools/fakes/pay/contract.test.mjs`, Node's built-in test runner) validate the fake's response shapes against recorded fixtures in `apps/api/src/modules/billing/__fixtures__/paystack/*.json`.
- [x] T8 `PaymentService`: `initialise(invoiceId)` creates `Payment(pending)` + gateway session (email from the tenant's owner `Membership`), route `POST …/invoices/:id/pay`. `handleWebhookEvent({type, reference, data})` — not the doc's literal `handleWebhook(rawBody, signature)` — takes over from `BillingQueueProcessor`'s `process-webhook` job with the already-verified, already-stored `GatewayWebhookEvent`; re-deriving the parse from a DB-stored JSON copy of the raw body a second time would repeat work `BillingWebhooksController` (T6) already did, not add a real signature check (the original signature header isn't persisted). Marks the `Invoice` paid via `InvoiceService.markPaid` and stores a `PaymentMethod` from `authorization` when `reusable` — first one for a tenant becomes the default. `chargeAuthorisation(invoiceId)` for recurring using the default method. Emits `payment.succeeded|failed`. Idempotent: a second `charge.success` for the same reference is a no-op (verified — no duplicate `Payment` row, closing AC7).

  `PaymentMethod.authorizationCode` encryption: the schema comment ("encrypted at rest via E13 secrets helper") named a helper that doesn't actually exist in this codebase — `apps/api/src/modules/secrets/` has `SecretsPort` (reads config secrets) and `SecretsKeyRing` (hands back HMAC key material for E01's verify-code signing), neither does AES field encryption. Added a small `PaymentMethodCipher` (AES-256-GCM, new env `BILLING_PAYMENT_METHOD_ENC_KEY`) mirroring `MfaService`'s own dedicated-key pattern rather than reusing a key meant for a different cryptographic purpose or building a new shared helper inside E13's owned module.

- [x] T9 `DunningService`: on `invoice.issued`, if a default `PaymentMethod` exists, auto-charge at `dueAt` (`jobId = invoice-<id>-attempt-<n>`, `-` not `:` — same BullMQ jobId constraint as T6); on failure schedule retries per `BILLING_DUNNING_SCHEDULE_DAYS` (default `1,3,7`, only the first two entries are used as retry delays — AC5 expects exactly 3 `payment.failed` events before restriction, so the third scheduled attempt is the one whose failure exhausts the schedule), send `invoice.due` (T−2d, own BullMQ delayed job), `invoice.failed` (each failure), `invoice.paid`; after the third failure → `subscriptions.transition(tenantId, 'restricted', 'dunning_exhausted')`, which already drives `Tenant.status` via E03's `TenantLifecycleService` and emits `subscription.restricted` (T2 wired this, not a separate `setRestricted` call the doc originally sketched — there's no such method), send `subscription.restricted`. On `payment.succeeded` for a restricted tenant → `transition(tenantId, 'active')` (same E03 round-trip in reverse), send `subscription.reactivated`. `BillingClock` (own small class, not literally named `FakeClock`) wraps `now()/addDays()/daysToMs()`, reading `BILLING_CLOCK_SKEW_SECONDS` to compress a "day" to N seconds for demos/tests; `loadEnv()` memoizes at module scope so the compression path is only exercised live (fixed env for a container's lifetime), not via env mutation mid-test-process — see `billing-clock.service.spec.ts`.

  Two bugs only surfaced via live `docker compose up` verification, not unit tests: (1) `DunningService` wasn't in `BillingModule`'s `exports`, so `api-worker` crashed on boot with `UnknownDependenciesException` the moment `BillingQueueProcessor` (which depends on it) was wired in — fixed by adding it to the exports array. (2) `api-worker`'s compose service block was missing almost all `BILLING_*` env vars including `BILLING_PAYMENT_METHOD_ENC_KEY`, so it silently fell back to an all-zero default key differing from `api`'s real key — every dunning charge then failed `PaymentMethodCipher` decryption with "Unsupported state or unable to authenticate data" (AES-GCM auth-tag mismatch across two different keys). Fixed by giving `api-worker` the full matching `BILLING_*`/`PAYSTACK_*` env block in `docker/compose.yml`. Also found: `OutboxService`'s default idempotency key (`templateId`+`recipient`+`data`) silently deduped the three genuinely-distinct `invoice.failed` dunning-retry emails into one, since the payload doesn't vary between attempts — fixed by passing an explicit `idempotencyKey` encoding the attempt number (and, for `subscription.restricted`, the invoice id). And `POST …/invoices/:id/pay` 403'd `tenant_suspended` for a restricted tenant, breaking the "pay to reactivate" flow — fixed with `@AllowWhenSuspended()` on that route.

- [x] T10 Plan change with proration: `SubscriptionService.changePlan(tenantId, planCode, { force?, now? })` — direction is derived from `Plan.sortOrder` (not the caller's `effective`, which the doc's original "Exposes" sketch had the caller choose; that field doesn't exist on the real method — see notes below). Upgrade (`sortOrder` up) switches `Subscription.planId` immediately (re-basing entitlement checks to the new plan on the very next mint call; a `trialing` subscription also moves to `active`) and issues an immediate proration invoice for `chargeMinor − creditMinor` (remaining-period fractions of the new/old plan fee) when that net is positive — zero/negative net issues nothing, this catalogue doesn't do standalone refunds. Downgrade (`sortOrder` down) only sets `pendingPlanId`; `runPeriodRoll` (already built in T2) applies it at `currentPeriodEnd`. Downgrade is blocked with `ConflictException('downgrade_exceeds_target_plan')` when `prisma.unit.count({tenantId})` (the same query `MintService` uses) exceeds the target plan's `includedUnitsPerYear`, unless `force: true`. Either direction touching the custom-priced `enterprise` plan is rejected — same "invoiced manually by support" rule `InvoiceService.generateForPeriod` already enforces. `previewChangePlan(tenantId, planCode)` runs the same math read-only (surfaces `blockedByUnitsCap` instead of throwing) for T11's proration-preview modal. New routes `GET .../subscription/change-plan-preview` and `POST .../subscription/change` (`@Audited('subscription.change_plan')`). No schema migration needed — `pendingPlanId` and the `proration_credit`/`proration_charge` `InvoiceLine.kind` values were already in the T1 additive block, unused until now. Rules and worked NGN (₦67,500 net, starter→growth, half a period left) and GBP (£37.50, same scenario) examples in `docs/billing-pricing-and-proration.md`; 8 new integration tests in `subscription.service.integration.spec.ts` mirror them plus the downgrade/cap/enterprise/no-op paths.

  Verified live against `docker compose up` on the real seeded `ivoryglow` tenant (starter, mid-period): `GET .../change-plan-preview?planCode=growth` returned the correct net; `POST .../subscription/change {planCode:growth}` switched the plan, issued `INV-202608-ivoryglow-2` (credit + charge lines, PDF rendered 200/8.4 KB), and recorded `subscription.change_plan` in the audit log; a follow-up downgrade to `starter` (500 units, well under its 10,000 cap) correctly only set `pendingPlanId` with no invoice. Demo mutations reverted afterward — except the two `AuditLog` rows, which a Postgres trigger (`audit_log_immutable_fn`) refuses to delete (append-only by design, so left in place as a legitimate trail rather than forced out). That cleanup also surfaced a tooling gotcha, not a product bug: `psql -c "stmt1; stmt2; stmt3"` sends all statements as one simple-query message, so an error partway through (the `AuditLog` delete) silently rolled back the earlier statements in the same call too — fixed by re-running each statement as its own `psql -c`.

- [x] T11 web-admin `app/(console)/billing/**`: `layout.tsx` gates the whole route group (`role !== 'owner'` renders `EmptyState` "Owner access required", not the doc's original `minRole`-only assumption — the nav entry alone doesn't stop direct navigation). `page.tsx` overview (plan card, trial/renewal countdown, usage-vs-plan bars, projected overage, inline restricted notice), `invoices/` list (cursor-paginated `DataTable`) + `[id]/` detail (line items, totals, **Pay now** when `issued`) + PDF download (blob-fetch with the JWT header, mirroring `lib/batches.ts`'s `downloadArtefact` — a plain `<a href>` can't carry `Authorization`), `payment-methods/` list + remove, `change-plan/` comparison grid + a `Dialog`-based proration preview (`GET .../change-plan-preview`) with a `force` checkbox surfaced only when `blockedByUnitsCap` is set. Nav entry `billing` was **already registered** in `nav.config.ts` (`minRole: 'owner'`, not the doc's `roles: ['owner']` — E11's real schema) before this task started, so no nav change was needed.

  Two new small backend endpoints were needed and added within E15's owned paths: `GET .../billing/usage-vs-plan` (the doc's "Exposes" section already committed to this route; `InvoiceService.usageVsPlan()` reuses `generateForPeriod`'s periodFraction math for a paid plan, but compares a `trialTotalCap` plan like free-trial against the real lifetime `Unit` count instead — a calendar-month slice of a 500-unit _lifetime_ trial cap would be nonsensical) and `GET/DELETE .../billing/payment-methods[/:id]` (`PaymentService.listPaymentMethods`/`revokePaymentMethod`, doc-specified but not yet built pre-T11; strips `authorizationCode` from every response, soft-deletes via `revokedAt`, auto-promotes the next method to default). The doc's "Add card" via a standalone ₦100/£1 verification charge is **not built** — it needs the fake gateway to support refunds, which nothing else in E15 needs; a card is saved automatically the first time any invoice is paid (already true since T8), which the payment-methods page's empty state now says explicitly. Flagged as a deliberate scope cut, not silently dropped.

  The shell-wide restricted banner (AC5's "every console page") needed one file outside E15's owned paths: `apps/web-admin/components/status-banner.tsx` (added a `restricted` variant + `href`) and `apps/web-admin/app/(console)/layout.tsx` (replaced its hardcoded `status="active"` — a pre-existing, acknowledged stub — with a live fetch). Since a tenant's non-owner members also need to see this banner but `GET .../billing/subscription` is owner-only, added `GET .../billing/status` (`@Roles('viewer')`, i.e. any tenant role — returns only `{status}`, nothing else the full subscription payload carries) rather than loosening the owner-only route. Per the hot-spot rule, posted a heads-up comment on E11's issue (#12) before merging these two shared-file edits.

  Live `docker compose up` verification (Playwright, real seeded `ivoryglow` tenant) found and fixed one real bug: `PaymentService.storePaymentMethod`'s dedup loop decrypted every existing `PaymentMethod` row to compare ciphertext, and a single undecryptable leftover row (demo data from an earlier session, encrypted under a since-differing key) crashed the whole `Array.find`, which failed the BullMQ `process-webhook` job for an _unrelated_, real, current payment — silently leaving a paid checkout stuck at `issued` forever. Fixed by treating a decrypt failure as "not a match" (try/catch per candidate, logged, skipped) instead of aborting the method; regression test added. All live-verification demo mutations reverted afterward.

- [x] T12 Platform-support view: real path is `apps/web-admin/app/(console)/support/subscriptions/**` — the doc's owned-path sketch assumed a separate top-level `app/(support)/**` route group, but E18's real shell is `app/(console)/support/**` (nested inside `(console)`, gated by its own `support/layout.tsx`), not a sibling of `(console)`. `page.tsx`: a table of every subscription across all tenants (tenant name/slug, plan, status, currency, MRR, next invoice date, overdue amount), `status`/`currency` filters, a `Sheet` drawer listing that tenant's invoices, **Mark paid** (a `Dialog` requiring a non-empty reason) on any `issued` invoice. Nav entry added to `nav.config.ts` (`platformRole: 'support'`, section `platform`) — the doc's route group already existing with pre-registered nav (like `billing`'s) turned out not to be true here, so this one needed a new entry, per the hot-spot rule's own normal "add a route group + one nav entry" allowance.

  Backend: `PlatformSubscriptionsController` (`@Controller('v1/platform/subscriptions')`, `@PlatformRole('support')`, matching the `v1/support/quotas`-style convention already used for support-only routes elsewhere) — `GET` (list, joins `Subscription`+`Plan` against `Tenant` in memory since `Subscription.tenantId` is a plain scalar with no Prisma relation), `GET /:tenantId/invoices` (drawer data), `POST /:id/mark-paid` (`:id` = invoiceId, not subscriptionId — `@Audited`'s default target resolver reads `req.params.id`, so naming it `:id` records the right target with no extra config). `PaymentService.markPaidManually(invoiceId, reason)` records a `Payment` (`provider: 'manual'`, already `succeeded`) and goes through the same `InvoiceService.markPaid` + `payment.succeeded` emit a real webhook would, so `DunningService`'s reactivation-on-payment listener fires identically for a restricted tenant settled by bank transfer.

  **Bug found and fixed, unrelated to my own new code:** verifying this live 404'd on every request to `/support/subscriptions` — and to the _pre-existing_ `/support` page too. Root cause: `support/layout.tsx` (E18-owned) calls Next's `notFound()` based on `useAuth().platformRole` with no `hasBootstrapped` guard; since that route is statically prerendered, Next executes the client component once at _build time_ with no auth context (`platformRole` is `null`), and the resulting `notFound()` gets baked permanently into the static output — no client hydration afterward can undo it. Fixed with the same one-line `if (!hasBootstrapped) return null;` guard `apps/web-admin/app/(console)/billing/layout.tsx` (T11) already uses successfully in production. Posted on E18's issue (#19) first, per the hot-spot rule, since `support/layout.tsx` isn't E15's file.

  6 new integration tests (`platform-subscriptions.controller.integration.spec.ts`) instantiate the controller directly against real Postgres, matching this module's established pattern.

- [x] T13 Playwright E2E: `tests/e2e/billing/plan-and-dunning.spec.ts`, two tests under `test.describe.serial` (both mutate the real seeded `ivoryglow` tenant's `Subscription`/`Invoice` rows and can't run concurrently against each other — cross-file `--workers` isolation doesn't apply to two tests sharing one resource, so they're one file, not two, despite covering two named ACs). Each reverts its own mutations in a `finally` block, including on failure — verified live by deliberately breaking an assertion mid-run and confirming the tenant came back clean.

  **AC3** (upgrade → pay on real fake checkout → paid invoice → PDF): logs in as `ivoryglow`'s real owner, drives the actual `/billing/change-plan` UI (Starter → Growth, since `ivoryglow` is seeded already past the free-trial stage the doc's "trial cap" phrasing assumed — AC2's trial-cap flow is separately covered by its own already-closed manual verification, not re-derived here), through the real fake-pay checkout, then asserts the plan, the paid invoice, the `invoice.paid` Mailpit email, and — via a direct authenticated API call, since Playwright's `download` event doesn't expose response headers — the PDF's `content-type` and byte size.

  **AC5/AC6** (dunning → restricted → pay → reactivated): real day-scale dunning retries (1/3/7-day BullMQ delays) aren't E2E-automatable without `BILLING_CLOCK_SKEW_SECONDS` set on the running compose stack — a container-level env, not per-test-togglable, since `BillingClock` reads it via `loadEnv()`, which memoizes at process scope. That schedule itself is already covered by `dunning.service.integration.spec.ts` and was verified live against a clock-skewed stack for T9 (evidence on issue #16). This test seeds dunning's _outcome_ directly via Prisma (a restricted subscription with one outstanding invoice) and automates the genuinely UI-testable part: the shell-wide restricted banner (asserted on the Dashboard, not a billing page, to prove it's not `/billing`-only) and the pay-to-reactivate round trip. Found live: the webhook that flips `Subscription.status` back to `active` is processed asynchronously by `api-worker`'s BullMQ job, not synchronously with the checkout redirect — the test polls rather than asserting immediately, same idiom as `fixtures/mailpit.ts`'s `waitForEmail`.

  Two pre-existing gaps in shared `tests/e2e/fixtures/**` filled in along the way (not new bugs from this task, both explicitly marked `TODO(E15)`/latent):
  - `fixtures/pay.ts`'s `payOnFakeCheckout` was a stub explicitly marked `TODO(E15)` by whichever epic scaffolded it — implemented for real (clicks **Pay** on the real fake-pay checkout page, waits for its `?result=success` redirect).
  - `fixtures/mailpit.ts` read `process.env.MAILPIT_API_URL`, which is never actually set anywhere (`docker/compose.yml` only exposes `MAILPIT_UI_PORT`, per-worktree offset) — every prior use of this fixture would have silently connected to the wrong (unoffset, default-8025) port on any worktree but the main checkout. Fixed to derive the URL from `MAILPIT_UI_PORT`.

  Run: `npx playwright test tests/e2e/billing --project=web-admin-desktop` against this worktree's own `docker compose up` — 2/2 passing, twice in a row (~4s total).

- [x] T14 Docs: `docs/billing-pricing-and-proration.md` finalised in T10 (proration rules, worked NGN/GBP examples, HTTP routes, and its own "Paystack go-live checklist" section — business verification, live webhook URL, test-vs-live keys, re-running T6's contract tests against a live fixture, rotating `BILLING_PAYMENT_METHOD_ENC_KEY`). Pointer to that checklist added to this file's own "Notes and decisions" section, per this task's literal wording.

## Acceptance criteria

- [x] AC1 `docker compose up`, `pnpm db:seed` → `curl localhost:4000/v1/billing/plans -H "Authorization: Bearer $TOKEN"` returns the four plans with NGN and GBP prices in minor units; tenant `ivoryglow` has `Subscription.status = trialing`, `trialEndsAt` 30 days out. Verified (evidence on issue #16).
- [x] AC2 Trial cap: as `ivoryglow` owner, mint batches totalling 500 units (E04 `POST /tenants/ivoryglow/batches` — note, no `/v1` prefix on E04's real route, unlike this doc's original guess), then mint 1 more → HTTP 402. Verified shape: `{ statusCode:402, timestamp, message: { error:'entitlement', reason, upgradeHint:'/billing/change-plan', code:'plan_limit', limit:500, used:500 } }` — the `message` nesting is E17's `GlobalExceptionFilter` wrapping every `HttpException` (see CROSS-EPIC-REQUESTS.md's E17 section; same envelope E06/E09 already had to work around), not something E15 controls. `GET /v1/verify/<any existing code>` still returns a verdict (verified: `{"verdict":"ok",...}` 200).
- [x] AC3 Upgrade + pay: verified live end-to-end against `docker compose up` (Playwright) on the real seeded `ivoryglow` tenant (starter → growth, since it's already past the free-trial stage this doc's original phrasing assumed): `/billing/change-plan` → **Select** Growth → preview dialog shows credit/charge/net → **Confirm** → redirected to the real fake checkout (`http://localhost:<fake-pay-port>/checkout/<ref>`) → **Pay** → back in web-admin the plan card shows _Growth · Active_ with re-based included allowances, `/billing/invoices` shows the proration invoice `paid`, and Mailpit has the `invoice.paid` email. This run is what surfaced and proved the `storePaymentMethod` bug fix above (first attempt: invoice stuck `issued` because the webhook job crashed; confirmed `paid` after the fix + reprocessing the same event). Minting after the upgrade returns the product/OEM-lookup error, not a 402 — confirms the entitlement gate isn't blocking on the new plan.
- [x] AC4 Invoice run: `pnpm --filter api cli billing:run-invoices --tenant ivoryglow --period 2026-08` (E21 hasn't shipped its invoice-fixtures seed yet — manually seeded the same `UsageSummary` numbers it's supposed to provide: 12,000 units, 60,000 scans on starter) produces an invoice with lines `plan_fee 4,500,000`, `unit_overage 2,000 × 800 = 1,600,000`, `scan_overage 10,000 × 50 = 500,000`, total `6,600,000` kobo — verified exactly (evidence on issue #16). `GET …/invoices/<id>/pdf` downloads a PDF whose text contains `₦66,000.00` — verified against the real route on `docker compose up` (evidence on issue #16).
- [x] AC5 Dunning to restricted: verified live against `docker compose up` with a synthetic tenant (`ac5demo` — the real product flows can't produce a `-FAIL` authorization code, so a `PaymentMethod` with one was inserted directly, ciphertext computed and piped in rather than hand-transcribed) and `BILLING_CLOCK_SKEW_SECONDS` compressing a day to 1s: issuing the invoice drove exactly three `payment.failed` events and three distinct `invoice.failed` emails in Mailpit (after the idempotency-key fix above — first run produced only one), then `Subscription.status = restricted`; `POST …/batches` → 403, `GET /v1/verify/<code>` → 200 throughout. Evidence posted on issue #16. Web-admin's restricted banner itself is T11 (not yet built), so this AC's UI half is deferred to that task.
- [x] AC6 Reactivation: same `ac5demo` tenant, `POST …/invoices/:id/pay` (now `@AllowWhenSuspended()`) → real fake checkout → **Pay** → real signed webhook → `Subscription.status = active` within the same request cycle, `subscription.reactivated` notification sent. Evidence posted on issue #16. Demo data fully cleaned up afterward (11 `DELETE`s, all confirmed).
- [x] AC7 Webhook security: `curl -X POST localhost:4000/v1/billing/webhooks/paystack -d '{}' -H 'x-paystack-signature: bad'` → 401 — verified against `docker compose up`. Paid `ivoryglow`'s real invoice through the real fake-pay checkout end-to-end (`POST .../invoices/:id/pay` → real fake checkout → click Pay → real signed webhook → `api-worker` consumes the `process-webhook` job → `Payment.status='succeeded'`, `Invoice.status='paid'`, a `PaymentMethod` stored) and confirmed exactly one `Payment` row for the reference (`SELECT count(*) ... = 1`) — closes both halves of this AC.
- [x] AC8 Role gate: verified live — logged in as `operator@ivoryglow.local`, `/billing` shows the "Owner access required" `EmptyState` (the `Billing` nav entry is also correctly absent from the sidebar, driven by `nav.config.ts`'s existing `minRole: 'owner'`), and `GET .../billing/subscription` with the operator's token returns 403.
- [x] AC9 Support view: verified live as `support@verifyng.local` — `/support/subscriptions` lists every seeded tenant (real path; the doc's `/subscriptions` at the app root doesn't exist, see T12) with plan/status, including `IVORY GLOW · Starter · active`; the status filter correctly narrows the table to just `active`. Opened the drawer, added a synthetic overdue `issued` invoice for `ivoryglow`, clicked **Mark paid**, entered a reason, confirmed — invoice flipped to `paid` in the drawer and the table's Overdue column, and `SELECT * FROM "AuditLog" WHERE action='billing.invoice.mark_paid'` shows `payload: {"reason": "Bank transfer confirmed by finance, ref #TX-88213"}` exactly as typed. Synthetic invoice removed afterward.

## Testing

- Unit: subscription state machine (every transition, every illegal transition), proration calculator against each documented example, invoice pricing with `periodFraction` edge cases (mid-period signup, leap February), dunning scheduler with `FakeClock`, Paystack signature verification (positive/negative/tampered body).
- Integration (real Postgres + Redis): invoice generation from a seeded `UsageSummary`; webhook idempotency; `EntitlementService.assertCanMint` counter correctness after concurrent mints (10 parallel requests at the cap → exactly one succeeds); restricted round-trip with E03's real guard.
- E2E (Playwright): AC3 and AC5/AC6 flows (`tests/e2e/billing/plan-and-dunning.spec.ts`, T13); PDF download asserts content-type and size > 5 KB (not this line's original >10 KB guess — see T13's notes, every real invoice PDF this renderer produces lands around 8.3-8.4 KB regardless of line-item count). Owner/operator role visibility (AC8) is verified live manually (evidence on issue #16), not by a dedicated automated spec — the owner-only `EmptyState` gate and the 403 are both simple enough that `billing/layout.tsx` (T11) and `TenantBillingController`'s `@Roles('owner')` are the tests that matter; a browser-level visibility spec would just re-assert what those already guarantee.
- Contract: `tools/fakes/pay` request/response shapes validated against recorded Paystack fixtures in `apps/api/src/modules/billing/__fixtures__/paystack/*.json` so the fake cannot drift from the real API.

## Compose services added

None new. `fake-pay` (port 4102, already declared by E00) gets its real implementation here:

| Service  | Image           | Host port | Env                                                                                                 |
| -------- | --------------- | --------- | --------------------------------------------------------------------------------------------------- |
| fake-pay | tools/fakes/pay | 4102      | `FAKE_PAY_SECRET=fake_sk_test`, `FAKE_PAY_WEBHOOK_URL=http://api:4000/v1/billing/webhooks/paystack` |

`api` gets `PAYMENT_GATEWAY=fake`, `PAYSTACK_BASE_URL=http://fake-pay:4102`, `PAYSTACK_SECRET_KEY=fake_sk_test`.

## Notes and decisions

- **Pricing lives here only.** E12 emits counts; if a price appears anywhere outside `Plan` rows and `InvoiceService`, it is a bug.
- **Minor units, integer math.** Kobo and pence; rounding half-up at line level; totals are sums of rounded lines.
- **Currency is fixed per subscription.** Switching NGN↔GBP is a support action that cancels and recreates the subscription (rare; not automated).
- **`restricted` vs `suspended`.** `suspended` (E03) is a platform/compliance action; `restricted` is billing-driven and self-healing on payment. Both block writes and keep verify open. E03 owns the guard; E15 asks E03 to add the `restricted` value (change request filed on E03's issue).
- **Paystack specifics.** Amounts are sent in kobo/pence already; webhook signature is HMAC-SHA512 of the raw body with the secret key; `charge_authorization` requires the customer email that created the authorization. Live mode needs CAC documents and a settlement account — see `production-readiness.md` Nigeria/UK notes.
- **Paystack go-live checklist** (business verification, live webhook URL, test-vs-live keys, re-running the T6 contract tests against a live fixture, rotating `BILLING_PAYMENT_METHOD_ENC_KEY`) — full checklist in `docs/billing-pricing-and-proration.md`'s "Paystack go-live checklist" section (T14). Not yet actioned; `PAYMENT_GATEWAY=fake` is the only mode exercised anywhere in this repo today.
- **Enterprise** is invoice-only: `PlanService` marks it `customPricing`, `InvoiceService` skips automatic runs, support creates invoices with manual `adjustment` lines.
- **Fake gateway = Paystack wire format.** One adapter, two base URLs; the fake's hosted checkout is the only piece with no real-world equivalent (Paystack hosts its own).
- Flutterwave/Stripe: implement `PaymentGatewayPort`, add a `PaymentProvider` enum value, nothing else should change.
