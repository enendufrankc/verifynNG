# Billing: pricing and proration (E15)

Source of truth for plan prices is `packages/db/src/plan-catalogue.ts` (`PLANS`) — this document explains the _rules_ applied to those numbers, not the numbers themselves. All money is minor units (kobo for NGN, pence for GBP); no floats anywhere in this module.

## Plan change direction

`SubscriptionService.changePlan(tenantId, planCode, opts)` compares `Plan.sortOrder` (not price — enterprise is `0`-priced/custom) between the current and target plan:

- **higher `sortOrder` → upgrade**: effective immediately.
- **lower `sortOrder` → downgrade**: scheduled for `currentPeriodEnd`.
- same plan is a no-op; a plan on either side with `features.customPricing` (enterprise) is rejected — those are invoiced manually by support, same rule `InvoiceService.generateForPeriod` already applies to a subscription already on that plan.

## Upgrade: immediate proration invoice

On an upgrade:

1. `Subscription.planId` switches to the target plan **now** — the next mint call is immediately entitled against the new plan's `includedUnitsPerYear`. A `trialing` subscription also moves to `active`; `active`/`past_due` keep their status.
2. The remaining fraction of the _current_ billing period (`currentPeriodStart` → `currentPeriodEnd`) is priced twice — once at the old plan's monthly fee (credit) and once at the new plan's (charge) — and the **net** (charge − credit) becomes a single proration invoice, issued immediately (`dueAt` = +7 days, same as a regular invoice). A net of zero or negative produces no invoice; this catalogue doesn't issue standalone refunds for a net credit.
3. Regular monthly invoicing resumes unchanged at the next `billing.period-roll` — the proration invoice is a one-off adjustment, not a change to `currentPeriodEnd`.

```
remainingFraction = max(0, currentPeriodEnd - now) / (currentPeriodEnd - currentPeriodStart)
creditMinor       = round(oldPlan.monthlyFeeMinor * remainingFraction)
chargeMinor       = round(newPlan.monthlyFeeMinor * remainingFraction)
netMinor          = chargeMinor - creditMinor
```

### Worked example — NGN, starter → growth, exactly half the period left

30-day period, upgrade with exactly 15 days remaining (`remainingFraction = 0.5`):

|                   |                  starter |                     growth |
| ----------------- | -----------------------: | -------------------------: |
| monthly fee       | ₦45,000 (4,500,000 kobo) | ₦180,000 (18,000,000 kobo) |
| half-period value |      ₦22,500 (2,250,000) |        ₦90,000 (9,000,000) |

- `creditMinor` = 2,250,000
- `chargeMinor` = 9,000,000
- `netMinor` = **6,750,000 kobo (₦67,500)** — the proration invoice's `totalMinor` at `BILLING_TAX_RATE_BPS_NGN=0`.

Mirrored exactly in `subscription.service.integration.spec.ts`'s `'upgrade (starter -> growth) issues a proration invoice...'` test.

### Worked example — GBP, starter → growth, same half-period fraction

|                   |              starter |                 growth |
| ----------------- | -------------------: | ---------------------: |
| monthly fee       | £25.00 (2,500 pence) | £100.00 (10,000 pence) |
| half-period value |       £12.50 (1,250) |         £50.00 (5,000) |

- `creditMinor` = 1,250
- `chargeMinor` = 5,000
- `netMinor` = **3,750 pence (£37.50)**.

Same formula, same code path — `Subscription.currency` (fixed at creation from `Tenant.country`) picks which of `monthlyPriceNgnMinor`/`monthlyPriceGbpMinor` to read; no separate GBP branch exists in the implementation.

## Downgrade: scheduled at period end, capped

A downgrade never invoices immediately. `Subscription.pendingPlanId` is set to the target plan; the nightly `billing.period-roll` (`SubscriptionService.runPeriodRoll`) applies it — `planId = pendingPlanId`, `pendingPlanId = null` — in the same pass that rolls `currentPeriodStart`/`currentPeriodEnd` forward and bills the period that just ended (at the _old_ plan's rates, since the switch hasn't taken effect yet).

**Cap check:** if the tenant's current `Unit` count (`prisma.unit.count({ where: { tenantId } })` — the same query `MintService` uses for entitlement checks) exceeds the target plan's `includedUnitsPerYear`, the downgrade is rejected with a `ConflictException` (`downgrade_exceeds_target_plan`, carrying `used`/`limit`) unless the caller passes `force: true` — the owner explicitly acknowledging they'll be over the new plan's included allotment (paid plans don't hard-block overage minting; this is a heads-up, not a second entitlement gate). `enterprise` (unlimited, `includedUnitsPerYear: 0` with `features.customPricing`) can never be a downgrade _target_ — the customPricing guard above rejects it before the cap check runs.

## Preview

`SubscriptionService.previewChangePlan(tenantId, planCode)` runs the same math read-only — no persistence, no throw on an over-cap downgrade (it returns `blockedByUnitsCap: { used, limit }` instead so the web-admin change-plan modal, T11, can show the block and let the owner decide whether to resubmit with `force`). `GET /v1/tenants/:tenantId/billing/subscription/change-plan-preview?planCode=` exposes it.

## HTTP

```
GET  /v1/tenants/:tenantId/billing/subscription/change-plan-preview?planCode=<code>   owner
POST /v1/tenants/:tenantId/billing/subscription/change   owner   { planCode, force? }   @Audited('subscription.change_plan')
```

## Paystack go-live checklist (T14, tracked here per the epic's Notes)

Not yet actioned — `PAYMENT_GATEWAY=fake` (`tools/fakes/pay`) is the only mode exercised in `docker compose up` and CI. Before pointing a real tenant at Paystack:

1. Complete Paystack business verification (bank account, BVN/CAC docs) — a live secret key doesn't process settlements without it.
2. Register the production webhook URL (`https://<api-host>/v1/billing/webhooks/paystack`) in the Paystack dashboard; confirm the HMAC-SHA512 signature check in `PaystackGateway.verifyWebhookSignature` matches Paystack's documented header (`x-paystack-signature`) against the _live_ secret key, not the test one.
3. Swap `PAYSTACK_SECRET_KEY`/`PAYSTACK_PUBLIC_KEY` from test (`sk_test_…`/`pk_test_…`) to live (`sk_live_…`/`pk_live_…`) and set `PAYMENT_GATEWAY=paystack`.
4. Re-run the T6 contract tests (`tools/fakes/pay/contract.test.mjs`) against a captured _live_ fixture, not just the test-mode one, to catch any live/test response-shape drift before it reaches a real tenant.
5. `BILLING_PAYMENT_METHOD_ENC_KEY` must be a real random 32-byte hex value in production — `packages/config/src/env-schema.ts`'s production guard already refuses the all-zero default outside `NODE_ENV=development`.
