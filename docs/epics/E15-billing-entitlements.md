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
PaymentService; // initialise(invoiceId) → { checkoutUrl }, verify(reference), handleWebhook(rawBody, signature), chargeAuthorisation(invoiceId)
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
- [x] T2 `SubscriptionService` state machine: `trialing → active | restricted(trial_expired)`, `active → past_due → active | restricted`, `* → cancelled`. Listens to E03's `tenant.verified` (the real event E03 fires on activation — see Notes; the doc's original `tenant.activated` name doesn't exist) to `startTrial()`; currency from `Tenant.country`. Nightly BullMQ cron `billing.period-roll` advances periods and expires trials — registered inline only under `WORKER_INLINE=true` for now (compose's `api-worker` wiring is a follow-up, see PR #72). Unit/integration tests for every transition; illegal transitions throw `IllegalSubscriptionTransition`.
- [x] T3 `EntitlementService implements EntitlementPolicy`: real interface is `canMint(ctx): Promise<EntitlementCheck>` (apps/api/src/modules/batches/entitlement.policy.ts), not the doc's original `assertCanMint`/throwing sketch — E04 already computes `existingUnitsThisYear` synchronously per mint call (`Unit` count), so no separate Redis counter is needed. Checks it against `includedUnitsPerYear` when `features.trialTotalCap` or `features.hardCap` is set (paid plans default: overage allowed, no cap); `hasFeature` reads `Plan.features`; `limitsFor()` returns `apiRateLimitPerMin`, `maxApiKeys` for E13/E16. Registered against E04's `ENTITLEMENT_POLICY` token in `BatchesModule` (E04 file, pre-agreed in CROSS-EPIC-REQUESTS.md). `EntitlementCheck` extended (additive) with `code`/`limit`/`used` so `MintService`'s existing 402 carries them — see AC2.
- [x] T4 `InvoiceService.generateForPeriod`: pulls E12 `UsageSummary` (real read path: `UsageReadService.summary`, only `finalisedAt`-set rows), prices `plan_fee` + `unit_overage` (max(0, minted − included·periodFraction)) + `scan_overage`, freezes `usageSnapshot`, assigns `number`, `issue()` sets `dueAt = +7d`, emits `invoice.issued`. Sending the `invoice.issued` mail is deferred to land with T5 (it needs the PDF attachment T5 builds; wiring a plain-text send now that T5 immediately supersedes isn't worth it — see PR notes). Cron `billing.invoice-run` folded into `billing.period-roll`: bills the period that's ending, best-effort per tenant, before rolling the subscription forward. `pnpm --filter api cli billing:run-invoices --tenant <slug> --period <YYYY-MM>` added (own minimal `BillingCliModule`, mirrors `jobs:run`'s rationale — pulling in `TenantsModule` breaks under tsx, a pre-existing decorator-metadata gap, so the CLI provides `InvoiceService`+`UsageReadService` directly rather than importing `BillingModule`). Integration tests with seeded `UsageSummary` assert exact line amounts (AC4's numbers) plus periodFraction edge cases.
- [x] T5 Invoice PDF: `renderPdf()` with `@react-pdf/renderer` (already a repo dependency; used instead of the doc's original `pdfkit` guess) — tenant legal name (Tenant has no `address` field anywhere, so that part of the doc's sketch is dropped), lines, totals, currency formatting for NGN/GBP, payment instructions. Route `…/invoices/:id/pdf` (not the dot-suffix `:id.pdf` this doc originally sketched — verified live that NestJS's route matching, unlike plain Express, resolves a `.pdf`-suffixed request to the plain `:id` route instead of a more specific `:id.pdf` one, regardless of declaration order; `:id/pdf` sidesteps the ambiguity entirely). Bundled `apps/api/assets/fonts/NotoSans-Regular.ttf` (Google Fonts, OFL) — the PDF standard-14 Helvetica font has no glyph for `₦` (U+20A6), so AC4's `₦66,000.00` rendered as a broken-character box until this was registered; bundled locally rather than fetched, so PDF rendering stays fully offline in `docker compose up`. Golden-file test (`pdf-parse` extracts the rendered text and asserts every line/total amount, incl. `₦66,000.00`).
- [ ] T6 `PaymentGatewayPort` + `PaystackGateway`: initialise (`/transaction/initialize`), verify (`/transaction/verify/:ref`), charge authorisation (`/transaction/charge_authorization`), HMAC-SHA512 webhook signature check, `parseWebhook`. Recorded HTTP fixtures (nock) for tests; no live calls in CI. `POST /v1/billing/webhooks/paystack` uses `rawBody`, rejects bad signatures with 401, dedupes via `GatewayWebhookEvent.id`, acks 200 within 5s and processes on a BullMQ job.
- [ ] T7 `tools/fakes/pay` real behaviour (replaces E00 stub; Node + Hono, port 4102): `POST /transaction/initialize` → `{ authorization_url: http://localhost:4102/checkout/:ref }`; `GET /checkout/:ref` hosted page with **Pay** and **Fail** buttons and a card-last4 input; clicking fires a Paystack-shaped `charge.success`/`charge.failed` webhook to `FAKE_PAY_WEBHOOK_URL` signed with `FAKE_PAY_SECRET`; `GET /transaction/verify/:ref`; `POST /transaction/charge_authorization` succeeds unless authorization code ends in `-FAIL`; `GET /admin` lists all transactions; `GET /health`. `FakePayGateway` adapter is the Paystack adapter pointed at `FAKE_PAY_URL` (same wire format) — so one adapter, two base URLs.
- [ ] T8 `PaymentService`: `initialise(invoiceId)` creates `Payment(pending)` + gateway session; `handleWebhook` → `markPaid` + stores `PaymentMethod` from `authorization` when `reusable`; `chargeAuthorisation(invoiceId)` for recurring using default method. Emits `payment.succeeded|failed`. Idempotent: a second `charge.success` for the same reference is a no-op.
- [ ] T9 `DunningService`: on `invoice.issued`, if a default `PaymentMethod` exists, auto-charge at `dueAt`; on failure schedule retries at +1d, +3d, +7d (BullMQ delayed jobs, `jobId = invoice:<id>:attempt:<n>`), send `invoice.due` (T−2d), `invoice.failed` (each failure), `invoice.paid`; after the third failure → `Subscription.status = restricted`, call E03 `setRestricted`, emit `subscription.restricted`, send `subscription.restricted`. On `payment.succeeded` for a restricted tenant → `active`, `clearRestricted`, `subscription.reactivated`. Env `BILLING_DUNNING_SCHEDULE_DAYS=1,3,7` and `BILLING_CLOCK_SKEW_SECONDS` so tests and demos can compress time via a `FakeClock` provider.
- [ ] T10 Plan change with proration: upgrade effective now — credit unused fraction of old plan fee, charge fraction of new fee for remaining days on an immediate `proration` invoice, included units re-based to new plan; downgrade scheduled at `currentPeriodEnd` (`pendingPlanId`), blocked if current-year units already exceed the target plan's included units unless `?force=true` (owner acknowledges overage). Rules written in `docs/billing-pricing-and-proration.md` with worked NGN and GBP examples; unit tests mirror each example.
- [ ] T11 web-admin `app/(console)/billing/**` (owner only; operators/viewers get an `EmptyState` "Ask your owner"): `page.tsx` overview (plan card, trial countdown, usage-vs-included bars for units and scans from `usage-vs-plan`, projected overage), `invoices/` list + detail + PDF download, `payment-methods/` list/remove + "Add card" (goes through a ₦100 / £1 verification charge that is refunded on the fake), `change-plan/` comparison table + proration preview modal. Nav entry `billing` registered in `nav.config.ts` with `roles: ['owner']`. Restricted banner component shown across the whole console when `Subscription.status = restricted`, linking to the unpaid invoice.
- [ ] T12 Platform-support view `app/(support)/subscriptions/**`: table of every subscription (tenant, plan, status, currency, MRR, next invoice, overdue amount), filters, drawer with invoices, "Mark paid (bank transfer)" action with mandatory reason → `POST /v1/platform/subscriptions/:id/mark-paid` (`@Audited`).
- [ ] T13 Playwright E2E: trial cap → upgrade → pay on fake checkout → invoice PDF; dunning → restricted → pay → reactivated (using compressed clock).
- [ ] T14 Docs: `docs/billing-pricing-and-proration.md` finalised; Paystack go-live checklist (business verification, webhook URL, test vs live keys) in Notes.

## Acceptance criteria

- [x] AC1 `docker compose up`, `pnpm db:seed` → `curl localhost:4000/v1/billing/plans -H "Authorization: Bearer $TOKEN"` returns the four plans with NGN and GBP prices in minor units; tenant `ivoryglow` has `Subscription.status = trialing`, `trialEndsAt` 30 days out. Verified (evidence on issue #16).
- [x] AC2 Trial cap: as `ivoryglow` owner, mint batches totalling 500 units (E04 `POST /tenants/ivoryglow/batches` — note, no `/v1` prefix on E04's real route, unlike this doc's original guess), then mint 1 more → HTTP 402. Verified shape: `{ statusCode:402, timestamp, message: { error:'entitlement', reason, upgradeHint:'/billing/change-plan', code:'plan_limit', limit:500, used:500 } }` — the `message` nesting is E17's `GlobalExceptionFilter` wrapping every `HttpException` (see CROSS-EPIC-REQUESTS.md's E17 section; same envelope E06/E09 already had to work around), not something E15 controls. `GET /v1/verify/<any existing code>` still returns a verdict (verified: `{"verdict":"ok",...}` 200).
- [ ] AC3 Upgrade + pay: in web-admin `http://localhost:3001/billing/change-plan` choose **starter**, see the proration preview, confirm → redirected to `http://localhost:4102/checkout/<ref>`; click **Pay** → back in web-admin within 5s the plan card shows _Starter · active_, `GET …/billing/invoices` shows the proration invoice `paid`, and Mailpit (`http://localhost:8025`) has an `invoice.paid` email. Minting the 501st unit now succeeds.
- [x] AC4 Invoice run: `pnpm --filter api cli billing:run-invoices --tenant ivoryglow --period 2026-08` (E21 hasn't shipped its invoice-fixtures seed yet — manually seeded the same `UsageSummary` numbers it's supposed to provide: 12,000 units, 60,000 scans on starter) produces an invoice with lines `plan_fee 4,500,000`, `unit_overage 2,000 × 800 = 1,600,000`, `scan_overage 10,000 × 50 = 500,000`, total `6,600,000` kobo — verified exactly (evidence on issue #16). `GET …/invoices/<id>/pdf` downloads a PDF whose text contains `₦66,000.00` — verified against the real route on `docker compose up` (evidence on issue #16).
- [ ] AC5 Dunning to restricted: with `BILLING_CLOCK_SKEW_SECONDS` compressing days to seconds and a default card whose authorization ends `-FAIL`, issue an invoice → three `payment.failed` events, three `invoice.failed` emails in Mailpit, then `Subscription.status = restricted`, `Tenant` in restricted mode: `POST …/batches` → 403 from E03's guard, `GET /v1/verify/<code>` → 200. Web-admin shows the red restricted banner on every console page.
- [ ] AC6 Reactivation: from the banner click _Pay now_ → fake checkout → **Pay** → within 5s `Subscription.status = active`, banner gone, minting works, `subscription.reactivated` in the audit log (`http://localhost:3001/audit` filtered by `billing`).
- [ ] AC7 Webhook security: `curl -X POST localhost:4000/v1/billing/webhooks/paystack -d '{}' -H 'x-paystack-signature: bad'` → 401; replaying a captured valid webhook twice → second returns 200 but creates no second `Payment` (check `SELECT count(*) FROM "Payment" WHERE reference = …` = 1).
- [ ] AC8 Role gate: logged in as `operator` (E21 seed user), `http://localhost:3001/billing` shows the owner-only empty state and `GET …/billing/subscription` returns 403.
- [ ] AC9 Support view: as `support`, `http://localhost:3001/subscriptions` lists all three seeded tenants with plan/status; _Mark paid_ with reason on an issued invoice flips it to `paid` and the audit entry carries `reason`.

## Testing

- Unit: subscription state machine (every transition, every illegal transition), proration calculator against each documented example, invoice pricing with `periodFraction` edge cases (mid-period signup, leap February), dunning scheduler with `FakeClock`, Paystack signature verification (positive/negative/tampered body).
- Integration (real Postgres + Redis): invoice generation from a seeded `UsageSummary`; webhook idempotency; `EntitlementService.assertCanMint` counter correctness after concurrent mints (10 parallel requests at the cap → exactly one succeeds); restricted round-trip with E03's real guard.
- E2E (Playwright): AC3 and AC5/AC6 flows; owner/operator role visibility; PDF download asserts content-type and size > 10 KB.
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
- **Enterprise** is invoice-only: `PlanService` marks it `customPricing`, `InvoiceService` skips automatic runs, support creates invoices with manual `adjustment` lines.
- **Fake gateway = Paystack wire format.** One adapter, two base URLs; the fake's hosted checkout is the only piece with no real-world equivalent (Paystack hosts its own).
- Flutterwave/Stripe: implement `PaymentGatewayPort`, add a `PaymentProvider` enum value, nothing else should change.
